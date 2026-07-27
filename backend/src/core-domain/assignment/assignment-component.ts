/**
 * C-03 AssignmentComponent — BR-A-01…23.
 *
 * THE CENTRAL INVARIANT (BR-A-16, BR-A-17): every mutation writes an AssignmentHistory
 * revision and closes the prior one IN THE SAME TRANSACTION, so the current `assignment`
 * row always equals the revision whose `supersededAt IS NULL`. If those two ever diverge,
 * every as-of query silently returns a history that never happened — and nothing would
 * report an error. That is why each mutating method here runs inside `withTransaction`
 * and never writes the assignment row without also appending a revision.
 *
 * THE SECOND INVARIANT (BR-A-24): the member row is locked FOR UPDATE before the
 * over-allocation check, and the lock is held through the write. Without it two concurrent
 * writers both pass the check and both commit, producing an over-allocation nobody was
 * warned about and which carries no override flag.
 *
 * Over-allocation is a WARNING, never a block (BR-A-09). Cancelling persists nothing
 * (BR-A-10). Proceeding sets `savedAsOverride` from the DETECTION result, never from the
 * caller's flag (BR-A-11).
 */

import { NotFoundError, ValidationError, ViolationCollector } from '../../shared/errors';
import type {
  AssignmentHistoryRepository,
  AssignmentRepository,
  Db,
  MemberRepository,
  ProjectRepository,
} from '../../shared/repository';
import { createRepositories, lockMemberForUpdate } from '../../shared/repository';
import type { ScopeFilter } from '../../shared/types/authorization';
import type {
  Assignment,
  AssignmentConflict,
  AssignmentId,
  AssignmentRevision,
  DateRange,
  HistoryOperation,
  IsoDate,
  MemberId,
  OverAllocationFinding,
  ProjectId,
  ReferenceId,
  Tenths,
} from '../../shared/types/domain';
import { isIsoDate, isValidRange, rangesOverlap, today } from '../../shared/util/dates';
import { isValidAssignmentTenths, percentageToTenths } from '../../shared/util/tenths';
import type { AllocationComponent } from '../allocation/allocation-component';

/** Marks the not-yet-persisted assignment inside an over-allocation check. */
const PENDING_ASSIGNMENT_ID = 'pending';

export interface AssignmentInput {
  memberId: MemberId;
  projectId: ProjectId;
  /** Accepted as a percentage (e.g. 37.5) and converted to integer tenths (BR-A-02/03). */
  allocationPercentage: number;
  period: DateRange;
  /** BR-A-21: optional. An assignment without one is valid and complete. */
  projectRoleId: ReferenceId | null;
}

export interface CreateAssignmentResult {
  /** null when blocked pending an override decision — nothing was written (BR-A-10). */
  assignment: Assignment | null;
  /** Non-empty when a warning was raised; identifies each offending sub-period. */
  overAllocation: OverAllocationFinding[];
  savedAsOverride: boolean;
  conflicts: AssignmentConflict[];
}

export class AssignmentComponent {
  constructor(
    private readonly db: Db,
    private readonly assignments: AssignmentRepository,
    private readonly history: AssignmentHistoryRepository,
    private readonly members: MemberRepository,
    private readonly projects: ProjectRepository,
    private readonly allocation: AllocationComponent,
  ) {}

  async getById(id: AssignmentId, scope: ScopeFilter): Promise<Assignment | null> {
    return this.assignments.findById(id, scope);
  }

  async findByMember(
    memberId: MemberId,
    range: DateRange | null,
    scope: ScopeFilter,
  ): Promise<Assignment[]> {
    const all = await this.assignments.findByMember(memberId, scope);
    if (range === null) return all;
    return all.filter((a) => rangesOverlap({ start: a.startDate, end: a.endDate }, range));
  }

  async findByProject(
    projectId: ProjectId,
    range: DateRange | null,
    scope: ScopeFilter,
  ): Promise<Assignment[]> {
    return this.assignments.findByProject(projectId, scope, range);
  }

  async findOverlapping(
    memberIds: MemberId[],
    range: DateRange,
    _scope: ScopeFilter,
  ): Promise<Assignment[]> {
    return this.assignments.findOverlapping(memberIds, range);
  }

