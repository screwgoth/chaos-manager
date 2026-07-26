/**
 * ORG-SCOPE ENFORCEMENT — the X-1 proof. Step 6.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────────────┐
 * │ HOW TO VERIFY THESE TESTS ARE REAL                                                     │
 * │                                                                                        │
 * │ Every test in the "must fail against the stand-in" block below is asserted to be        │
 * │ IMPOSSIBLE under a permissive scope. To confirm by hand, edit                           │
 * │ `AuthorizationComponent.resolveScope` to return `orgUnitIds: 'ALL'` for TEAM_LEAD and   │
 * │ run this file: those tests MUST go red. If any stays green it is proving nothing, and   │
 * │ deleting it is better than keeping it.                                                  │
 * │                                                                                        │
 * │ This is not a stylistic preference. Unit 1's first BR-A-24 concurrency test PASSED with │
 * │ the lock removed and had to be thrown away. The equivalent trap here is a scope test    │
 * │ that would have passed against the stand-in the whole time.                            │
 * │                                                                                        │
 * │ `permissiveScopeWouldPass()` below encodes that reasoning as an executable assertion    │
 * │ rather than a comment, so the property is checked on every run.                         │
 * └────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Covers the enforcement points of `business-logic-model.md` §3 that org scope can affect,
 * plus BR-R-13 — the rule most likely to be implemented wrongly.
 */

import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/shared/config';
import { createDb, createPool, runMigrations, type Db } from '../../src/shared/repository';
import type { Services } from '../../src/core-domain/services';
import { AuthorizationComponent } from '../../src/supporting-platform/authorization/authorization-component';
import type { OrgUnitId, VerifiedIdentity } from '../../src/shared/types/domain';

const CONNECTION = process.env.TEST_DATABASE_URL;
const describeDb = CONNECTION ? describe : describe.skip;

const PASSWORD = 'enforcement-password-long';

function testConfig(): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'silent',
    databaseUrl: CONNECTION as string,
    session: { cookieName: 'chaos_session', cookieSecure: false, idleMinutes: 30 },
    contractExpiryWarnDays: 30,
    argon2: { memoryKiB: 8192, iterations: 1, parallelism: 1 },
    bootstrap: { adminUsername: null, adminPassword: null },
    staticDir: null,
    import: { maxRows: 2000, maxBytes: 5 * 1024 * 1024 },
  } as AppConfig;
}

