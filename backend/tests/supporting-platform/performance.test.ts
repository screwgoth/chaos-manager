/**
 * Step 19 — the three claims recorded as UNVERIFIED at NFR Requirements.
 *
 * These are MEASUREMENTS, not assertions of intent. Each prints its actual number so the
 * code-generation summary can quote a real figure rather than a budget.
 *
 * Thresholds are deliberately generous: this runs on developer hardware and in CI-less
 * conditions, so a tight bound would make the suite flaky and teach everyone to ignore it. The
 * point is to catch an ORDER-OF-MAGNITUDE regression — a 2,000-row import taking three minutes,
 * or a scope query going sequential-scan — not to police milliseconds.
 */

import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import FormData from 'form-data';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/shared/config';
import { createDb, createPool, runMigrations, type Db } from '../../src/shared/repository';
import type { Services } from '../../src/core-domain/services';
import { AuthorizationComponent } from '../../src/supporting-platform/authorization/authorization-component';
import { MEMBER_COLUMNS } from '../../src/supporting-platform/import/column-contracts';
import type { OrgUnitId, VerifiedIdentity } from '../../src/shared/types/domain';

const CONNECTION = process.env.TEST_DATABASE_URL;
const describeDb = CONNECTION ? describe : describe.skip;
const PASSWORD = 'perf-test-password-long';

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

function report(label: string, value: string): void {
  // eslint-disable-next-line no-console
  console.log(`  [MEASURED] ${label}: ${value}`);
}

