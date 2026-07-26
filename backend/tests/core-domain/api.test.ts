/**
 * API layer tests — Step 16.
 *
 * Uses Fastify's `inject`, so the full request pipeline runs (hooks, session resolution, schema
 * parsing, error mapping) without binding a port. Against a REAL database, because the point
 * of these tests is the seam between the HTTP layer and everything beneath it.
 *
 * THE ONE THAT MATTERS MOST is the last block: a TEAM_MEMBER calling the API directly for
 * another member's data must be refused (US-VIS-04, US-ENB-01). Hiding a button in the
 * frontend is not access control.
 */

import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/shared/config';
import { createDb, createPool, runMigrations, type Db } from '../../src/shared/repository';
import type { Services } from '../../src/core-domain/services';

const CONNECTION = process.env.TEST_DATABASE_URL;
const describeDb = CONNECTION ? describe : describe.skip;

const ADMIN_PASSWORD = 'admin-password-long-enough';
const MEMBER_PASSWORD = 'member-password-long-enough';

/** Argon2 cost lowered ONLY here: these tests create several accounts and sign in repeatedly,
 *  and the hash strength is already covered by identity-component.test.ts at full cost. */
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
  } as AppConfig;
}

describeDb('API layer', () => {
  let db: Db;
  let app: FastifyInstance;
  let services: Services;

  let adminCookie: string;
  let teamMemberCookie: string;
  let executiveCookie: string;

  let deptId: string;
  let roleId: string;
  let projectTypeId: string;
  let ownMemberId: string;
  let otherMemberId: string;
  let projectId: string;

  /** Extracts the session cookie from a set-cookie header. */
  function cookieFrom(headers: Record<string, unknown>): string {
    const raw = headers['set-cookie'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value).split(';')[0] as string;
  }

  async function signIn(username: string, password: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password },
    });
    if (response.statusCode !== 200) {
      throw new Error(`sign-in failed for ${username}: ${response.body}`);
    }
    return cookieFrom(response.headers as Record<string, unknown>);
  }

  beforeAll(async () => {
    const pool = createPool(CONNECTION as string);
    db = createDb(pool);

    await sql`drop schema public cascade`.execute(db);
    await sql`create schema public`.execute(db);
    const migration = await runMigrations(db);
    if (migration.error) throw migration.error;

    const config = testConfig();
    const built = buildApp({ db, config });
    app = built.app;
    services = built.services;
    await app.ready();

    // Seed directly through the components — these tests are about the API, not about
    // bootstrapping, and going through HTTP here would need an account to already exist.
    const admin = await services.identity.createAccount(
      { username: 'admin', role: 'ADMIN', homeOrgUnitId: null },
      ADMIN_PASSWORD,
    );
    void admin;

    adminCookie = await signIn('admin', ADMIN_PASSWORD);

    const dept = await app.inject({
      method: 'POST',
      url: '/api/org-units',
      headers: { cookie: adminCookie },
      payload: { name: 'Engineering', parentOrgUnitId: null },
    });
    deptId = dept.json().id;

    const role = await app.inject({
      method: 'POST',
      url: '/api/reference-data',
      headers: { cookie: adminCookie },
      payload: { referenceType: 'ROLE', name: 'Engineer' },
    });
    roleId = role.json().id;

    const projectType = await app.inject({
      method: 'POST',
      url: '/api/reference-data',
      headers: { cookie: adminCookie },
      payload: { referenceType: 'PROJECT_TYPE', name: 'Internal' },
    });
    projectTypeId = projectType.json().id;

    const own = await app.inject({
      method: 'POST',
      url: '/api/members',
      headers: { cookie: adminCookie },
      payload: {
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        orgUnitId: deptId,
        employmentType: 'ON_ROLL',
        roleId,
      },
    });
    ownMemberId = own.json().id;

    const other = await app.inject({
      method: 'POST',
      url: '/api/members',
      headers: { cookie: adminCookie },
      payload: {
        fullName: 'Grace Hopper',
        email: 'grace@example.com',
        orgUnitId: deptId,
        employmentType: 'ON_ROLL',
        roleId,
      },
    });
    otherMemberId = other.json().id;

    const project = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: adminCookie },
      payload: {
        code: 'PRJ-1',
        name: 'Platform',
        description: null,
        owningOrgUnitId: deptId,
        projectTypeId,
        startDate: '2026-01-01',
        plannedEndDate: '2026-12-31',
      },
    });
    projectId = project.json().id;

    // A TEAM_MEMBER account linked to `ownMemberId`, and an EXECUTIVE (read-only).
    const memberAccount = await services.identity.createAccount(
      { username: 'ada', role: 'TEAM_MEMBER', homeOrgUnitId: deptId },
      MEMBER_PASSWORD,
    );
    await services.identity.linkToMember(memberAccount.id, ownMemberId);
    teamMemberCookie = await signIn('ada', MEMBER_PASSWORD);

    await services.identity.createAccount(
      { username: 'exec', role: 'EXECUTIVE', homeOrgUnitId: null },
      MEMBER_PASSWORD,
    );
    executiveCookie = await signIn('exec', MEMBER_PASSWORD);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
  });

  describe('health (unauthenticated by design)', () => {
    it('reports database connectivity without a session', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', database: true });
    });

    it('leaks nothing about configuration or internals', async () => {
      const body = (await app.inject({ method: 'GET', url: '/health' })).body;
      expect(body).not.toContain('postgres');
      expect(body).not.toContain('argon2');
    });
  });

  describe('session middleware', () => {
    it('rejects an unauthenticated request with the standard envelope', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/members' });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.', violations: [] },
      });
    });

    it('rejects an UNKNOWN session token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/members',
        headers: { cookie: 'chaos_session=not-a-real-token' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects a TERMINATED session, so sign-out is genuine (BR-AU-11)', async () => {
      const throwaway = await services.identity.createAccount(
        { username: 'temp-user', role: 'ADMIN', homeOrgUnitId: null },
        ADMIN_PASSWORD,
      );
      void throwaway;
      const cookie = await signIn('temp-user', ADMIN_PASSWORD);

      // Works before sign-out.
      expect(
        (await app.inject({ method: 'GET', url: '/api/members', headers: { cookie } })).statusCode,
      ).toBe(200);

      await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });

      // Dead afterwards — the same token is refused.
      expect(
        (await app.inject({ method: 'GET', url: '/api/members', headers: { cookie } })).statusCode,
      ).toBe(401);
    });

    it('never puts the token in the response body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: ADMIN_PASSWORD },
      });
      const cookie = cookieFrom(response.headers as Record<string, unknown>);
      const token = cookie.split('=')[1] as string;

      // The token lives in the httpOnly cookie only, so page JavaScript cannot read it.
      expect(response.body).not.toContain(token);
      const setCookie = String((response.headers as Record<string, unknown>)['set-cookie']);
      expect(setCookie).toContain('HttpOnly');
    });

    it('reports an unauthenticated session as 200 with authenticated:false', async () => {
      // The frontend calls this on load; a 401 there is an expected answer, not an error.
      const response = await app.inject({ method: 'GET', url: '/api/auth/session' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ authenticated: false });
    });
  });

  describe('sign-in failures are indistinguishable (BR-AU-04)', () => {
    it('returns the same message for a wrong password and an unknown username', async () => {
      const wrongPassword = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'definitely-not-the-password' },
      });
      const unknownUser = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'nobody-at-all', password: ADMIN_PASSWORD },
      });

      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownUser.statusCode).toBe(401);
      expect(wrongPassword.json()).toEqual(unknownUser.json());
      expect(wrongPassword.json().error.message).toBe('The username or password is incorrect.');
    });
  });

  /**
   * Q4:A — shape validation happens at the route, BEFORE any service call.
   */
  describe('schema validation rejects malformed payloads', () => {
    it('reports ALL field violations at once, not just the first', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: adminCookie },
        payload: { fullName: '', email: 'not-an-email', employmentType: 'WRONG' },
      });

      expect(response.statusCode).toBe(400);
      const violations = response.json().error.violations as { field: string }[];
      // Several distinct fields named, so a form can place each message beside its input.
      expect(violations.length).toBeGreaterThan(2);
      const fields = violations.map((v) => v.field);
      expect(fields).toContain('email');
      expect(fields).toContain('employmentType');
    });

    it('rejects a malformed uuid in a path parameter as 400, not 500', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/members/not-a-uuid',
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects an impossible date rather than rolling it over', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: adminCookie },
        payload: {
          code: 'PRJ-BAD',
          name: 'Bad dates',
          description: null,
          owningOrgUnitId: deptId,
          projectTypeId,
          startDate: '2026-02-30', // no such day
          plannedEndDate: '2026-12-31',
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.violations[0].field).toBe('startDate');
    });

    it('rejects an allocation with two decimal places', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId: ownMemberId,
          projectId,
          allocationPercentage: 37.55,
          period: { start: '2026-01-01', end: '2026-03-31' },
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.violations[0].field).toBe('allocationPercentage');
    });

    it('rejects a reversed date range with the violation on the END field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId: ownMemberId,
          projectId,
          allocationPercentage: 50,
          period: { start: '2026-03-31', end: '2026-01-01' },
        },
      });
      expect(response.statusCode).toBe(400);
      const fields = (response.json().error.violations as { field: string }[]).map((v) => v.field);
      // Named on `period.end` so the form highlights the field the user should change.
      expect(fields).toContain('period.end');
    });

    it('surfaces DOMAIN violations in the same envelope as schema violations', async () => {
      // BR-M-06: OFF_ROLL requires contract fields. This is a business rule, checked in the
      // domain, and the client should not have to care which layer rejected it.
      const response = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: adminCookie },
        payload: {
          fullName: 'Contractor',
          email: 'contractor@example.com',
          orgUnitId: deptId,
          employmentType: 'OFF_ROLL',
          roleId,
          contract: null,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.violations[0].field).toBe('contract');
    });
  });

  describe('role-level write rules (BR-R-01, BR-R-02)', () => {
    it('refuses a write from an EXECUTIVE, naming the role', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: executiveCookie },
        payload: {
          code: 'PRJ-EXEC',
          name: 'Should not exist',
          description: null,
          owningOrgUnitId: deptId,
          projectTypeId,
          startDate: '2026-01-01',
          plannedEndDate: '2026-12-31',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.message).toContain('EXECUTIVE');
    });

    it('permits an EXECUTIVE to READ', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects',
        headers: { cookie: executiveCookie },
      });
      expect(response.statusCode).toBe(200);
    });

    it('refuses a write from a TEAM_MEMBER', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: teamMemberCookie },
        payload: {
          fullName: 'Sneaky',
          email: 'sneaky@example.com',
          orgUnitId: deptId,
          employmentType: 'ON_ROLL',
          roleId,
        },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  /**
   * ⭐ THE CRITICAL TEST — US-VIS-04, US-ENB-01.
   *
   * "No other member's assignments are reachable to me by any route." Hiding a button in the
   * UI is not access control; these calls go straight at the API with a valid TEAM_MEMBER
   * session.
   */
  describe('a TEAM_MEMBER cannot reach another member data by ANY route', () => {
    beforeAll(async () => {
      // Give the OTHER member an assignment, so there is something to leak.
      await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId: otherMemberId,
          projectId,
          allocationPercentage: 60,
          period: { start: '2026-01-01', end: '2026-06-30' },
        },
      });
    });

    it('GET /api/members/:id for another member returns 404, not the record', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/members/${otherMemberId}`,
        headers: { cookie: teamMemberCookie },
      });

      // 404 rather than 403: "forbidden" would confirm the record exists.
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('Grace');
      expect(response.body).not.toContain('grace@example.com');
    });

    it('GET /api/members returns ONLY the caller own record', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/members',
        headers: { cookie: teamMemberCookie },
      });

      expect(response.statusCode).toBe(200);
      const items = response.json().items as { id: string }[];
      expect(items.map((m) => m.id)).toEqual([ownMemberId]);
      // The total must also respect scope, or it leaks the existence of hidden rows.
      expect(response.json().total).toBe(1);
    });

    it('GET /api/members/me returns the caller own record', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/members/me',
        headers: { cookie: teamMemberCookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe(ownMemberId);
    });

    it('GET /api/assignments?memberId=<other> returns nothing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/assignments?memberId=${otherMemberId}`,
        headers: { cookie: teamMemberCookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([]);
    });

    it('GET /api/allocations/current shows only the caller own row', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/allocations/current?asOf=2026-03-01',
        headers: { cookie: teamMemberCookie },
      });

      expect(response.statusCode).toBe(200);
      const items = response.json().items as { member: { id: string } }[];
      expect(items.every((row) => row.member.id === ownMemberId)).toBe(true);
    });

    it('GET the other member allocation timeline yields nothing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/allocations/members/${otherMemberId}/timeline?start=2026-01-01&end=2026-06-30`,
        headers: { cookie: teamMemberCookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([]);
    });

    it('GET /api/allocations/availability shows only the caller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/allocations/availability?start=2026-01-01&end=2026-06-30',
        headers: { cookie: teamMemberCookie },
      });

      const items = response.json().items as { member: { id: string } }[];
      expect(items.every((row) => row.member.id === ownMemberId)).toBe(true);
    });

    it('the ADMIN, by contrast, sees both members — proving the tests above are not vacuous', () => {
      // Without this control, the assertions above would pass even if the API returned
      // nothing to anyone.
      return app
        .inject({ method: 'GET', url: '/api/members', headers: { cookie: adminCookie } })
        .then((response) => {
          const ids = (response.json().items as { id: string }[]).map((m) => m.id);
          expect(ids).toContain(ownMemberId);
          expect(ids).toContain(otherMemberId);
        });
    });
  });

  /**
   * US-ASN-05 — the two-step override protocol, over HTTP.
   */
  describe('two-step override protocol', () => {
    let capacityMemberId: string;

    beforeAll(async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: adminCookie },
        payload: {
          fullName: 'Capacity Tester',
          email: 'capacity@example.com',
          orgUnitId: deptId,
          employmentType: 'ON_ROLL',
          roleId,
        },
      });
      capacityMemberId = created.json().id;

      await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId: capacityMemberId,
          projectId,
          allocationPercentage: 80,
          period: { start: '2026-01-01', end: '2026-03-31' },
        },
      });
    });

    it('step one returns 200 with the warning and writes NOTHING', async () => {
      const before = await app.inject({
        method: 'GET',
        url: `/api/assignments?memberId=${capacityMemberId}`,
        headers: { cookie: adminCookie },
      });
      const countBefore = (before.json().items as unknown[]).length;

      const response = await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId: capacityMemberId,
          projectId,
          allocationPercentage: 50,
          period: { start: '2026-01-01', end: '2026-03-31' },
        },
      });

      // 200, not 4xx: over-allocation is a warning permitting override (BR-A-09), and the
      // warning IS the successful outcome of step one.
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.assignment).toBeNull();
      expect(body.requiresOverrideConfirmation).toBe(true);
      expect(body.overAllocation[0].totalPercentage).toBe(130);
      // Each offending sub-period is named (BR-A-08).
      expect(body.overAllocation[0].period).toEqual({ start: '2026-01-01', end: '2026-03-31' });

      const after = await app.inject({
        method: 'GET',
        url: `/api/assignments?memberId=${capacityMemberId}`,
        headers: { cookie: adminCookie },
      });
      expect((after.json().items as unknown[]).length).toBe(countBefore);
    });

    it('step two with override saves and flags it', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId: capacityMemberId,
          projectId,
          allocationPercentage: 50,
          period: { start: '2026-01-01', end: '2026-03-31' },
          overrideOverAllocation: true,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().assignment).not.toBeNull();
      expect(response.json().savedAsOverride).toBe(true);
    });

    it('a client claiming override on a NON-over-allocated save is not flagged (BR-A-11)', async () => {
      const fresh = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: adminCookie },
        payload: {
          fullName: 'Fresh Person',
          email: 'fresh@example.com',
          orgUnitId: deptId,
          employmentType: 'ON_ROLL',
          roleId,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId: fresh.json().id,
          projectId,
          allocationPercentage: 20,
          period: { start: '2026-01-01', end: '2026-03-31' },
          overrideOverAllocation: true, // the client says override…
        },
      });

      expect(response.statusCode).toBe(201);
      // …but the flag comes from DETECTION, and nothing was over-allocated.
      expect(response.json().savedAsOverride).toBe(false);
    });
  });

  describe('percentages cross the boundary as decimals', () => {
    it('accepts and returns one-decimal percentages', async () => {
      const member = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: adminCookie },
        payload: {
          fullName: 'Decimal Person',
          email: 'decimal@example.com',
          orgUnitId: deptId,
          employmentType: 'ON_ROLL',
          roleId,
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId: member.json().id,
          projectId,
          allocationPercentage: 37.5,
          period: { start: '2026-01-01', end: '2026-03-31' },
        },
      });

      const view = await app.inject({
        method: 'GET',
        url: '/api/allocations/current?asOf=2026-02-01',
        headers: { cookie: adminCookie },
      });

      const row = (view.json().items as { member: { id: string }; totalPercentage: number }[]).find(
        (item) => item.member.id === member.json().id,
      );
      // 37.5 in, 37.5 out — tenths never leak into the API.
      expect(row?.totalPercentage).toBe(37.5);
    });
  });

  describe('BR-P-06 two-phase close, over HTTP', () => {
    it('previews without writing, then closes when confirmed', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: adminCookie },
        payload: {
          code: 'PRJ-CLOSE',
          name: 'To Close',
          description: null,
          owningOrgUnitId: deptId,
          projectTypeId,
          startDate: '2026-01-01',
          plannedEndDate: '2026-12-31',
        },
      });
      const closingProjectId = created.json().id;

      const member = await app.inject({
        method: 'POST',
        url: '/api/members',
        headers: { cookie: adminCookie },
        payload: {
          fullName: 'Closing Person',
          email: 'closing@example.com',
          orgUnitId: deptId,
          employmentType: 'ON_ROLL',
          roleId,
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: adminCookie },
        payload: {
          memberId: member.json().id,
          projectId: closingProjectId,
          allocationPercentage: 40,
          period: { start: '2026-01-01', end: '2026-12-31' },
        },
      });

      const preview = await app.inject({
        method: 'POST',
        url: `/api/projects/${closingProjectId}/close`,
        headers: { cookie: adminCookie },
        payload: { confirmOpenAssignments: false },
      });

      expect(preview.statusCode).toBe(200);
      expect(preview.json().confirmationRequired).toBe(true);
      expect(preview.json().project).toBeNull(); // nothing written
      expect(preview.json().openAssignments).toHaveLength(1);

      const confirmed = await app.inject({
        method: 'POST',
        url: `/api/projects/${closingProjectId}/close`,
        headers: { cookie: adminCookie },
        payload: { confirmOpenAssignments: true },
      });

      expect(confirmed.json().project.status).toBe('CLOSED');
      expect(confirmed.json().autoEndedAssignmentCount).toBe(1);
    });
  });

  describe('error envelope shape', () => {
    it('is identical for 401, 403, 404 and 400', async () => {
      const responses = await Promise.all([
        app.inject({ method: 'GET', url: '/api/members' }),
        app.inject({
          method: 'POST',
          url: '/api/members',
          headers: { cookie: teamMemberCookie },
          payload: {
            fullName: 'X',
            email: 'x@example.com',
            orgUnitId: deptId,
            employmentType: 'ON_ROLL',
            roleId,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/members/00000000-0000-4000-8000-000000000000',
          headers: { cookie: adminCookie },
        }),
        app.inject({
          method: 'POST',
          url: '/api/members',
          headers: { cookie: adminCookie },
          payload: {},
        }),
      ]);

      expect(responses.map((r) => r.statusCode)).toEqual([401, 403, 404, 400]);
      for (const response of responses) {
        const body = response.json();
        expect(Object.keys(body)).toEqual(['error']);
        expect(Object.keys(body.error).sort()).toEqual(['code', 'message', 'violations']);
        expect(Array.isArray(body.error.violations)).toBe(true);
      }
    });

    it('never leaks a stack trace or SQL to the client', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/members/00000000-0000-4000-8000-000000000000',
        headers: { cookie: adminCookie },
      });
      expect(response.body).not.toContain('at ');
      expect(response.body.toLowerCase()).not.toContain('select');
    });
  });

  describe('reference data removal reports what blocks it', () => {
    it('refuses to delete a referenced role and offers deactivation (BR-C-06)', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/reference-data/${roleId}`,
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().removed).toBe(false);
      expect(response.json().blockedByReferenceCount).toBeGreaterThan(0);
      expect(response.json().alternative).toBe('DEACTIVATE');
    });

    it('deletes an unreferenced entry', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/reference-data',
        headers: { cookie: adminCookie },
        payload: { referenceType: 'SKILL', name: 'Typo Skill' },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/reference-data/${created.json().id}`,
        headers: { cookie: adminCookie },
      });
      expect(response.json().removed).toBe(true);
    });
  });

  describe('org unit two-level rule over HTTP (BR-O-01)', () => {
    it('refuses a third level and names the offending parent', async () => {
      const team = await app.inject({
        method: 'POST',
        url: '/api/org-units',
        headers: { cookie: adminCookie },
        payload: { name: 'Platform Team', parentOrgUnitId: deptId },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/org-units',
        headers: { cookie: adminCookie },
        payload: { name: 'Sub Squad', parentOrgUnitId: team.json().id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.violations[0].rule).toBe('DEPTH_EXCEEDED');
      expect(response.json().error.violations[0].detail).toContain('Platform Team');
    });
  });
});
