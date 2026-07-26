/**
 * C-03 AssignmentComponent integration tests against REAL PostgreSQL.
 *
 * A database is required, not a convenience: the rules under test are transactional.
 * BR-A-16/BR-A-17 say the history revision is written in the SAME transaction as the
 * assignment, so the current row always equals the revision with supersededAt IS NULL. A
 * fake repository would let a broken implementation pass by simply not having
 * transactions at all.
 *
 * Skipped, and reported as skipped, when TEST_DATABASE_URL is unset.
 */

import { sql } from 'kysely';
import { AllocationComponent } from '../../src/core-domain/allocation/allocation-component';
import { AssignmentComponent } from '../../src/core-domain/assignment/assignment-component';
import { ValidationError } from '../../src/shared/errors';
import {
  AssignmentHistoryRepository,
  AssignmentRepository,
  MemberRepository,
  OrgUnitRepository,
  ProjectRepository,
  ReferenceDataRepository,
  createDb,
  createPool,
  runMigrations,
  type Db,
} from '../../src/shared/repository';
import type { ScopeFilter } from '../../src/shared/types/authorization';

const CONNECTION = process.env.TEST_DATABASE_URL;
const describeDb = CONNECTION ? describe : describe.skip;

const ALL: ScopeFilter = { orgUnitIds: 'ALL', restrictToMemberId: null };
const Q1 = { start: '2026-01-01', end: '2026-03-31' };

