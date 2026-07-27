/**
 * Import — US-IMP-01..05. Step 12.
 *
 * The tests that matter most, in order:
 *   1. **Idempotency** (BR-IM-10) — re-uploading creates nothing. Without this, a nervous admin
 *      re-running an import doubles the roster.
 *   2. **Rollback creates NOTHING** (BR-IM-16) — no half-applied state.
 *   3. **No row contents in any log line** (BR-IM-24) — imported rows are personal data.
 *   4. **CSV edge cases** — quoted commas and embedded newlines, where a hand-rolled parser
 *      silently shifts columns instead of failing.
 */

import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import FormData from 'form-data';
import { buildApp } from '../../src/app';
import type { AppConfig } from '../../src/shared/config';
import { createDb, createPool, runMigrations, type Db } from '../../src/shared/repository';
import type { Services } from '../../src/core-domain/services';
import { MEMBER_COLUMNS, templateCsv } from '../../src/supporting-platform/import/column-contracts';

const CONNECTION = process.env.TEST_DATABASE_URL;
const describeDb = CONNECTION ? describe : describe.skip;
const PASSWORD = 'import-test-password-long';

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

describeDb('import (US-IMP-01..05)', () => {
  let db: Db;
  let app: FastifyInstance;
  let services: Services;
  let adminCookie: string;
  let leadCookie: string;

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

  /** Uploads `csv` as a multipart file, the way a browser or `curl -F` would. */
  async function upload(
    kind: 'members' | 'projects',
    csv: string,
    filename = 'upload.csv',
    cookie = adminCookie,
  ) {
    const form = new FormData();
    form.append('file', Buffer.from(csv, 'utf8'), { filename, contentType: 'text/csv' });
    return app.inject({
      method: 'POST',
      url: `/api/imports/${kind}`,
      headers: { ...form.getHeaders(), cookie },
      payload: form.getBuffer(),
    });
  }

  const MEMBER_HEADER = MEMBER_COLUMNS.map((column) => column.header).join(',');

  /** A member row with only the required columns filled. */
  function memberRow(name: string, email: string, extras: Partial<Record<string, string>> = {}) {
    const values: Record<string, string> = {
      full_name: name,
      email,
      external_ref: '',
      org_unit: 'Engineering',
      employment_type: 'ON_ROLL',
      role: 'Engineer',
      skills: '',
      vendor_name: '',
      contract_start_date: '',
      contract_end_date: '',
      contract_status: '',
      ...extras,
    };
    return MEMBER_COLUMNS.map((column) => values[column.header] ?? '').join(',');
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

    const org = await app.inject({
      method: 'POST',
      url: '/api/org-units',
      headers: { cookie: adminCookie },
      payload: { name: 'Engineering', parentOrgUnitId: null },
    });
    const orgId = org.json().id;
    services.authorization.setRootOrgUnitIds([orgId]);

    for (const [referenceType, name] of [
      ['ROLE', 'Engineer'],
      ['SKILL', 'TypeScript'],
      ['SKILL', 'PostgreSQL'],
      ['PROJECT_TYPE', 'Delivery'],
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/reference-data',
        headers: { cookie: adminCookie },
        payload: { referenceType, name },
      });
      if (response.statusCode !== 201) throw new Error(`ref ${name}: ${response.body}`);
    }

    await services.identity.createAccount(
      { username: 'lead', role: 'TEAM_LEAD', homeOrgUnitId: orgId },
      PASSWORD,
    );
    leadCookie = await signIn('lead');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
  });

  async function memberCount(): Promise<number> {
    const row = await db
      .selectFrom('member')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  describe('authorization (BR-IM-22)', () => {
    it('refuses a non-admin BEFORE reading the file', async () => {
      const response = await upload('members', `${MEMBER_HEADER}\n${memberRow('X', 'x@e.com')}`, 'a.csv', leadCookie);
      expect(response.statusCode).toBe(403);
      expect(await memberCount()).toBe(0);
    });
  });

  describe('the file gate (BR-IM-01..05)', () => {
    it('refuses .xlsx with actionable guidance, not a bare rejection', async () => {
      const response = await upload('members', 'anything', 'roster.xlsx');
      expect(response.statusCode).toBe(400);
      expect(response.json().outcome).toBe('FILE_REFUSED');
      // FR-I-01 is only PARTIALLY satisfied (Q7:A), so the message must say what to do.
      expect(response.json().refusalReason).toMatch(/save as/i);
      expect(response.json().refusalReason).toMatch(/\.csv/i);
    });

    it('refuses a header with no data rows, distinctly from an empty import', async () => {
      const response = await upload('members', `${MEMBER_HEADER}\n`);
      expect(response.json().outcome).toBe('FILE_REFUSED');
      expect(response.json().refusalReason).toMatch(/no data rows/i);
    });

    it('lists EVERY missing required column at once, not one per attempt', async () => {
      const response = await upload('members', 'full_name,email\nAda,ada@example.com');
      expect(response.json().outcome).toBe('FILE_REFUSED');
      const reason = response.json().refusalReason as string;
      for (const column of ['org_unit', 'employment_type', 'role']) {
        expect(reason).toContain(column);
      }
    });

    it('refuses a row with the wrong field count rather than padding it (BR-IM-03)', async () => {
      // relax_column_count: false. The permissive setting would pad this and shift every field.
      const response = await upload('members', `${MEMBER_HEADER}\nAda,ada@example.com`);
      expect(response.json().outcome).toBe('FILE_REFUSED');
    });
  });

  describe('CSV edge cases (N-Q7:A — why a library, not a hand-rolled parser)', () => {
    it('handles a quoted comma inside a field', async () => {
      const csv = `${MEMBER_HEADER}\n${memberRow('"Lovelace, Ada"', 'comma@example.com')}`;
      const response = await upload('members', csv);
      expect(response.json().outcome).toBe('CREATED');
      const row = await db
        .selectFrom('member')
        .select('full_name')
        .where('email', '=', 'comma@example.com')
        .executeTakeFirstOrThrow();
      // The comma stays INSIDE the name; it does not shift the remaining columns.
      expect(row.full_name).toBe('Lovelace, Ada');
    });

    it('handles an embedded newline inside a quoted field', async () => {
      const csv = `${MEMBER_HEADER}\n${memberRow('"Ada\nLovelace"', 'newline@example.com')}`;
      const response = await upload('members', csv);
      expect(response.json().outcome).toBe('CREATED');
      expect(response.json().totalRows).toBe(1); // one ROW, despite two lines
    });

    it('handles CRLF line endings', async () => {
      const csv = `${MEMBER_HEADER}\r\n${memberRow('Crlf Person', 'crlf@example.com')}\r\n`;
      expect((await upload('members', csv)).json().outcome).toBe('CREATED');
    });

    it('handles a UTF-8 BOM', async () => {
      const csv = `﻿${MEMBER_HEADER}\n${memberRow('Bom Person', 'bom@example.com')}`;
      expect((await upload('members', csv)).json().outcome).toBe('CREATED');
    });

    it('matches headers case-insensitively and order-independently (BR-IM-03)', async () => {
      const csv = 'EMAIL,Full_Name,ROLE,Org_Unit,EMPLOYMENT_TYPE\n' +
        'shuffled@example.com,Shuffled Person,Engineer,Engineering,ON_ROLL';
      const response = await upload('members', csv);
      expect(response.json().outcome).toBe('CREATED');
    });
  });

  describe('unknown columns (BR-IM-04 / BR-M-09)', () => {
    it('ignores them and NAMES them, so dropped commercial data is visible', async () => {
      const csv =
        `${MEMBER_HEADER},day_rate,po_number\n` +
        `${memberRow('Rate Person', 'rate@example.com')},500,PO-123`;
      const response = await upload('members', csv);
      expect(response.json().outcome).toBe('CREATED');
      expect(response.json().ignoredColumns).toEqual(
        expect.arrayContaining(['day_rate', 'po_number']),
      );
    });

    it('BR-M-09: no commercial value reaches the member record', async () => {
      const row = await db
        .selectFrom('member')
        .selectAll()
        .where('email', '=', 'rate@example.com')
        .executeTakeFirstOrThrow();
      // There is no column for it, which is the point — the schema makes the rule structural.
      expect(JSON.stringify(row)).not.toContain('500');
      expect(JSON.stringify(row)).not.toContain('PO-123');
    });
  });

  describe('per-row validation (BR-IM-11..13)', () => {
    it('reports ALL reasons for a row, not just the first (BR-IM-12)', async () => {
      const csv = `${MEMBER_HEADER}\n${memberRow('', '', { org_unit: 'Nowhere', role: 'Wizard' })}`;
      const response = await upload('members', csv);
      expect(response.json().outcome).toBe('NOTHING_CREATED');
      const failure = response.json().failed[0];
      expect(failure.lineNumber).toBe(2); // 1-based, header included (BR-IM-20)
      expect(failure.reasons.length).toBeGreaterThanOrEqual(4);
      expect(failure.reasons.join(' ')).toMatch(/full_name/);
      expect(failure.reasons.join(' ')).toMatch(/email/);
      expect(failure.reasons.join(' ')).toMatch(/Nowhere/);
      expect(failure.reasons.join(' ')).toMatch(/Wizard/);
    });

    it('NEVER creates reference data — unmatched values fail the row (BR-IM-13)', async () => {
      const before = await db
        .selectFrom('reference_data_entry')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

      const csv = `${MEMBER_HEADER}\n${memberRow('Skill Person', 'skill@example.com', { skills: 'Telepathy' })}`;
      const response = await upload('members', csv);
      expect(response.json().outcome).toBe('NOTHING_CREATED');
      expect(response.json().failed[0].reasons.join(' ')).toMatch(/Telepathy/);

      const after = await db
        .selectFrom('reference_data_entry')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      expect(Number(after.count)).toBe(Number(before.count));
    });

    it('refuses a locale date format rather than guessing (AS-03)', async () => {
      const csv =
        `${MEMBER_HEADER}\n` +
        memberRow('Contractor', 'contractor@example.com', {
          employment_type: 'OFF_ROLL',
          vendor_name: 'Acme',
          contract_start_date: '03/04/2026', // ambiguous: 3 April or 4 March?
          contract_end_date: '2026-12-31',
          contract_status: 'Active',
        });
      const response = await upload('members', csv);
      expect(response.json().outcome).toBe('NOTHING_CREATED');
      expect(response.json().failed[0].reasons.join(' ')).toMatch(/YYYY-MM-DD/);
    });

    it('honours OFF_ROLL contract requirements per row (BR-M-06, US-IMP-01 AC 2)', async () => {
      const csv =
        `${MEMBER_HEADER}\n` +
        memberRow('Missing Contract', 'nocontract@example.com', { employment_type: 'OFF_ROLL' }) +
        '\n' +
        memberRow('Good Contractor', 'good@example.com', {
          employment_type: 'OFF_ROLL',
          vendor_name: 'Acme',
          contract_start_date: '2026-01-01',
          contract_end_date: '2026-12-31',
          contract_status: 'Active',
        });
      const response = await upload('members', csv);
      // US-IMP-03 AC 1: valid rows import while invalid ones do not, in ONE operation.
      expect(response.json().outcome).toBe('CREATED');
      expect(response.json().created).toBe(1);
      expect(response.json().failed).toHaveLength(1);
      expect(response.json().failed[0].reasons.join(' ')).toMatch(/vendor_name/);
    });

    it('imports skills when they all exist', async () => {
      const csv = `${MEMBER_HEADER}\n${memberRow('Skilled Person', 'skilled@example.com', { skills: 'TypeScript;PostgreSQL' })}`;
      expect((await upload('members', csv)).json().outcome).toBe('CREATED');
      const rows = await db
        .selectFrom('member_skill')
        .innerJoin('member', 'member.id', 'member_skill.member_id')
        .select('member_skill.skill_id')
        .where('member.email', '=', 'skilled@example.com')
        .execute();
      expect(rows).toHaveLength(2);
    });
  });

  describe('duplicates (BR-IM-06..10)', () => {
    it('reports an in-file duplicate against the EARLIER line (BR-IM-09)', async () => {
      const csv =
        `${MEMBER_HEADER}\n` +
        memberRow('First Wins', 'dup@example.com') +
        '\n' +
        memberRow('Second Loses', 'dup@example.com');
      const response = await upload('members', csv);
      expect(response.json().created).toBe(1);
      expect(response.json().conflicts).toHaveLength(1);
      const conflict = response.json().conflicts[0];
      expect(conflict.lineNumber).toBe(3);
      expect(conflict.existingLineNumber).toBe(2); // names the earlier row
      expect(conflict.existingRecord).toBeNull();

      // BR-IM-09: the FIRST occurrence is the one that lands.
      const row = await db
        .selectFrom('member')
        .select('full_name')
        .where('email', '=', 'dup@example.com')
        .executeTakeFirstOrThrow();
      expect(row.full_name).toBe('First Wins');
    });

    it('reports an existing record as a conflict, NAMING it (BR-IM-08)', async () => {
      const csv = `${MEMBER_HEADER}\n${memberRow('Different Name', 'dup@example.com')}`;
      const response = await upload('members', csv);
      expect(response.json().outcome).toBe('NOTHING_CREATED');
      const conflict = response.json().conflicts[0];
      expect(conflict.existingRecord.label).toBe('First Wins');
      expect(conflict.existingLineNumber).toBeNull();
    });

    it('prefers external_ref as the natural key when present (BR-IM-06)', async () => {
      const first = `${MEMBER_HEADER}\n${memberRow('Ref Person', 'ref1@example.com', { external_ref: 'EMP-1' })}`;
      expect((await upload('members', first)).json().created).toBe(1);

      // Same external_ref, DIFFERENT email — still a conflict, because the person is the same.
      const second = `${MEMBER_HEADER}\n${memberRow('Ref Person Renamed', 'ref2@example.com', { external_ref: 'EMP-1' })}`;
      const response = await upload('members', second);
      expect(response.json().outcome).toBe('NOTHING_CREATED');
      expect(response.json().conflicts[0].existingRecord.label).toBe('Ref Person');
    });

    /** BR-IM-10 — the property that makes a nervous admin's re-run safe. */
    it('IDEMPOTENT: re-uploading the same file creates nothing and conflicts everything', async () => {
      const csv =
        `${MEMBER_HEADER}\n` +
        memberRow('Idem One', 'idem1@example.com') +
        '\n' +
        memberRow('Idem Two', 'idem2@example.com');

      const first = await upload('members', csv);
      expect(first.json().created).toBe(2);
      const countAfterFirst = await memberCount();

      const second = await upload('members', csv);
      expect(second.json().outcome).toBe('NOTHING_CREATED');
      expect(second.json().created).toBe(0);
      expect(second.json().conflicts).toHaveLength(2);
      expect(await memberCount()).toBe(countAfterFirst);
    });

    it('US-IMP-03 AC 4: re-uploading ONLY the corrected rows does not duplicate the successes', async () => {
      const bad =
        `${MEMBER_HEADER}\n` +
        memberRow('Good Row', 'good-row@example.com') +
        '\n' +
        memberRow('Bad Row', 'bad-row@example.com', { role: 'Wizard' });
      const firstRun = await upload('members', bad);
      expect(firstRun.json().created).toBe(1);
      expect(firstRun.json().failed).toHaveLength(1);

      // Fix the one bad row and upload it ALONE.
      const fixed = `${MEMBER_HEADER}\n${memberRow('Bad Row', 'bad-row@example.com')}`;
      const secondRun = await upload('members', fixed);
      expect(secondRun.json().created).toBe(1);
      expect(secondRun.json().conflicts).toHaveLength(0);
    });
  });

  describe('projects (US-IMP-02)', () => {
    const PROJECT_HEADER = 'code,name,project_type,owning_org_unit,start_date,planned_end_date,description';

    it('imports projects and resolves reference data by name', async () => {
      const csv =
        `${PROJECT_HEADER}\n` +
        'PLAT-1,Platform Rebuild,Delivery,Engineering,2026-01-01,2026-12-31,\n' +
        'DATA-2,Reporting,Delivery,Engineering,2026-02-01,2026-11-30,Warehouse';
      const response = await upload('projects', csv);
      expect(response.json().outcome).toBe('CREATED');
      expect(response.json().created).toBe(2);
    });

    it('US-IMP-02 AC 3: a file with no valid rows creates nothing and says so', async () => {
      const csv = `${PROJECT_HEADER}\nX-1,Nope,Nonexistent Type,Engineering,2026-01-01,2026-12-31,`;
      const response = await upload('projects', csv);
      expect(response.json().outcome).toBe('NOTHING_CREATED');
      expect(response.json().created).toBe(0);
      expect(response.json().failed[0].reasons.join(' ')).toMatch(/Nonexistent Type/);
    });

    it('reports a duplicate code as a conflict (BR-IM-07)', async () => {
      const csv = `${PROJECT_HEADER}\nPLAT-1,Duplicate,Delivery,Engineering,2026-01-01,2026-12-31,`;
      const response = await upload('projects', csv);
      expect(response.json().outcome).toBe('NOTHING_CREATED');
      expect(response.json().conflicts[0].existingRecord.label).toBe('Platform Rebuild');
    });
  });

  describe('the template (US-IMP-05, BR-IM-26/27)', () => {
    it('downloads as CSV with every column and its requiredness', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/imports/template/members',
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
      const lines = response.body.trim().split('\n');
      expect(lines[0]).toBe(MEMBER_HEADER);
      expect(lines[1]).toMatch(/^#/); // guidance row, skipped by the parser
      expect(lines[1]).toContain('required');
    });

    /**
     * US-IMP-05 AC 2 — "populate and upload it unmodified in structure".
     *
     * This is the assertion that keeps BR-IM-26 honest: the template is GENERATED from the same
     * contract the parser uses, so a round trip must work. A hand-maintained template would pass
     * the download test above and fail this one.
     */
    it('ROUND TRIP: the downloaded template imports without modification', async () => {
      const template = templateCsv('MEMBER');
      const populated = `${template}${memberRow('Template Person', 'template@example.com')}`;
      const response = await upload('members', populated);
      expect(response.json().outcome).toBe('CREATED');
      expect(response.json().created).toBe(1);
    });
  });

  /**
   * BR-IM-24 — imported rows are personal data, and the container log is rotated but not
   * access-controlled. Asserted by capturing the logger, not by reading the code.
   */
  describe('logging (BR-IM-24)', () => {
    /**
     * Captured from `process.stdout`, which is where pino actually writes.
     *
     * An earlier version of this test patched `app.log.info` and captured NOTHING — Fastify gives
     * each request a CHILD logger, so `request.log.info` never goes through the instance method.
     * The test passed its "no row contents" assertions vacuously against an empty string, which is
     * exactly the false-positive shape this project has been bitten by before. Hence the
     * `toContain('import complete')` assertion FIRST: it proves the capture works before the
     * absence assertions mean anything.
     */
    it('logs counts and reasons but NEVER row contents', async () => {
      const logged = buildApp({
        db,
        config: { ...testConfig(), logLevel: 'info' } as AppConfig,
      });
      await logged.app.ready();

      const cookie = await (async () => {
        const response = await logged.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { username: 'admin', password: PASSWORD },
        });
        const raw = response.headers['set-cookie'];
        return String(Array.isArray(raw) ? raw[0] : raw).split(';')[0] as string;
      })();

      const captured: string[] = [];
      const realWrite = process.stdout.write.bind(process.stdout);
      (process.stdout as unknown as { write: unknown }).write = ((chunk: unknown, ...rest: unknown[]) => {
        captured.push(String(chunk));
        return (realWrite as (...args: never[]) => boolean)(chunk as never, ...(rest as never[]));
      }) as never;

      try {
        const form = new FormData();
        const csv = `${MEMBER_HEADER}\n${memberRow('Secret Person', 'secret-person@example.com')}`;
        form.append('file', Buffer.from(csv, 'utf8'), {
          filename: 'secret.csv',
          contentType: 'text/csv',
        });
        await logged.app.inject({
          method: 'POST',
          url: '/api/imports/members',
          headers: { ...form.getHeaders(), cookie },
          payload: form.getBuffer(),
        });
      } finally {
        (process.stdout as unknown as { write: unknown }).write = realWrite;
      }

      const all = captured.join('\n');

      // FIRST: prove the capture worked. Without this the assertions below are vacuous.
      expect(all).toContain('import complete');
      expect(all).toContain('"created":1');

      // THEN: nothing from the row appears anywhere in the log.
      expect(all).not.toContain('Secret Person');
      expect(all).not.toContain('secret-person@example.com');
      expect(all).not.toContain('Engineering');

      await logged.app.close();
    });
  });

  /**
   * BR-IM-16 — one transaction for all valid rows.
   *
   * Forcing a mid-write database failure deterministically is the point. A UNIQUE violation on the
   * SECOND row does it: row one has already been inserted inside the transaction, so if the
   * rollback were missing, row one would survive.
   */
  describe('transaction atomicity (BR-IM-16)', () => {
    it('a mid-write failure creates NOTHING', async () => {
      // Two rows sharing an email would normally be caught as an in-file conflict, so instead use
      // two rows with DIFFERENT emails but the same external_ref... which is also caught. The
      // remaining route to a genuine DB-level failure is a value the component accepts but the
      // schema refuses: an email longer than varchar(254).
      const longEmail = `${'x'.repeat(250)}@example.com`;
      const csv =
        `${MEMBER_HEADER}\n` +
        memberRow('Atomic One', 'atomic-one@example.com') +
        '\n' +
        memberRow('Atomic Two', longEmail);

      const before = await memberCount();
      const response = await upload('members', csv);

      /**
       * UNCONDITIONAL on purpose. An earlier version branched on the outcome and merely warned if
       * the database happened to accept the row — which would have let this test pass without
       * exercising rollback at all. Verified to take the rollback path against PostgreSQL 16:
       * `varchar(254)` refuses the 262-character email, and row one has already been inserted
       * inside the transaction by that point, so a missing rollback would leave it behind.
       */
      expect(response.json().outcome).toBe('NOTHING_CREATED');
      expect(response.json().created).toBe(0);
      expect(await memberCount()).toBe(before);

      const survivor = await db
        .selectFrom('member')
        .select('id')
        .where('email', '=', 'atomic-one@example.com')
        .executeTakeFirst();
      // The row that DID insert before the failure must be gone.
      expect(survivor).toBeUndefined();
    });
  });
});
