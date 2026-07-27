/**
 * Repository integration tests against REAL PostgreSQL.
 *
 * These cover the three things in the Step 5 plan that only a real database can answer:
 *   - inclusive overlap boundaries: adjacent ranges vs sharing exactly one day (AS-03)
 *   - scope filtering actually excludes out-of-scope rows (FR-R-08)
 *   - natural-key collisions surface as ConflictError, not as a raw pg error (BR-M-05)
 *
 * They also exercise the migration, the date-parser override, and the partial unique
 * index behind BR-A-17 — none of which can be verified without a server.
 *
 * SKIPPED (not failed) when TEST_DATABASE_URL is unset, so `npm test` stays runnable on
 * a machine with no database. A skipped suite is reported as skipped; it is never
 * reported as passing.
 */

import { sql } from 'kysely';
import { ConflictError } from '../../src/shared/errors';
import {
  AssignmentHistoryRepository,
  AssignmentRepository,
  MemberRepository,
  OrgUnitRepository,
  ProjectRepository,
  ReferenceDataRepository,
  SessionRepository,
  UserAccountRepository,
  createDb,
  createPool,
  runMigrations,
  type Db,
} from '../../src/shared/repository';
import type { ScopeFilter } from '../../src/shared/types/authorization';

const CONNECTION = process.env.TEST_DATABASE_URL;
const describeDb = CONNECTION ? describe : describe.skip;

const ALL: ScopeFilter = { orgUnitIds: 'ALL', restrictToMemberId: null };