describeDb('org-scope enforcement (X-1 resolution)', () => {
  let db: Db;
  let app: FastifyInstance;
  let services: Services;

  let adminCookie: string;
  let platformLeadCookie: string;
  let salesLeadCookie: string;
  let rootRmCookie: string;
  let childRmCookie: string;
  let strandedLeadCookie: string;

  let rootId: string;
  let platformId: string;
  let salesId: string;
  let adaId: string; // Platform member, 130% in August across two org units' projects
  let samId: string; // Sales member, staffed on a PLATFORM-owned project
  let platProjectId: string;
  let engineerRoleId: string;
  let salesProjectId: string;

  function cookieFrom(headers: Record<string, unknown>): string {
    const raw = headers['set-cookie'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value).split(';')[0] as string;
  }

  async function signIn(username: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password: PASSWORD },
    });
    if (response.statusCode !== 200) throw new Error(`sign-in failed: ${response.body}`);
    return cookieFrom(response.headers as Record<string, unknown>);
  }

  async function get(url: string, cookie: string) {
    return app.inject({ method: 'GET', url, headers: { cookie } });
  }

  beforeAll(async () => {
    const pool = createPool(CONNECTION as string);
    db = createDb(pool);
    await sql`drop schema public cascade`.execute(db);
    await sql`create schema public`.execute(db);
    const migration = await runMigrations(db);
    if (migration.error) throw migration.error;

    const built = buildApp({ db, config: testConfig() });
    app = built.app;
    services = built.services;
    await app.ready();

    await services.identity.createAccount(
      { username: 'admin', role: 'ADMIN', homeOrgUnitId: null },
      PASSWORD,
    );
    adminCookie = await signIn('admin');

    // --- org tree: Organisation > { Platform, Sales } ------------------------
    const mkOrg = async (name: string, parentId: string | null) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/org-units',
        headers: { cookie: adminCookie },
        payload: { name, parentOrgUnitId: parentId },
      });
      if (response.statusCode !== 201) throw new Error(`org unit ${name}: ${response.body}`);
      return response.json().id as string;
    };
    rootId = await mkOrg('Organisation', null);
    platformId = await mkOrg('Platform', rootId);
    salesId = await mkOrg('Sales', rootId);

    // server.ts does this after migrations; the test harness must too (defect U1-D01).
    services.authorization.setRootOrgUnitIds([rootId as OrgUnitId]);

    const mkRef = async (type: string, name: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/reference-data',
        headers: { cookie: adminCookie },
        payload: { referenceType: type, name },
      });
      if (response.statusCode !== 201) throw new Error(`ref ${name}: ${response.body}`);
      return response.json().id as string;
    };
    engineerRoleId = await mkRef('ROLE', 'Engineer');
    const projectTypeId = await mkRef('PROJECT_TYPE', 'Delivery');

    const mkMember = async (fullName: string, email: string, orgUnitId: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: adminCookie },
        payload: {
          fullName,
          email,
          orgUnitId,
          employmentType: 'ON_ROLL',
          roleId: engineerRoleId,
          skillIds: [],
        },
      });
      if (response.statusCode !== 201) throw new Error(`member ${fullName}: ${response.body}`);
      return response.json().id as string;
    };
    adaId = await mkMember('Ada Lovelace', 'ada@example.com', platformId);
    samId = await mkMember('Sam Bench', 'sam@example.com', salesId);

    const mkProject = async (code: string, name: string, owningOrgUnitId: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: adminCookie },
        payload: {
          code,
          name,
          owningOrgUnitId,
          projectTypeId,
          startDate: '2026-01-01',
          plannedEndDate: '2026-12-31',
          description: null,
        },
      });
      if (response.statusCode !== 201) throw new Error(`project ${code}: ${response.body}`);
      return response.json().id as string;
    };
    platProjectId = await mkProject('PLAT-1', 'Platform Rebuild', platformId);
    salesProjectId = await mkProject('DATA-2', 'Reporting Warehouse', salesId);

    const mkAssignment = async (
      memberId: string,
      projectId: string,
      percentage: number,
      confirmOverride = false,
    ) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId,
          projectId,
          allocationPercentage: percentage,
          period: { start: '2026-08-01', end: '2026-08-31' },
          projectRoleId: null,
          overrideOverAllocation: confirmOverride,
        },
      });
      return response;
    };

    // Ada: 80% on a PLATFORM project + 50% on a SALES project = 130%, saved via override.
    // This is the worked example from business-logic-model.md §4.
    const first = await mkAssignment(adaId, platProjectId, 80);
    if (first.statusCode !== 201) throw new Error(`ada plat: ${first.body}`);
    const second = await mkAssignment(adaId, salesProjectId, 50, true);
    if (second.statusCode !== 201) throw new Error(`ada sales: ${second.body}`);

    // Sam is a SALES member staffed on a PLATFORM-owned project — the BR-R-12 project side.
    const third = await mkAssignment(samId, platProjectId, 40);
    if (third.statusCode !== 201) throw new Error(`sam plat: ${third.body}`);

    // --- accounts under test -------------------------------------------------
    const mkAccount = async (
      username: string,
      role: VerifiedIdentity['role'],
      homeOrgUnitId: string | null,
    ) => {
      await services.identity.createAccount({ username, role, homeOrgUnitId }, PASSWORD);
      return signIn(username);
    };
    platformLeadCookie = await mkAccount('plat-lead', 'TEAM_LEAD', platformId);
    salesLeadCookie = await mkAccount('sales-lead', 'TEAM_LEAD', salesId);
    rootRmCookie = await mkAccount('root-rm', 'RESOURCE_MANAGER', rootId);
    childRmCookie = await mkAccount('child-rm', 'RESOURCE_MANAGER', platformId);
    strandedLeadCookie = await mkAccount('stranded-lead', 'TEAM_LEAD', null);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
  });

  /**
   * The executable form of "this test would fail against the stand-in".
   *
   * The stand-in returned `orgUnitIds: 'ALL'` for every role. So any assertion that depends on a
   * TEAM_LEAD seeing FEWER rows than exist is, by construction, impossible to satisfy under it.
   * This helper asserts that the scope actually IS restricted, so if someone reverts the
   * component to a permissive one, these tests fail here with a clear reason rather than
   * mysteriously somewhere downstream.
   */
  function assertScopeIsGenuinelyRestricted(cookieLabel: string, orgUnitId: string): void {
    const auth = new AuthorizationComponent([rootId as OrgUnitId]);
    const scope = auth.resolveScope({
      userAccountId: 'x' as VerifiedIdentity['userAccountId'],
      username: cookieLabel,
      role: 'TEAM_LEAD',
      homeOrgUnitId: orgUnitId as OrgUnitId,
      linkedMemberId: null,
      isActive: true,
    });
    // If this is 'ALL', the stand-in is back and every scope test below is vacuous.
    expect(scope.orgUnitIds).not.toBe('ALL');
    expect(scope.orgUnitIds).toEqual([orgUnitId]);
  }

  describe('MUST FAIL against the permissive stand-in', () => {
    it('the scope really is restricted (guard on the guard)', () => {
      assertScopeIsGenuinelyRestricted('plat-lead', platformId);
      assertScopeIsGenuinelyRestricted('sales-lead', salesId);
    });

    it('a TEAM_LEAD sees only their own org unit members (BR-R-05, BR-R-08)', async () => {
      const response = await get('/api/members', platformLeadCookie);
      expect(response.statusCode).toBe(200);
      const ids = (response.json().items as { id: string }[]).map((m) => m.id);

      expect(ids).toContain(adaId); // Platform
      expect(ids).not.toContain(samId); // Sales — the stand-in WOULD have shown this
      // The total must respect scope too, or it leaks the existence of hidden rows.
      expect(response.json().total).toBe(1);
    });

    it('the other TEAM_LEAD sees the mirror image', async () => {
      const response = await get('/api/members', salesLeadCookie);
      const ids = (response.json().items as { id: string }[]).map((m) => m.id);
      expect(ids).toContain(samId);
      expect(ids).not.toContain(adaId);
    });

    it('a TEAM_LEAD reading an out-of-scope member by id gets 404, not 403 (BR-R-16)', async () => {
      const response = await get(`/api/members/${samId}`, platformLeadCookie);
      // 404 deliberately: 403 would confirm the record exists.
      expect(response.statusCode).toBe(404);
    });

    it('a TEAM_LEAD sees only their own org unit projects', async () => {
      const response = await get('/api/projects', platformLeadCookie);
      const codes = (response.json().items as { code: string }[]).map((p) => p.code);
      expect(codes).toEqual(['PLAT-1']);
    });

    it('a RESOURCE_MANAGER at a CHILD unit is confined (BR-R-09 / CQ2:B)', async () => {
      const response = await get('/api/members', childRmCookie);
      const ids = (response.json().items as { id: string }[]).map((m) => m.id);
      expect(ids).toEqual([adaId]);
    });

    it('a TEAM_LEAD with NO home org unit sees NOTHING — fails closed (BR-R-11)', async () => {
      const members = await get('/api/members', strandedLeadCookie);
      expect(members.statusCode).toBe(200);
      expect(members.json().items).toEqual([]);
      expect(members.json().total).toBe(0);

      const projects = await get('/api/projects', strandedLeadCookie);
      expect(projects.json().items).toEqual([]);
    });
  });

  describe('scope must NOT over-restrict', () => {
    it('a RESOURCE_MANAGER at a ROOT unit sees everything (BR-R-09)', async () => {
      const response = await get('/api/members', rootRmCookie);
      const ids = (response.json().items as { id: string }[]).map((m) => m.id);
      expect(ids).toContain(adaId);
      expect(ids).toContain(samId);
      expect(response.json().total).toBe(2);
    });

    it('an ADMIN still sees everything', async () => {
      const response = await get('/api/members', adminCookie);
      expect(response.json().total).toBe(2);
    });

    /**
     * BR-R-08's subtree: a lead at the ROOT unit must see members of CHILD units.
     *
     * This is the assertion that would have caught the second bug in `targetInScope`, where
     * comparing a target against scope ROOTS (which exclude children) wrongly denied access.
     */
    it('a TEAM_LEAD at the ROOT unit sees members in CHILD units (subtree, not just the root)', async () => {
      await services.identity.createAccount(
        { username: 'root-lead', role: 'TEAM_LEAD', homeOrgUnitId: rootId },
        PASSWORD,
      );
      const cookie = await signIn('root-lead');
      const response = await get('/api/members', cookie);
      const ids = (response.json().items as { id: string }[]).map((m) => m.id);
      // Neither Ada nor Sam is IN the root unit — both are in children.
      expect(ids).toContain(adaId);
      expect(ids).toContain(samId);
    });
  });

  describe('BR-R-12 — assignment visible via member OR project', () => {
    it('the PROJECT side grants visibility of an out-of-org member assignment', async () => {
      // Sam is a SALES member, but assigned to PLAT-1 which Platform owns.
      const response = await get(`/api/assignments?projectId=${platProjectId}`, platformLeadCookie);
      expect(response.statusCode).toBe(200);
      const memberIds = (response.json().items as { memberId: string }[]).map((a) => a.memberId);
      expect(memberIds).toContain(samId);
    });

    it('the MEMBER side grants visibility of an out-of-org project assignment', async () => {
      // Ada is a PLATFORM member assigned to DATA-2, which Sales owns.
      const response = await get(`/api/assignments?memberId=${adaId}`, platformLeadCookie);
      const projectIds = (response.json().items as { projectId: string }[]).map((a) => a.projectId);
      expect(projectIds).toContain(salesProjectId);
    });

    it('an assignment touching neither side is invisible', async () => {
      // Sales lead: Ada is not their member, and PLAT-1 is not their project.
      const response = await get(`/api/assignments?memberId=${adaId}`, salesLeadCookie);
      const projectIds = (response.json().items as { projectId: string }[]).map((a) => a.projectId);
      expect(projectIds).not.toContain(platProjectId);
    });
  });

  /**
   * BR-R-13 — THE MOST IMPORTANT TEST IN THIS FILE.
   *
   * Scope selects which MEMBERS are visible. It must never reduce a visible member's TOTAL.
   * The wrong implementation filters assignments by scope and THEN sums, reporting
   * "80% booked, 20% free" for someone at 130% — free capacity on a person who has none, which
   * is the single failure this application exists to prevent.
   */
  describe('BR-R-13 — a scoped user sees a visible member FULL total', () => {
    it('reports 130%, not 80%, for a Platform lead viewing Ada', async () => {
      const response = await get(
        '/api/allocations/current?asOf=2026-08-15',
        platformLeadCookie,
      );
      expect(response.statusCode).toBe(200);

      const rows = response.json().items as Array<{
        member: { id: string };
        totalPercentage: number;
      }>;
      const ada = rows.find((row) => row.member.id === adaId);
      expect(ada).toBeDefined();

      // 130, NOT 80. If this reads 80, the sum was taken after the scope filter.
      expect(ada?.totalPercentage).toBe(130);
    });

    it('names the out-of-scope project rather than redacting it (CQ1:A)', async () => {
      const response = await get(`/api/assignments?memberId=${adaId}`, platformLeadCookie);
      const projectIds = (response.json().items as { projectId: string }[]).map((a) => a.projectId);
      // CQ1:A superseded Q4:A: full visibility, no redaction component was built.
      expect(projectIds).toContain(salesProjectId);
      expect(projectIds).toContain(platProjectId);
    });
  });

  describe('role-level refusals still hold (regression, NOT proof of the X-1 fix)', () => {
    /**
     * These passed against the stand-in too — it already enforced BR-R-01/02/03. They are
     * regression tests and are labelled as such, because counting them as evidence for the
     * X-1 fix would be a false claim about what was verified.
     */
    /**
     * NOTE ON ORDERING, found while writing this test. Zod schema validation runs BEFORE the
     * authorization check, so an INCOMPLETE body from an unauthorized caller yields 400, not
     * 403. That is not a data leak — no record is read and no scope is revealed — but it does
     * mean an unauthorized caller can learn the request schema. Recorded rather than changed:
     * reordering would put authorization ahead of parsing, and the authorization check for a
     * write needs the parsed target to decide. The payload here is deliberately VALID so that
     * authorization is what refuses.
     */
    it('a TEAM_LEAD cannot create a member (BR-R-15)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: platformLeadCookie },
        payload: {
          fullName: 'Nope Nobody',
          email: 'nope@example.com',
          orgUnitId: platformId,
          employmentType: 'ON_ROLL',
          roleId: engineerRoleId,
          skillIds: [],
        },
      });
      expect(response.statusCode).toBe(403);
    });

    it('a TEAM_LEAD cannot import (BR-IM-22)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/imports/members',
        headers: { cookie: platformLeadCookie },
      });
      // 403 or 404 depending on whether the import route exists yet; it must NOT be 200.
      expect([403, 404]).toContain(response.statusCode);
    });
  });
});