  /**
   * BR-A-22, Path B: as-of-date queries resolve against AssignmentHistory — transaction
   * time AND valid time — never against current rows.
   *
   * Reading current rows here would answer "what did the plan look like in March?" with
   * today's numbers stamped with March's dates: a confidently wrong answer, which is worse
   * than an error because nothing looks broken.
   *
   * BR-A-23: assignments of members since deactivated are INCLUDED. The history table is
   * keyed by member id and carries no member-status predicate, so this holds by
   * construction — a deactivated member's past allocations remain visible.
   */
  async findAsOf(
    memberIds: readonly MemberId[],
    range: DateRange,
    asOf: Date,
    _scope: ScopeFilter,
  ): Promise<AssignmentRevision[]> {
    return this.history.findAsOf(memberIds, range, asOf);
  }

  /**
   * Create.
   *
   * The eight-step flow from business-logic-model.md, in order:
   *   1. validate the input shape                     (BR-A-01…04)
   *   2. load and check member and project            (BR-A-05)
   *   3. open a transaction and LOCK the member       (BR-A-24)
   *   4. fetch overlapping assignments, batched       (R2-1 rule 2)
   *   5. detect over-allocation per sub-period        (BR-A-08)
   *   6. if over-allocated and not overridden -> STOP, persisting nothing (BR-A-09/10)
   *   7. insert the assignment                        (savedAsOverride from detection, BR-A-11)
   *   8. append the history revision in the SAME transaction (BR-A-16)
   */
  async create(
    input: AssignmentInput,
    overrideOverAllocation: boolean,
    scope: ScopeFilter,
    actorUserId: string | null = null,
  ): Promise<CreateAssignmentResult> {
    const allocationTenths = this.validateInput(input);
    const { conflicts } = await this.loadAndValidateTargets(input, allocationTenths);

    return this.db.transaction().execute(async (tx) => {
      const repositories = createRepositories(tx);

      // BR-A-24 — must precede the read that the decision depends on.
      await lockMemberForUpdate(tx, input.memberId);

      const existing = await repositories.assignments.findOverlapping(
        [input.memberId],
        input.period,
      );

      const overAllocation = this.allocation.detectOverAllocation(
        input.memberId,
        [
          ...existing,
          // The assignment as it WOULD be. Included in the check so the warning reflects
          // the state the user is about to create, not the state before it.
          {
            id: PENDING_ASSIGNMENT_ID,
            memberId: input.memberId,
            projectId: input.projectId,
            allocationTenths,
            startDate: input.period.start,
            endDate: input.period.end,
            savedAsOverride: false,
          },
        ],
        input.period,
      );

      // BR-A-09/BR-A-10: a warning, and cancelling persists NOTHING. Returning from
      // inside the transaction without writing means it commits empty.
      if (overAllocation.length > 0 && !overrideOverAllocation) {
        return {
          assignment: null,
          overAllocation,
          savedAsOverride: false,
          conflicts,
        };
      }

      // BR-A-11: derived from DETECTION, not from the caller's flag. A caller that sends
      // override=true on a non-over-allocated assignment must not get a row falsely
      // flagged as an override, because BR-A-12 keeps that flag visible forever.
      const savedAsOverride = overAllocation.length > 0;

      const assignment = await repositories.assignments.create({
        memberId: input.memberId,
        projectId: input.projectId,
        allocationTenths,
        startDate: input.period.start,
        endDate: input.period.end,
        projectRoleId: input.projectRoleId,
        savedAsOverride,
        actorUserId,
      });

      // BR-A-16: same transaction. If this throws, the assignment insert rolls back too,
      // which is what keeps BR-A-17 true.
      await this.appendRevision(repositories.assignmentHistory, assignment, 'CREATE', actorUserId);

      return { assignment, overAllocation, savedAsOverride, conflicts };
    });
  }