describeDb('repository layer against real PostgreSQL', () => {
  let db: Db;
  let pool: ReturnType<typeof createPool>;

  // Ids created in beforeAll and reused across tests.
  let deptA: string;
  let deptB: string;
  let roleId: string;
  let skillId: string;
  let projectTypeId: string;
  let memberInA: string;
  let memberInB: string;
  let projectId: string;

  beforeAll(async () => {
    pool = createPool(CONNECTION as string);
    db = createDb(pool);

    // Start from a known-empty schema so a re-run cannot pass on stale data.
    await sql`drop schema public cascade`.execute(db);
    await sql`create schema public`.execute(db);

    const migration = await runMigrations(db);
    if (migration.error) throw migration.error;

    const orgUnits = new OrgUnitRepository(db);
    const referenceData = new ReferenceDataRepository(db);
    const members = new MemberRepository(db);
    const projects = new ProjectRepository(db);

    deptA = (await orgUnits.create({ name: 'Engineering', parentOrgUnitId: null })).id;
    deptB = (await orgUnits.create({ name: 'Sales', parentOrgUnitId: null })).id;

    roleId = (await referenceData.create('ROLE', 'Engineer')).id;
    skillId = (await referenceData.create('SKILL', 'TypeScript')).id;
    projectTypeId = (await referenceData.create('PROJECT_TYPE', 'Internal')).id;

    memberInA = (
      await members.create({
        externalRef: 'E-001',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        orgUnitId: deptA,
        employmentType: 'ON_ROLL',
        roleId,
        vendorName: null,
        contractStartDate: null,
        contractEndDate: null,
        contractStatus: null,
      })
    ).id;

    memberInB = (
      await members.create({
        externalRef: 'E-002',
        fullName: 'Grace Hopper',
        email: 'grace@example.com',
        orgUnitId: deptB,
        employmentType: 'ON_ROLL',
        roleId,
        vendorName: null,
        contractStartDate: null,
        contractEndDate: null,
        contractStatus: null,
      })
    ).id;

    projectId = (
      await projects.create({
        code: 'PRJ-1',
        name: 'Platform',
        description: null,
        owningOrgUnitId: deptA,
        projectTypeId,
        startDate: '2026-01-01',
        plannedEndDate: '2026-12-31',
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
  });

  describe('migration', () => {
    it('applies and creates the expected tables', async () => {
      const rows = await sql<{ table_name: string }>`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
      `.execute(db);
      const names = rows.rows.map((r) => r.table_name).sort();

      expect(names).toContain('member');
      expect(names).toContain('assignment');
      expect(names).toContain('assignment_history');
      expect(names).toContain('session');
    });
  });

  describe('date columns survive the round trip (the OID 1082 override)', () => {
    it('returns dates as YYYY-MM-DD strings, not shifted Date objects', async () => {
      const projects = new ProjectRepository(db);
      const project = await projects.findById(projectId, ALL);

      // If node-postgres parsed these into local-midnight Dates, this would come back
      // as a Date object — and in any timezone west of UTC, as the PREVIOUS day.
      expect(typeof project?.startDate).toBe('string');
      expect(project?.startDate).toBe('2026-01-01');
      expect(project?.plannedEndDate).toBe('2026-12-31');
    });
  });

  describe('natural-key collisions surface as ConflictError', () => {
    it('rejects a duplicate email with a named field', async () => {
      const members = new MemberRepository(db);
      const duplicate = {
        externalRef: 'E-999',
        fullName: 'Someone Else',
        email: 'ADA@example.com', // different case — the index is on lower(email)
        orgUnitId: deptA,
        employmentType: 'ON_ROLL' as const,
        roleId,
        vendorName: null,
        contractStartDate: null,
        contractEndDate: null,
        contractStatus: null,
      };

      await expect(members.create(duplicate)).rejects.toThrow(ConflictError);
      await expect(members.create(duplicate)).rejects.toMatchObject({
        httpStatus: 409,
        detail: { field: 'email' },
      });
    });

    it('rejects a duplicate project code case-insensitively', async () => {
      const projects = new ProjectRepository(db);
      await expect(
        projects.create({
          code: 'prj-1',
          name: 'Another',
          description: null,
          owningOrgUnitId: deptA,
          projectTypeId,
          startDate: '2026-01-01',
          plannedEndDate: '2026-06-30',
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('scope filtering excludes out-of-scope rows (FR-R-08)', () => {
    it('a department-scoped filter returns only that department', async () => {
      const members = new MemberRepository(db);
      const scoped: ScopeFilter = { orgUnitIds: [deptA], restrictToMemberId: null };

      const page = await members.search(
        {
          search: null,
          orgUnitIds: null,
          employmentType: null,
          status: null,
          skillIds: null,
          roleId: null,
          offset: 0,
          limit: 50,
        },
        scoped,
      );

      const ids = page.items.map((m) => m.id);
      expect(ids).toContain(memberInA);
      expect(ids).not.toContain(memberInB);
      // The TOTAL must also respect scope — a scoped list with an unscoped count leaks
      // the existence of rows the user may not see.
      expect(page.total).toBe(1);
    });

    it('an empty permitted-org list returns nothing, not everything', async () => {
      const members = new MemberRepository(db);
      const page = await members.search(
        {
          search: null,
          orgUnitIds: null,
          employmentType: null,
          status: null,
          skillIds: null,
          roleId: null,
          offset: 0,
          limit: 50,
        },
        { orgUnitIds: [], restrictToMemberId: null },
      );

      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
    });

    it('findById will not return a member outside scope', async () => {
      const members = new MemberRepository(db);
      const found = await members.findById(memberInB, {
        orgUnitIds: [deptA],
        restrictToMemberId: null,
      });
      expect(found).toBeNull();
    });
  });

  describe('inclusive overlap boundaries (AS-03) — the off-by-one cases', () => {
    let janToMar: string;

    beforeAll(async () => {
      const assignments = new AssignmentRepository(db);
      janToMar = (
        await assignments.create({
          memberId: memberInA,
          projectId,
          allocationTenths: 500,
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          projectRoleId: null,
          savedAsOverride: false,
          actorUserId: null,
        })
      ).id;
    });

    it('an ADJACENT range does not overlap', async () => {
      const assignments = new AssignmentRepository(db);
      const found = await assignments.findOverlapping([memberInA], {
        start: '2026-04-01',
        end: '2026-06-30',
      });
      expect(found.map((a) => a.id)).not.toContain(janToMar);
    });

    it('a range sharing EXACTLY ONE DAY does overlap', async () => {
      const assignments = new AssignmentRepository(db);
      const found = await assignments.findOverlapping([memberInA], {
        start: '2026-03-31',
        end: '2026-06-30',
      });
      expect(found.map((a) => a.id)).toContain(janToMar);
    });

    it('carries the project identity so the allocation view needs no second query', async () => {
      const assignments = new AssignmentRepository(db);
      const found = await assignments.findOverlapping([memberInA], {
        start: '2026-01-01',
        end: '2026-12-31',
      });
      const row = found.find((a) => a.id === janToMar);
      expect(row?.projectName).toBe('Platform');
      expect(row?.projectCode).toBe('PRJ-1');
      expect(row?.allocationTenths).toBe(500);
    });

    it('batches across members: one call covers every member passed in', async () => {
      const assignments = new AssignmentRepository(db);
      await assignments.create({
        memberId: memberInB,
        projectId,
        allocationTenths: 300,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        projectRoleId: null,
        savedAsOverride: false,
        actorUserId: null,
      });

      const found = await assignments.findOverlapping([memberInA, memberInB], {
        start: '2026-01-01',
        end: '2026-12-31',
      });
      const memberIds = new Set(found.map((a) => a.memberId));
      expect(memberIds.has(memberInA)).toBe(true);
      expect(memberIds.has(memberInB)).toBe(true);
    });

    it('excludeAssignmentId omits the row being edited (BR-A-09)', async () => {
      const assignments = new AssignmentRepository(db);
      const found = await assignments.findOverlapping(
        [memberInA],
        { start: '2026-01-01', end: '2026-12-31' },
        { excludeAssignmentId: janToMar },
      );
      expect(found.map((a) => a.id)).not.toContain(janToMar);
    });

    it('capacity follows DATES, not status (BR-A-07, BR-A-19, BR-A-20)', async () => {
      const assignments = new AssignmentRepository(db);
      const ended = await assignments.create({
        memberId: memberInA,
        projectId,
        allocationTenths: 200,
        startDate: '2026-07-01',
        endDate: '2026-08-31',
        projectRoleId: null,
        savedAsOverride: false,
        actorUserId: null,
      });

      // Ending early moves end_date to the effective date (BR-A-19).
      await assignments.endEarly(ended.id, '2026-07-15', null);

      // The ELAPSED portion still consumed capacity and must still be counted — BR-A-07
      // sums every assignment whose range contains the date, with no status condition.
      const elapsed = await assignments.findOverlapping([memberInA], {
        start: '2026-07-01',
        end: '2026-07-10',
      });
      expect(elapsed.map((a) => a.id)).toContain(ended.id);

      // The RELEASED portion is gone, because end_date no longer reaches it. This is the
      // date predicate doing the work, not a status filter.
      const released = await assignments.findOverlapping([memberInA], {
        start: '2026-08-01',
        end: '2026-08-31',
      });
      expect(released.map((a) => a.id)).not.toContain(ended.id);
    });
  });

  describe('assignment history keeps exactly one current revision (BR-A-17)', () => {
    it('supersedes the previous revision on append', async () => {
      const assignments = new AssignmentRepository(db);
      const history = new AssignmentHistoryRepository(db);

      const assignment = await assignments.create({
        memberId: memberInA,
        projectId,
        allocationTenths: 400,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        projectRoleId: null,
        savedAsOverride: false,
        actorUserId: null,
      });

      const snapshot = {
        assignmentId: assignment.id,
        actorUserId: null,
        memberId: memberInA,
        projectId,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        projectRoleId: null,
        savedAsOverride: false,
        status: 'ACTIVE' as const,
      };

      const first = await history.append({
        ...snapshot,
        operation: 'CREATE',
        allocationTenths: 400,
      });
      const second = await history.append({
        ...snapshot,
        operation: 'UPDATE',
        allocationTenths: 600,
      });

      expect(first.revisionNumber).toBe(1);
      expect(second.revisionNumber).toBe(2);

      const trail = await history.findByAssignment(assignment.id);
      const current = trail.filter((r) => r.supersededAt === null);
      // The partial unique index enforces this at the database level; the assertion
      // confirms the append order actually satisfies it.
      expect(current).toHaveLength(1);
      expect(current[0]?.revisionNumber).toBe(2);
      expect(current[0]?.allocationTenths).toBe(600);
    });

    it('findAsOf returns the revision current at that instant, not todays values', async () => {
      const assignments = new AssignmentRepository(db);
      const history = new AssignmentHistoryRepository(db);

      const assignment = await assignments.create({
        memberId: memberInA,
        projectId,
        allocationTenths: 100,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        projectRoleId: null,
        savedAsOverride: false,
        actorUserId: null,
      });

      const snapshot = {
        assignmentId: assignment.id,
        actorUserId: null,
        memberId: memberInA,
        projectId,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        projectRoleId: null,
        savedAsOverride: false,
        status: 'ACTIVE' as const,
      };

      const original = await history.append({
        ...snapshot,
        operation: 'CREATE',
        allocationTenths: 100,
      });

      // A moment strictly after the first revision and before the second.
      const between = new Date(original.recordedAt.getTime() + 1);
      await new Promise((resolve) => setTimeout(resolve, 5));

      await history.append({ ...snapshot, operation: 'UPDATE', allocationTenths: 900 });

      const asOfBetween = await history.findAsOf(
        [memberInA],
        { start: '2026-10-01', end: '2026-10-31' },
        between,
      );
      const historical = asOfBetween.filter((r) => r.assignmentId === assignment.id);

      // This is the whole point of Path B: the answer is 100, the value the system held
      // at that instant — NOT 900, the value it holds now.
      expect(historical).toHaveLength(1);
      expect(historical[0]?.allocationTenths).toBe(100);

      const asOfNow = await history.findAsOf(
        [memberInA],
        { start: '2026-10-01', end: '2026-10-31' },
        new Date(),
      );
      expect(
        asOfNow.find((r) => r.assignmentId === assignment.id)?.allocationTenths,
      ).toBe(900);
    });
  });

  describe('member skills are fetched in one batched query', () => {
    it('returns a map keyed by member id', async () => {
      const members = new MemberRepository(db);
      await members.replaceSkills(memberInA, [skillId, skillId]); // duplicate is de-duped

      const map = await members.findSkillIds([memberInA, memberInB]);
      expect(map.get(memberInA)).toEqual([skillId]);
      expect(map.get(memberInB)).toBeUndefined();
    });
  });

  describe('sessions store only the token hash (BR-AU-09)', () => {
    it('resolves a live session by hash and never returns the hash', async () => {
      const users = new UserAccountRepository(db);
      const sessions = new SessionRepository(db);

      const account = await users.create({
        username: 'admin',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fake$fake',
        passwordAlgorithm: 'argon2id',
        role: 'ADMIN',
        homeOrgUnitId: null,
        linkedMemberId: null,
      });

      const expiresAt = new Date(Date.now() + 60_000);
      const created = await sessions.create({
        tokenHash: 'hash-of-opaque-token',
        userAccountId: account.id,
        expiresAt,
      });

      // The returned Session object carries no token or hash field at all.
      expect(Object.keys(created)).not.toContain('tokenHash');
      expect(JSON.stringify(created)).not.toContain('hash-of-opaque-token');

      const active = await sessions.findActiveByTokenHash('hash-of-opaque-token', new Date());
      expect(active?.userAccountId).toBe(account.id);
    });

    it('does not resolve an expired session', async () => {
      const users = new UserAccountRepository(db);
      const sessions = new SessionRepository(db);

      const account = await users.create({
        username: 'expired-user',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fake$fake',
        passwordAlgorithm: 'argon2id',
        role: 'TEAM_MEMBER',
        homeOrgUnitId: null,
        linkedMemberId: null,
      });

      await sessions.create({
        tokenHash: 'already-expired',
        userAccountId: account.id,
        expiresAt: new Date(Date.now() - 1_000),
      });

      expect(await sessions.findActiveByTokenHash('already-expired', new Date())).toBeNull();
    });

    it('terminate is idempotent and blocks further resolution', async () => {
      const users = new UserAccountRepository(db);
      const sessions = new SessionRepository(db);

      const account = await users.create({
        username: 'logout-user',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fake$fake',
        passwordAlgorithm: 'argon2id',
        role: 'TEAM_MEMBER',
        homeOrgUnitId: null,
        linkedMemberId: null,
      });

      const session = await sessions.create({
        tokenHash: 'to-be-terminated',
        userAccountId: account.id,
        expiresAt: new Date(Date.now() + 60_000),
      });

      expect(await sessions.terminate(session.id, new Date())).toBe(true);
      expect(await sessions.terminate(session.id, new Date())).toBe(false);
      expect(await sessions.findActiveByTokenHash('to-be-terminated', new Date())).toBeNull();
    });
  });

  describe('credential lookup is the only path carrying a hash', () => {
    it('finds an account case-insensitively and returns the stored hash', async () => {
      const users = new UserAccountRepository(db);
      const credential = await users.findCredentialByUsername('ADMIN');

      expect(credential?.username).toBe('admin');
      expect(credential?.passwordAlgorithm).toBe('argon2id');
      expect(credential?.passwordHash).toContain('$argon2id$');

      // The non-credential read of the same account carries no hash.
      const identity = await users.findIdentityById(credential?.userAccountId as string);
      expect(identity).not.toBeNull();
      expect(JSON.stringify(identity)).not.toContain('argon2id');
    });
  });

  describe('org unit reference counting (BR-O-05)', () => {
    it('counts members and projects that still point at the unit', async () => {
      const orgUnits = new OrgUnitRepository(db);
      const counts = await orgUnits.countReferences(deptA);

      expect(counts.members).toBeGreaterThanOrEqual(1);
      expect(counts.projects).toBeGreaterThanOrEqual(1);
      expect(counts.childOrgUnits).toBe(0);
    });

    it('resolves a two-level subtree in one query', async () => {
      const orgUnits = new OrgUnitRepository(db);
      const team = await orgUnits.create({ name: 'Platform Team', parentOrgUnitId: deptA });

      const subtree = await orgUnits.findSubtreeIds([deptA]);
      expect(subtree).toContain(deptA);
      expect(subtree).toContain(team.id);
      expect(subtree).not.toContain(deptB);
    });
  });

  describe('reference data', () => {
    it('validates a submitted id set in one round trip', async () => {
      const referenceData = new ReferenceDataRepository(db);
      const absent = '00000000-0000-4000-8000-000000000000';
      const valid = await referenceData.findActiveIdsOfType([skillId, absent], 'SKILL');

      expect(valid.has(skillId)).toBe(true);
      expect(valid.has(absent)).toBe(false);
    });

    it('a MALFORMED id reads as absent instead of raising a 500', async () => {
      // Regression: this previously threw `invalid input syntax for type uuid`, because
      // ids arrive from client input and reached the query unvalidated.
      const referenceData = new ReferenceDataRepository(db);
      const valid = await referenceData.findActiveIdsOfType([skillId, 'missing-id'], 'SKILL');

      expect(valid.has(skillId)).toBe(true);
      expect(valid.has('missing-id')).toBe(false);
    });

    it('lookups by malformed id return empty rather than throwing', async () => {
      const referenceData = new ReferenceDataRepository(db);
      const members = new MemberRepository(db);
      const assignments = new AssignmentRepository(db);

      expect(await referenceData.findById('not-a-uuid')).toBeNull();
      expect(await members.findById('not-a-uuid', ALL)).toBeNull();
      expect(await assignments.findById('not-a-uuid', ALL)).toBeNull();
      expect(
        await assignments.findOverlapping(['not-a-uuid'], {
          start: '2026-01-01',
          end: '2026-12-31',
        }),
      ).toEqual([]);
    });

    it('rejects a duplicate name within the same type', async () => {
      const referenceData = new ReferenceDataRepository(db);
      await expect(referenceData.create('SKILL', 'TypeScript')).rejects.toThrow(ConflictError);
    });

    it('permits the same name under a DIFFERENT type', async () => {
      const referenceData = new ReferenceDataRepository(db);
      const entry = await referenceData.create('ROLE', 'TypeScript');
      expect(entry.referenceType).toBe('ROLE');
    });
  });
});