describeDb('Step 19 — performance measurements', () => {
  let db: Db;
  let app: FastifyInstance;
  let services: Services;
  let adminCookie: string;
  let orgId: string;
  let platformId: string;

  async function signIn(username: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password: PASSWORD },
    });
    if (response.statusCode !== 200) throw new Error(`sign-in failed: ${response.body}`);
    const raw = response.headers['set-cookie'];
    return String(Array.isArray(raw) ? raw[0] : raw).split(';')[0] as string;
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

    const mkOrg = async (name: string, parent: string | null) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/org-units',
        headers: { cookie: adminCookie },
        payload: { name, parentOrgUnitId: parent },
      });
      return response.json().id as string;
    };
    orgId = await mkOrg('Organisation', null);
    platformId = await mkOrg('Engineering', orgId);
    services.authorization.setRootOrgUnitIds([orgId as OrgUnitId]);

    for (const [referenceType, name] of [
      ['ROLE', 'Engineer'],
      ['PROJECT_TYPE', 'Delivery'],
    ] as const) {
      await app.inject({
        method: 'POST',
        url: '/api/reference-data',
        headers: { cookie: adminCookie },
        payload: { referenceType, name },
      });
    }
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
  });

  /**
   * U2-NFR-P-03. The budget said "< 30 s", and the whole cost is the write phase — roughly 2,000
   * inserts through Unit 1's components inside one transaction.
   *
   * If this EXCEEDS 30 s, the correct response is NOT to bypass those components with a bulk
   * insert: BR-IM-11 exists to prevent a second, drifting copy of every validation rule. Lower the
   * row cap, or move to a background job (Q13:C, which was declined for a ~200-row need).
   */
  it('imports 2,000 rows within the 30 s budget', async () => {
    const header = MEMBER_COLUMNS.map((column) => column.header).join(',');
    const lines = [header];
    for (let index = 0; index < 2000; index += 1) {
      lines.push(`Perf Person ${index},perf${index}@example.com,,Engineering,ON_ROLL,Engineer,,,,,`);
    }
    const csv = `${lines.join('\n')}\n`;

    const form = new FormData();
    form.append('file', Buffer.from(csv, 'utf8'), {
      filename: 'perf-2000.csv',
      contentType: 'text/csv',
    });

    const started = process.hrtime.bigint();
    const response = await app.inject({
      method: 'POST',
      url: '/api/imports/members',
      headers: { ...form.getHeaders(), cookie: adminCookie },
      payload: form.getBuffer(),
    });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    report('2,000-row import', `${Math.round(elapsedMs)} ms (${(elapsedMs / 1000).toFixed(1)} s)`);
    report('  file size', `${(Buffer.byteLength(csv) / 1024).toFixed(0)} KB`);

    expect(response.json().outcome).toBe('CREATED');
    expect(response.json().created).toBe(2000);
    expect(elapsedMs).toBeLessThan(30_000);
  }, 120_000);

  /** U2-NFR-P-04: the stated real need is ~200 rows. */
  it('imports 200 rows well inside the 5 s budget', async () => {
    const header = MEMBER_COLUMNS.map((column) => column.header).join(',');
    const lines = [header];
    for (let index = 0; index < 200; index += 1) {
      lines.push(`Small Person ${index},small${index}@example.com,,Engineering,ON_ROLL,Engineer,,,,,`);
    }

    const form = new FormData();
    form.append('file', Buffer.from(`${lines.join('\n')}\n`, 'utf8'), {
      filename: 'perf-200.csv',
      contentType: 'text/csv',
    });

    const started = process.hrtime.bigint();
    const response = await app.inject({
      method: 'POST',
      url: '/api/imports/members',
      headers: { ...form.getHeaders(), cookie: adminCookie },
      payload: form.getBuffer(),
    });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    report('200-row import', `${Math.round(elapsedMs)} ms`);
    expect(response.json().created).toBe(200);
    expect(elapsedMs).toBeLessThan(5_000);
  }, 60_000);

  /**
   * N-Q2:A — measure BEFORE adding an index. `member.org_unit_id` and
   * `project.owning_org_unit_id` both already carry indexes; whether the planner uses them under
   * BR-R-12's disjunction is an empirical question, and this answers it.
   */
  it('EXPLAINs the BR-R-12 scope predicate against a POPULATED table', async () => {
    /**
     * The fixture matters more than the query here. An earlier version of this test ran the EXPLAIN
     * against an EMPTY assignment table and reported "Seq Scan ... rows=0", which answers nothing —
     * a sequential scan of zero rows is free no matter how bad the plan is. N-Q2:A asked whether the
     * planner uses the existing indexes under BR-R-12's disjunction, and only a populated table can
     * answer that.
     *
     * Rows are inserted with direct SQL rather than through C-03. That is deliberate and safe: this
     * is a QUERY-PLAN fixture, not a business-rule test, and going through the component would add
     * ~2,000 capacity checks to a test that is measuring the planner. BR-IM-11's prohibition is
     * about the IMPORT path, which does go through components.
     */
    const project = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: adminCookie },
      payload: {
        code: 'PERF-1',
        name: 'Perf Project',
        description: null,
        owningOrgUnitId: platformId,
        projectTypeId: (
          await app.inject({
            method: 'GET',
            url: '/api/reference-data?type=PROJECT_TYPE',
            headers: { cookie: adminCookie },
          })
        ).json().items[0].id,
        startDate: '2026-01-01',
        plannedEndDate: '2026-12-31',
      },
    });
    const projectId = project.json().id as string;

    const members = await db.selectFrom('member').select('id').limit(1500).execute();
    await db
      .insertInto('assignment')
      .values(
        members.map((member) => ({
          member_id: member.id,
          project_id: projectId,
          allocation_tenths: 500,
          start_date: '2026-03-01',
          end_date: '2026-03-31',
          project_role_id: null,
          status: 'ACTIVE' as const,
          saved_as_override: false,
        })),
      )
      .execute();

    const assignmentCount = await db
      .selectFrom('assignment')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    report('  assignment rows for EXPLAIN', String(Number(assignmentCount.count)));
    expect(Number(assignmentCount.count)).toBeGreaterThan(1000);

    const plan = await sql<{ 'QUERY PLAN': string }>`
      explain (analyze, buffers)
      select a.id from assignment a
      where exists (
        select 1 from member m where m.id = a.member_id and m.org_unit_id in (
          select id from org_unit where id = ${platformId} or parent_org_unit_id = ${platformId}
        )
      ) or exists (
        select 1 from project p where p.id = a.project_id and p.owning_org_unit_id in (
          select id from org_unit where id = ${platformId} or parent_org_unit_id = ${platformId}
        )
      )
    `.execute(db);

    const text = plan.rows.map((row) => row['QUERY PLAN']).join('\n');
    report('BR-R-12 EXPLAIN', `\n${text.split('\n').map((l) => `      ${l}`).join('\n')}`);

    const executionLine = text.split('\n').find((line) => line.includes('Execution Time'));
    report('  execution time line', executionLine ?? '(not reported)');

    /**
     * The bound checked is ORDER-OF-MAGNITUDE, per N-Q2:A: is the disjunction catastrophic at
     * design-target volume, or merely imperfect? At ~1,500 assignments a sequential scan is still
     * fast, so a Seq Scan appearing here is NOT automatically a problem — the question is the
     * execution time. An index is added only if this measurement justifies one.
     */
    const executionMs = Number(/Execution Time: ([\d.]+) ms/.exec(text)?.[1] ?? 'NaN');
    expect(Number.isFinite(executionMs)).toBe(true);
    report('  verdict', executionMs < 50 ? 'no index needed on this evidence' : 'INDEX WARRANTED');
    expect(executionMs).toBeLessThan(200);
  }, 60_000);

  /**
   * U2-NFR-P-01/P-02. Unit 1's endpoint timings do NOT transfer: they were measured against a
   * permissive filter, which `isUnrestricted` short-circuits to no WHERE clause at all. Real
   * scoping adds predicates to every scoped query, so the SCOPED role is the one that matters.
   */
  it('member list stays within budget for a SCOPED role, not just for admin', async () => {
    await services.identity.createAccount(
      { username: 'scoped-lead', role: 'TEAM_LEAD', homeOrgUnitId: platformId },
      PASSWORD,
    );
    const leadCookie = await signIn('scoped-lead');

    const time = async (cookie: string, label: string): Promise<number> => {
      // One warm-up, then measure — the first query pays for plan caching and pool warm-up.
      await app.inject({ method: 'GET', url: '/api/members?limit=50', headers: { cookie } });
      const started = process.hrtime.bigint();
      const response = await app.inject({
        method: 'GET',
        url: '/api/members?limit=50',
        headers: { cookie },
      });
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      expect(response.statusCode).toBe(200);
      report(`member list (${label})`, `${elapsedMs.toFixed(1)} ms`);
      return elapsedMs;
    };

    const adminMs = await time(adminCookie, 'ADMIN, unrestricted');
    const scopedMs = await time(leadCookie, 'TEAM_LEAD, scoped + subtree expansion');

    report('  scoped overhead', `${(scopedMs - adminMs).toFixed(1)} ms`);

    // U1-NFR-P-06's budget was 500 ms for a filtered member list.
    expect(scopedMs).toBeLessThan(500);
  }, 60_000);

  /**
   * U2-NFR-P-01: `resolveScope` runs before EVERY authorized request, so its cost is multiplied
   * across the whole application. It must be bounded by the org-unit count, not by data volume —
   * which is why it is pure computation over a preloaded root set (U2-NFR-S-02).
   */
  it('resolveScope is pure computation, well under 10 ms', () => {
    const auth = new AuthorizationComponent([orgId as OrgUnitId]);
    const identity: VerifiedIdentity = {
      userAccountId: 'u' as VerifiedIdentity['userAccountId'],
      username: 'lead',
      role: 'TEAM_LEAD',
      homeOrgUnitId: platformId as OrgUnitId,
      linkedMemberId: null,
      isActive: true,
    };

    const iterations = 10_000;
    const started = process.hrtime.bigint();
    for (let index = 0; index < iterations; index += 1) {
      auth.toScopeFilter(auth.resolveScope(identity));
    }
    const perCallMs = Number(process.hrtime.bigint() - started) / 1e6 / iterations;

    report('resolveScope + toScopeFilter', `${(perCallMs * 1000).toFixed(2)} µs per call`);
    expect(perCallMs).toBeLessThan(10);
  });
});