  /**
   * Update. Same flow as create, plus BR-A-15: the assignment's OWN current row is
   * excluded from its over-allocation check.
   *
   * Without that exclusion, editing an assignment from 50% to 60% would compare the new
   * 60% against a total that still contains the old 50%, so every edit of a
   * fully-allocated member would report a spurious over-allocation.
   */
  async update(
    id: AssignmentId,
    input: Partial<AssignmentInput>,
    overrideOverAllocation: boolean,
    scope: ScopeFilter,
    actorUserId: string | null = null,
  ): Promise<CreateAssignmentResult> {
    const current = await this.assignments.findById(id, scope);
    if (!current) throw new NotFoundError('The assignment');

    const merged: AssignmentInput = {
      // Member and project are NOT editable: moving an assignment to a different person
      // would rewrite two members' capacity history in one step, with no record that it
      // happened. End this assignment and create another.
      memberId: current.memberId,
      projectId: current.projectId,
      allocationPercentage:
        input.allocationPercentage ?? current.allocationTenths / 10,
      period: input.period ?? { start: current.startDate, end: current.endDate },
      projectRoleId:
        input.projectRoleId !== undefined ? input.projectRoleId : current.projectRoleId,
    };

    this.rejectIdentityChange(input, current);

    const allocationTenths = this.validateInput(merged);
    const { conflicts } = await this.loadAndValidateTargets(merged, allocationTenths, {
      allowInactiveProject: true,
    });

    return this.db.transaction().execute(async (tx) => {
      const repositories = createRepositories(tx);
      await lockMemberForUpdate(tx, merged.memberId);

      // BR-A-15 — exclude this assignment's own row.
      const existing = await repositories.assignments.findOverlapping(
        [merged.memberId],
        merged.period,
        { excludeAssignmentId: id },
      );

      const overAllocation = this.allocation.detectOverAllocation(
        merged.memberId,
        [
          ...existing,
          // The edited values. `existing` already excludes this assignment's own current
          // row (BR-A-15), so this replaces it rather than double-counting.
          {
            id,
            memberId: merged.memberId,
            projectId: merged.projectId,
            allocationTenths,
            startDate: merged.period.start,
            endDate: merged.period.end,
            savedAsOverride: false,
          },
        ],
        merged.period,
      );

      if (overAllocation.length > 0 && !overrideOverAllocation) {
        return { assignment: null, overAllocation, savedAsOverride: false, conflicts };
      }

      const savedAsOverride = overAllocation.length > 0;

      const assignment = await repositories.assignments.update(id, {
        memberId: merged.memberId,
        projectId: merged.projectId,
        allocationTenths,
        startDate: merged.period.start,
        endDate: merged.period.end,
        projectRoleId: merged.projectRoleId,
        savedAsOverride,
        actorUserId,
      });
      if (!assignment) throw new NotFoundError('The assignment');

      await this.appendRevision(repositories.assignmentHistory, assignment, 'UPDATE', actorUserId);

      return { assignment, overAllocation, savedAsOverride, conflicts };
    });
  }

  /**
   * BR-A-19: ending early sets endDate to the effective date, releasing allocation from
   * that date forward while PRESERVING the elapsed portion.
   *
   * No over-allocation check: reducing a period can only lower totals.
   */
  async endEarly(
    id: AssignmentId,
    effectiveEndDate: IsoDate,
    scope: ScopeFilter,
    actorUserId: string | null = null,
  ): Promise<Assignment> {
    const current = await this.assignments.findById(id, scope);
    if (!current) throw new NotFoundError('The assignment');

    const violations = new ViolationCollector();
    violations
      .addIf(
        !isIsoDate(effectiveEndDate),
        'effectiveEndDate',
        'INVALID_DATE',
        'A valid effective end date (YYYY-MM-DD) is required.',
      )
      .addIf(
        isIsoDate(effectiveEndDate) && effectiveEndDate < current.startDate,
        'effectiveEndDate',
        'DATE_ORDER',
        `The effective end date cannot be before the assignment start date (${current.startDate}). ` +
          'To remove the assignment entirely, delete it rather than ending it.',
      )
      .addIf(
        isIsoDate(effectiveEndDate) && effectiveEndDate > current.endDate,
        'effectiveEndDate',
        'NOT_EARLIER',
        `The assignment already ends on ${current.endDate}; ending it "early" on a later date would extend it. ` +
          'Use update to extend an assignment.',
      );
    violations.throwIfAny('The assignment could not be ended.');

    return this.db.transaction().execute(async (tx) => {
      const repositories = createRepositories(tx);

      const assignment = await repositories.assignments.endEarly(id, effectiveEndDate, actorUserId);
      if (!assignment) throw new NotFoundError('The assignment');

      await this.appendRevision(
        repositories.assignmentHistory,
        assignment,
        'END_EARLY',
        actorUserId,
      );
      return assignment;
    });
  }