describeDb('AssignmentComponent against real PostgreSQL', () => {
  let db: Db;
  let component: AssignmentComponent;
  let history: AssignmentHistoryRepository;
  let assignments: AssignmentRepository;

  let memberId: string;
  let offRollMemberId: string;
  let projectId: string;

  beforeAll(async () => {
    db = createDb(createPool(CONNECTION as string));

    await sql`drop schema public cascade`.execute(db);
    await sql`create schema public`.execute(db);
    const migration = await runMigrations(db);
    if (migration.error) throw migration.error;

    const orgUnits = new OrgUnitRepository(db);
    const referenceData = new ReferenceDataRepository(db);
    const members = new MemberRepository(db);
    const projects = new ProjectRepository(db);
    assignments = new AssignmentRepository(db);
    history = new AssignmentHistoryRepository(db);

    component = new AssignmentComponent(
      db,
      assignments,
      history,
      members,
      projects,
      new AllocationComponent(),
    );

    const dept = await orgUnits.create({ name: 'Engineering', parentOrgUnitId: null });
    const role = await referenceData.create('ROLE', 'Engineer');
    const projectType = await referenceData.create('PROJECT_TYPE', 'Internal');

    memberId = (
      await members.create({
        externalRef: 'E-1',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        orgUnitId: dept.id,
        employmentType: 'ON_ROLL',
        roleId: role.id,
        vendorName: null,
        contractStartDate: null,
        contractEndDate: null,
        contractStatus: null,
      })
    ).id;

    offRollMemberId = (
      await members.create({
        externalRef: 'E-2',
        fullName: 'Contractor Person',
        email: 'contractor@example.com',
        orgUnitId: dept.id,
        employmentType: 'OFF_ROLL',
        roleId: role.id,
        vendorName: 'Vendor Ltd',
        contractStartDate: '2026-01-01',
        contractEndDate: '2026-02-28',
        contractStatus: 'ACTIVE',
      })
    ).id;

    projectId = (
      await projects.create({
        code: 'PRJ-1',
        name: 'Platform',
        description: null,
        owningOrgUnitId: dept.id,
        projectTypeId: projectType.id,
        startDate: '2026-01-01',
        plannedEndDate: '2026-06-30',
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
  });

  /** Removes assignments between tests so capacity starts clean. */
  async function clearAssignments(): Promise<void> {
    await sql`delete from assignment_history`.execute(db);
    await sql`delete from assignment`.execute(db);
  }

  beforeEach(clearAssignments);

  describe('validation (BR-A-01…04)', () => {
    it('reports every violation at once', async () => {
      const attempt = component.create(
        {
          memberId,
          projectId,
          allocationPercentage: 0,
          period: { start: '2026-03-31', end: '2026-01-01' }, // reversed
          projectRoleId: null,
        },
        false,
        ALL,
      );

      await expect(attempt).rejects.toThrow(ValidationError);
      await expect(attempt).rejects.toMatchObject({
        violations: expect.arrayContaining([
          expect.objectContaining({ field: 'period.end', rule: 'DATE_ORDER' }),
          expect.objectContaining({ field: 'allocationPercentage', rule: 'OUT_OF_RANGE' }),
        ]),
      });
    });

    it('rejects more than one decimal place as a field error, not a 500', async () => {
      await expect(
        component.create(
          {
            memberId,
            projectId,
            allocationPercentage: 37.55,
            period: Q1,
            projectRoleId: null,
          },
          false,
          ALL,
        ),
      ).rejects.toMatchObject({
        violations: [expect.objectContaining({ rule: 'PRECISION' })],
      });
    });

    it('accepts a valid one-decimal percentage and stores exact tenths', async () => {
      const result = await component.create(
        { memberId, projectId, allocationPercentage: 37.5, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      expect(result.assignment?.allocationTenths).toBe(375);
    });

    it('accepts a null projectRoleId (BR-A-21)', async () => {
      const result = await component.create(
        { memberId, projectId, allocationPercentage: 50, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      expect(result.assignment).not.toBeNull();
      expect(result.assignment?.projectRoleId).toBeNull();
    });
  });

  /**
   * The central invariant. If these fail, as-of history is unreliable.
   */
  describe('history is written in the same transaction (BR-A-16, BR-A-17)', () => {
    it('creates exactly one current revision equal to the assignment row', async () => {
      const { assignment } = await component.create(
        { memberId, projectId, allocationPercentage: 40, period: Q1, projectRoleId: null },
        false,
        ALL,
      );

      const trail = await history.findByAssignment(assignment?.id as string);
      const current = trail.filter((r) => r.supersededAt === null);

      expect(trail).toHaveLength(1);
      expect(current).toHaveLength(1);
      expect(current[0]?.operation).toBe('CREATE');
      // BR-A-17: equality, field by field.
      expect(current[0]?.allocationTenths).toBe(assignment?.allocationTenths);
      expect(current[0]?.startDate).toBe(assignment?.startDate);
      expect(current[0]?.endDate).toBe(assignment?.endDate);
      expect(current[0]?.status).toBe(assignment?.status);
    });

    it('supersedes the prior revision on update, keeping exactly one current', async () => {
      const created = await component.create(
        { memberId, projectId, allocationPercentage: 40, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      const id = created.assignment?.id as string;

      const updated = await component.update(id, { allocationPercentage: 60 }, false, ALL);

      const trail = await history.findByAssignment(id);
      const current = trail.filter((r) => r.supersededAt === null);

      expect(trail).toHaveLength(2);
      expect(current).toHaveLength(1);
      expect(current[0]?.operation).toBe('UPDATE');
      expect(current[0]?.allocationTenths).toBe(600);
      expect(current[0]?.allocationTenths).toBe(updated.assignment?.allocationTenths);

      // The superseded revision retains the OLD value — that is the whole point.
      const superseded = trail.find((r) => r.supersededAt !== null);
      expect(superseded?.allocationTenths).toBe(400);
    });

    it('a rejected write leaves NO assignment and NO revision (BR-A-10)', async () => {
      await component.create(
        { memberId, projectId, allocationPercentage: 80, period: Q1, projectRoleId: null },
        false,
        ALL,
      );

      const before = await assignments.findOverlapping([memberId], Q1);

      // 80 + 50 = 130% -> warning, and we do NOT override.
      const blocked = await component.create(
        { memberId, projectId, allocationPercentage: 50, period: Q1, projectRoleId: null },
        false,
        ALL,
      );

      expect(blocked.assignment).toBeNull();
      expect(blocked.overAllocation).toHaveLength(1);

      const after = await assignments.findOverlapping([memberId], Q1);
      expect(after).toHaveLength(before.length); // nothing persisted

      const revisions = await sql<{ count: number }>`select count(*)::int as count from assignment_history`.execute(db);
      expect(revisions.rows[0]?.count).toBe(1); // only the first assignment's CREATE
    });
  });

  describe('over-allocation is a warning, never a block (BR-A-09, BR-A-11)', () => {
    it('identifies the offending sub-period and refuses until overridden', async () => {
      await component.create(
        { memberId, projectId, allocationPercentage: 80, period: Q1, projectRoleId: null },
        false,
        ALL,
      );

      const blocked = await component.create(
        {
          memberId,
          projectId,
          allocationPercentage: 50,
          period: { start: '2026-02-01', end: '2026-02-28' },
          projectRoleId: null,
        },
        false,
        ALL,
      );

      expect(blocked.assignment).toBeNull();
      expect(blocked.overAllocation[0]?.period).toEqual({
        start: '2026-02-01',
        end: '2026-02-28',
      });
      expect(blocked.overAllocation[0]?.totalTenths).toBe(1300);
    });

    it('saves with savedAsOverride when overridden', async () => {
      await component.create(
        { memberId, projectId, allocationPercentage: 80, period: Q1, projectRoleId: null },
        false,
        ALL,
      );

      const overridden = await component.create(
        { memberId, projectId, allocationPercentage: 50, period: Q1, projectRoleId: null },
        true,
        ALL,
      );

      expect(overridden.assignment).not.toBeNull();
      expect(overridden.savedAsOverride).toBe(true);
      expect(overridden.assignment?.savedAsOverride).toBe(true);
    });

    it('does NOT set savedAsOverride when the caller passes override but nothing is over', async () => {
      // BR-A-11: the flag comes from DETECTION, not from the caller. A falsely-flagged row
      // would stay visibly marked forever under BR-A-12.
      const result = await component.create(
        { memberId, projectId, allocationPercentage: 30, period: Q1, projectRoleId: null },
        true,
        ALL,
      );

      expect(result.assignment).not.toBeNull();
      expect(result.savedAsOverride).toBe(false);
      expect(result.assignment?.savedAsOverride).toBe(false);
    });

    it('permits exactly 100.0% without a warning', async () => {
      await component.create(
        { memberId, projectId, allocationPercentage: 60, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      const result = await component.create(
        { memberId, projectId, allocationPercentage: 40, period: Q1, projectRoleId: null },
        false,
        ALL,
      );

      expect(result.overAllocation).toEqual([]);
      expect(result.assignment).not.toBeNull();
    });

    it('permits multiple concurrent assignments to the SAME project (BR-A-06)', async () => {
      const first = await component.create(
        { memberId, projectId, allocationPercentage: 30, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      const second = await component.create(
        { memberId, projectId, allocationPercentage: 20, period: Q1, projectRoleId: null },
        false,
        ALL,
      );

      expect(first.assignment).not.toBeNull();
      expect(second.assignment).not.toBeNull();
      expect(second.overAllocation).toEqual([]);
    });
  });

  /**
   * BR-A-15. Without the own-row exclusion, every edit of a fully-booked member would
   * report a spurious over-allocation.
   */
  describe('editing excludes the assignment own row (BR-A-15)', () => {
    it('allows raising an allocation that still fits once its old value is excluded', async () => {
      const created = await component.create(
        { memberId, projectId, allocationPercentage: 100, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      const id = created.assignment?.id as string;

      // 100 -> 90 must not be compared against a total that still contains the old 100.
      const updated = await component.update(id, { allocationPercentage: 90 }, false, ALL);

      expect(updated.assignment?.allocationTenths).toBe(900);
      expect(updated.overAllocation).toEqual([]);
    });

    it('still detects a genuine over-allocation on edit', async () => {
      await component.create(
        { memberId, projectId, allocationPercentage: 70, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      const other = await component.create(
        { memberId, projectId, allocationPercentage: 20, period: Q1, projectRoleId: null },
        false,
        ALL,
      );

      // Raising 20 -> 50 pushes the total to 120%.
      const blocked = await component.update(
        other.assignment?.id as string,
        { allocationPercentage: 50 },
        false,
        ALL,
      );

      expect(blocked.assignment).toBeNull();
      expect(blocked.overAllocation[0]?.totalTenths).toBe(1200);
    });

    it('refuses to move an assignment to another member or project', async () => {
      const created = await component.create(
        { memberId, projectId, allocationPercentage: 50, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      const id = created.assignment?.id as string;

      await expect(
        component.update(id, { memberId: offRollMemberId }, false, ALL),
      ).rejects.toMatchObject({ violations: [expect.objectContaining({ rule: 'IMMUTABLE' })] });
    });
  });

  describe('conflict warnings do not block (BR-A-13, BR-A-14)', () => {
    it('warns when an off-roll assignment runs past the contract end date', async () => {
      const result = await component.create(
        {
          memberId: offRollMemberId,
          projectId,
          allocationPercentage: 50,
          period: { start: '2026-01-01', end: '2026-03-31' }, // contract ends 2026-02-28
          projectRoleId: null,
        },
        false,
        ALL,
      );

      // Saved anyway — a warning, not a block.
      expect(result.assignment).not.toBeNull();
      const contractConflict = result.conflicts.find((c) => c.kind === 'CONTRACT_WINDOW');
      expect(contractConflict).toBeDefined();
      expect(contractConflict?.boundaryDate).toBe('2026-02-28');
      expect(contractConflict?.detail).toContain('2026-02-28');
    });

    it('raises no contract warning for an on-roll member', async () => {
      const result = await component.create(
        { memberId, projectId, allocationPercentage: 50, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      expect(result.conflicts.filter((c) => c.kind === 'CONTRACT_WINDOW')).toEqual([]);
    });

    it('warns when the assignment runs past the project planned end date', async () => {
      const result = await component.create(
        {
          memberId,
          projectId,
          allocationPercentage: 50,
          period: { start: '2026-01-01', end: '2026-12-31' }, // project plans to 2026-06-30
          projectRoleId: null,
        },
        false,
        ALL,
      );

      expect(result.assignment).not.toBeNull();
      expect(result.conflicts.some((c) => c.boundaryDate === '2026-06-30')).toBe(true);
    });
  });

  describe('ending early (BR-A-19, BR-A-20)', () => {
    it('moves the end date, preserves the elapsed portion, and records a revision', async () => {
      const created = await component.create(
        { memberId, projectId, allocationPercentage: 50, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      const id = created.assignment?.id as string;

      const ended = await component.endEarly(id, '2026-02-15', ALL);

      expect(ended.endDate).toBe('2026-02-15');
      expect(ended.endedEarlyOn).toBe('2026-02-15');
      expect(ended.status).toBe('ENDED');

      // The elapsed portion still consumed capacity (BR-A-07 has no status condition).
      const elapsed = await assignments.findOverlapping([memberId], {
        start: '2026-01-01',
        end: '2026-01-31',
      });
      expect(elapsed.map((a) => a.id)).toContain(id);

      // The released portion is gone.
      const released = await assignments.findOverlapping([memberId], {
        start: '2026-03-01',
        end: '2026-03-31',
      });
      expect(released.map((a) => a.id)).not.toContain(id);

      const trail = await history.findByAssignment(id);
      expect(trail.filter((r) => r.supersededAt === null)[0]?.operation).toBe('END_EARLY');
    });

    it('refuses an effective date before the start date', async () => {
      const created = await component.create(
        { memberId, projectId, allocationPercentage: 50, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      await expect(
        component.endEarly(created.assignment?.id as string, '2025-12-01', ALL),
      ).rejects.toMatchObject({ violations: [expect.objectContaining({ rule: 'DATE_ORDER' })] });
    });

    it('refuses a date that would EXTEND the assignment', async () => {
      const created = await component.create(
        { memberId, projectId, allocationPercentage: 50, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      await expect(
        component.endEarly(created.assignment?.id as string, '2026-06-30', ALL),
      ).rejects.toMatchObject({ violations: [expect.objectContaining({ rule: 'NOT_EARLIER' })] });
    });
  });

  describe('auto-end cascades (BR-M-13, BR-P-07)', () => {
    it('ends open assignments for a member and reports the count', async () => {
      await component.create(
        { memberId, projectId, allocationPercentage: 30, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      await component.create(
        {
          memberId,
          projectId,
          allocationPercentage: 20,
          period: { start: '2026-01-01', end: '2026-06-30' },
          projectRoleId: null,
        },
        false,
        ALL,
      );

      const ended = await component.autoEndForMember(memberId, '2026-02-01', null);
      expect(ended).toBe(2);

      const remaining = await assignments.findByMember(memberId, ALL);
      expect(remaining.every((a) => a.endDate <= '2026-02-01')).toBe(true);
      expect(remaining.every((a) => a.status === 'ENDED')).toBe(true);
    });

    it('records AUTO_END, distinguishing it from a deliberate ending', async () => {
      const created = await component.create(
        { memberId, projectId, allocationPercentage: 30, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      await component.autoEndForMember(memberId, '2026-02-01', null);

      const trail = await history.findByAssignment(created.assignment?.id as string);
      expect(trail.filter((r) => r.supersededAt === null)[0]?.operation).toBe('AUTO_END');
    });

    it('does not count assignments already finished before the effective date', async () => {
      await component.create(
        {
          memberId,
          projectId,
          allocationPercentage: 30,
          period: { start: '2026-01-01', end: '2026-01-15' },
          projectRoleId: null,
        },
        false,
        ALL,
      );

      // Nothing extends past 1 March, so nothing needs ending.
      expect(await component.autoEndForMember(memberId, '2026-03-01', null)).toBe(0);
    });

    it('terminates a not-yet-started assignment at its own start date', async () => {
      // Ending it at an earlier effective date would produce end < start, an invalid range
      // the database check constraint would reject.
      const created = await component.create(
        {
          memberId,
          projectId,
          allocationPercentage: 30,
          period: { start: '2026-03-01', end: '2026-03-31' },
          projectRoleId: null,
        },
        false,
        ALL,
      );

      expect(await component.autoEndForMember(memberId, '2026-01-15', null)).toBe(1);

      const row = await assignments.findById(created.assignment?.id as string, ALL);
      expect(row?.startDate).toBe('2026-03-01');
      expect(row?.endDate).toBe('2026-03-01'); // clamped to start, range stays valid
    });

    it('ends open assignments for a project', async () => {
      await component.create(
        {
          memberId,
          projectId,
          allocationPercentage: 30,
          period: { start: '2026-01-01', end: '2026-06-30' },
          projectRoleId: null,
        },
        false,
        ALL,
      );

      expect(await component.autoEndForProject(projectId, '2026-02-01', null)).toBe(1);
    });
  });

  /**
   * BR-A-24 — the member lock.
   *
   * NOTE ON HOW THIS IS TESTED. The obvious test — fire two `create` calls with
   * Promise.all and assert only one succeeds — PASSES EVEN WITH THE LOCK REMOVED, because
   * the two calls do not happen to interleave at the critical point: each performs several
   * pre-transaction validation queries, and the first transaction commits before the
   * second one opens. That test proves nothing and was deleted rather than kept as false
   * assurance.
   *
   * This test instead forces the interleaving explicitly: transaction A takes the lock and
   * holds it while transaction B tries to take it. If the lock works, B blocks until A
   * commits and therefore SEES A's row. Verified to fail when `lockMemberForUpdate` is
   * neutered.
   */
  describe('the member lock actually serialises writers (BR-A-24)', () => {
    it('makes a second transaction wait, so it sees the first transaction row', async () => {
      const { createRepositories, lockMemberForUpdate } = await import(
        '../../src/shared/repository'
      );

      let aHasLocked!: () => void;
      const aLocked = new Promise<void>((resolve) => {
        aHasLocked = resolve;
      });

      let bMayFinish!: () => void;
      const bAllowedToFinish = new Promise<void>((resolve) => {
        bMayFinish = resolve;
      });

      // Transaction A: lock, insert 600, hold briefly, commit.
      const transactionA = db.transaction().execute(async (tx) => {
        await lockMemberForUpdate(tx, memberId);
        aHasLocked();

        await createRepositories(tx).assignments.create({
          memberId,
          projectId,
          allocationTenths: 600,
          startDate: Q1.start,
          endDate: Q1.end,
          projectRoleId: null,
          savedAsOverride: false,
          actorUserId: null,
        });

        // Give B time to reach the lock and block on it.
        await new Promise((resolve) => setTimeout(resolve, 150));
        bMayFinish();
      });

      // Transaction B: starts only once A holds the lock.
      await aLocked;
      const transactionB = (async () => {
        return db.transaction().execute(async (tx) => {
          // Blocks here until A commits, IF the lock is doing its job.
          await lockMemberForUpdate(tx, memberId);
          return createRepositories(tx).assignments.findOverlapping([memberId], Q1);
        });
      })();

      await bAllowedToFinish;
      await transactionA;
      const bSaw = await transactionB;

      // The proof: B observed A's committed row. Without the lock B reads before A commits
      // and sees an empty list, so both writers would conclude there is free capacity.
      expect(bSaw).toHaveLength(1);
      expect(bSaw[0]?.allocationTenths).toBe(600);
    });
  });

  describe('as-of reconstruction uses history, not current rows (BR-A-22)', () => {
    it('returns the values held at that instant', async () => {
      const created = await component.create(
        { memberId, projectId, allocationPercentage: 30, period: Q1, projectRoleId: null },
        false,
        ALL,
      );
      const id = created.assignment?.id as string;

      const firstRevision = await history.findCurrent(id);
      const between = new Date((firstRevision?.recordedAt as Date).getTime() + 1);
      await new Promise((resolve) => setTimeout(resolve, 5));

      await component.update(id, { allocationPercentage: 90 }, false, ALL);

      const historical = await component.findAsOf([memberId], Q1, between, ALL);
      expect(historical.find((r) => r.assignmentId === id)?.allocationTenths).toBe(300);

      const now = await component.findAsOf([memberId], Q1, new Date(), ALL);
      expect(now.find((r) => r.assignmentId === id)?.allocationTenths).toBe(900);
    });
  });
});