  /**
   * The auto-end cascade for member deactivation (BR-M-13). Implements
   * `AssignmentAutoEnder` so MemberComponent need not know how history is written.
   *
   * Every ending writes its own revision with operation AUTO_END, which is what
   * distinguishes "the system ended this because the member left" from "someone ended
   * this deliberately" when the trail is read back later.
   */
  async autoEndForMember(
    memberId: MemberId,
    effectiveDate: IsoDate,
    actorUserId: string | null,
  ): Promise<number> {
    return this.db.transaction().execute(async (tx) => {
      const repositories = createRepositories(tx);
      await lockMemberForUpdate(tx, memberId);

      const open = await repositories.assignments.findActiveExtendingBeyond(
        memberId,
        effectiveDate,
      );

      let ended = 0;
      for (const assignment of open) {
        // An assignment that had not started yet cannot be "ended" at a date before its
        // start; it is terminated at its own start date so the range stays valid.
        const endAt =
          assignment.startDate > effectiveDate ? assignment.startDate : effectiveDate;

        const updated = await repositories.assignments.endEarly(
          assignment.id,
          endAt,
          actorUserId,
        );
        if (!updated) continue;

        await this.appendRevision(
          repositories.assignmentHistory,
          updated,
          'AUTO_END',
          actorUserId,
        );
        ended += 1;
      }
      return ended;
    });
  }

  /** The auto-end cascade for project closure (BR-P-07). Same reasoning as above. */
  async autoEndForProject(
    projectId: ProjectId,
    effectiveDate: IsoDate,
    actorUserId: string | null,
  ): Promise<number> {
    return this.db.transaction().execute(async (tx) => {
      const repositories = createRepositories(tx);

      const all = await repositories.assignments.findByProject(
        projectId,
        { orgUnitIds: 'ALL', restrictToMemberId: null },
        null,
      );
      const open = all.filter((a) => a.status === 'ACTIVE' && a.endDate > effectiveDate);

      let ended = 0;
      for (const assignment of open) {
        await lockMemberForUpdate(tx, assignment.memberId);

        const endAt =
          assignment.startDate > effectiveDate ? assignment.startDate : effectiveDate;
        const updated = await repositories.assignments.endEarly(
          assignment.id,
          endAt,
          actorUserId,
        );
        if (!updated) continue;

        await this.appendRevision(
          repositories.assignmentHistory,
          updated,
          'AUTO_END',
          actorUserId,
        );
        ended += 1;
      }
      return ended;
    });
  }

  // --- internals ----------------------------------------------------------

  /** The one place a revision is built, so BR-A-17's equality cannot drift per call site. */
  private async appendRevision(
    history: AssignmentHistoryRepository,
    assignment: Assignment,
    operation: HistoryOperation,
    actorUserId: string | null,
  ): Promise<void> {
    await history.append({
      assignmentId: assignment.id,
      operation,
      actorUserId,
      memberId: assignment.memberId,
      projectId: assignment.projectId,
      allocationTenths: assignment.allocationTenths,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      projectRoleId: assignment.projectRoleId,
      savedAsOverride: assignment.savedAsOverride,
      status: assignment.status,
    });
  }

  /** BR-A-01…04, reported together. Returns the validated integer tenths. */
  private validateInput(input: AssignmentInput): Tenths {
    const violations = new ViolationCollector();

    violations
      .addIf(!input.memberId, 'memberId', 'REQUIRED', 'A member is required.')
      .addIf(!input.projectId, 'projectId', 'REQUIRED', 'A project is required.')
      .addIf(
        !isIsoDate(input.period?.start),
        'period.start',
        'INVALID_DATE',
        'A valid start date (YYYY-MM-DD) is required.',
      )
      .addIf(
        !isIsoDate(input.period?.end),
        'period.end',
        'INVALID_DATE',
        'A valid end date (YYYY-MM-DD) is required.',
      );

    if (isIsoDate(input.period?.start) && isIsoDate(input.period?.end)) {
      // BR-A-04, inclusive bounds.
      violations.addIf(
        !isValidRange(input.period),
        'period.end',
        'DATE_ORDER',
        'The end date cannot be before the start date.',
      );
    }

    // BR-A-02: 0.1–100.0 with at most one decimal place. percentageToTenths throws a
    // RangeError for extra precision, which is converted into a field violation here so
    // the caller sees it beside the input rather than as a 500.
    let tenths = 0;
    if (input.allocationPercentage === undefined || input.allocationPercentage === null) {
      violations.add('allocationPercentage', 'REQUIRED', 'An allocation percentage is required.');
    } else {
      try {
        tenths = percentageToTenths(input.allocationPercentage);
        if (!isValidAssignmentTenths(tenths)) {
          violations.add(
            'allocationPercentage',
            'OUT_OF_RANGE',
            'An allocation must be between 0.1% and 100.0%.',
          );
        }
      } catch {
        violations.add(
          'allocationPercentage',
          'PRECISION',
          'An allocation supports at most one decimal place (for example 37.5).',
        );
      }
    }

    violations.throwIfAny('The assignment could not be saved.');
    return tenths;
  }

  /**
   * BR-A-05 (member and project must be ACTIVE) plus the two WARNING conditions,
   * BR-A-13 and BR-A-14, which must NOT block.
   *
   * The distinction is the point: an inactive member or a closed project is a hard error
   * because the assignment could never be valid, whereas assigning an off-roll member
   * past their contract end is a legitimate plan that needs a visible caveat.
   */
  private async loadAndValidateTargets(
    input: AssignmentInput,
    _allocationTenths: Tenths,
    options: { allowInactiveProject?: boolean } = {},
  ): Promise<{ conflicts: AssignmentConflict[] }> {
    const violations = new ViolationCollector();
    const conflicts: AssignmentConflict[] = [];

    const member = await this.members.findLocation(input.memberId);
    if (!member) {
      violations.add('memberId', 'NOT_FOUND', 'That member does not exist.');
    } else if (member.status !== 'ACTIVE') {
      // BR-A-05: hard error.
      violations.add(
        'memberId',
        'INACTIVE',
        'That member is deactivated and cannot take new assignments.',
      );
    }

    const project = await this.projects.findLocation(input.projectId);
    if (!project) {
      violations.add('projectId', 'NOT_FOUND', 'That project does not exist.');
    } else if (project.status !== 'ACTIVE' && options.allowInactiveProject !== true) {
      violations.add(
        'projectId',
        'CLOSED',
        'That project is closed and cannot take new assignments.',
      );
    }

    violations.throwIfAny('The assignment could not be saved.');

    // BR-A-13: contract-window WARNING naming the contract end date.
    if (member) {
      const windows = await this.members.findContractWindows([input.memberId]);
      const window = windows.get(input.memberId);
      if (window && isIsoDate(input.period?.end) && input.period.end > window.endDate) {
        conflicts.push({
          kind: 'CONTRACT_WINDOW',
          detail:
            `This assignment runs to ${input.period.end}, beyond the member's contract ` +
            `end date of ${window.endDate}. The assignment can still be saved.`,
          boundaryDate: window.endDate,
        });
      }
      if (window && isIsoDate(input.period?.start) && input.period.start < window.startDate) {
        conflicts.push({
          kind: 'CONTRACT_WINDOW',
          detail:
            `This assignment starts on ${input.period.start}, before the member's contract ` +
            `start date of ${window.startDate}. The assignment can still be saved.`,
          boundaryDate: window.startDate,
        });
      }
    }

    // BR-A-14: outside the project's planned window is a warning, not a block — plans
    // legitimately extend, and blocking would force a project edit first.
    if (project && isIsoDate(input.period?.end) && input.period.end > project.plannedEndDate) {
      conflicts.push({
        kind: 'PROJECT_CLOSED',
        detail:
          `This assignment runs to ${input.period.end}, beyond the project's planned end ` +
          `date of ${project.plannedEndDate}. The assignment can still be saved.`,
        boundaryDate: project.plannedEndDate,
      });
    }

    return { conflicts };
  }

  /** Member and project are immutable on an assignment — see the note in `update`. */
  private rejectIdentityChange(input: Partial<AssignmentInput>, current: Assignment): void {
    if (input.memberId !== undefined && input.memberId !== current.memberId) {
      throw new ValidationError('The assignment could not be updated.', [
        {
          field: 'memberId',
          rule: 'IMMUTABLE',
          detail:
            'An assignment cannot be moved to a different member — that would rewrite two ' +
            'members’ capacity history in one step. End this assignment and create a new one.',
        },
      ]);
    }
    if (input.projectId !== undefined && input.projectId !== current.projectId) {
      throw new ValidationError('The assignment could not be updated.', [
        {
          field: 'projectId',
          rule: 'IMMUTABLE',
          detail:
            'An assignment cannot be moved to a different project. End this assignment and ' +
            'create a new one on the other project.',
        },
      ]);
    }
  }
}

/** Re-exported for callers that only need the current date convention. */
export { today };
