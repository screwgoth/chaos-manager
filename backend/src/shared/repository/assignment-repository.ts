/**
 * Assignment persistence — the reads that feed C-04 Allocation.
 *
 * R2-1 division of labour: this repository FETCHES; C-04 COMPUTES. There is no
 * segmentation, summation or over-allocation logic in this file, and C-04 issues no
 * queries. That separation is what makes the allocation algorithm unit-testable without
 * a database.
 *
 * INCLUSIVE date semantics (AS-03) throughout: two ranges overlap when
 *     a.start_date <= range.end AND a.end_date >= range.start
 * Adjacent ranges (one ending 31 Mar, the next starting 1 Apr) do NOT overlap. Using
 * `<` here instead of `<=` is the classic off-by-one that silently drops a one-day
 * conflict, so the boundary cases are covered by test.
 */

import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import type { DbOrTx } from './db';
import { permittedOrgUnitIds } from './db';
import type { Database } from './schema';
import type { ScopeFilter } from '../types/authorization';
import type {
  Assignment,
  AssignmentId,
  AssignmentStatus,
  DateRange,
  IsoDate,
  MemberId,
  ProjectId,
  ReferenceId,
  Tenths,
  UserAccountId,
} from '../types/domain';
import { isUuid, keepUuids } from '../util/ids';
import { toAssignment } from './mappers';
import { withPgErrors } from './pg-errors';

type AssignmentEb = ExpressionBuilder<Database, 'assignment'>;
type AssignmentPredicate = (eb: AssignmentEb) => Expression<SqlBool>;

export interface AssignmentWrite {
  memberId: MemberId;
  projectId: ProjectId;
  allocationTenths: Tenths;
  startDate: IsoDate;
  endDate: IsoDate;
  projectRoleId: ReferenceId | null;
  /** Set from the DETECTION result, never from a client flag (BR-A-11). */
  savedAsOverride: boolean;
  actorUserId: UserAccountId | null;
}

/**
 * An assignment enriched with the project identity the allocation view needs.
 * Returned by the overlap query so building `AllocationContribution` needs no second
 * round trip per project.
 */
export interface AssignmentWithProject extends Assignment {
  projectName: string;
  projectCode: string;
}

/**
 * Scope for assignments resolves through the MEMBER's org unit, not the project's.
 * An assignment belongs to the person whose capacity it consumes, so a manager scoped to
 * a department sees the assignments of that department's members — including their
 * assignments to projects owned elsewhere, which is exactly the cross-project view the
 * allocation feature exists to provide (US-VIS-01).
 */
function scopePredicates(scope: ScopeFilter): AssignmentPredicate[] {
  const predicates: AssignmentPredicate[] = [];

  const orgIds = permittedOrgUnitIds(scope);
  if (orgIds !== null) {
    predicates.push(
      orgIds.length === 0
        ? (eb) => eb.lit(false)
        : (eb) =>
            eb.exists(
              eb
                .selectFrom('member')
                .select('member.id')
                .whereRef('member.id', '=', 'assignment.member_id')
                .where('member.org_unit_id', 'in', orgIds),
            ),
    );
  }

  const ownMemberId = scope.restrictToMemberId;
  if (ownMemberId !== null) {
    predicates.push((eb) => eb('assignment.member_id', '=', ownMemberId));
  }

  return predicates;
}

function combine(predicates: AssignmentPredicate[]): AssignmentPredicate {
  return (eb) => eb.and(predicates.map((predicate) => predicate(eb)));
}

/** Inclusive overlap against a fixed range (AS-03). */
function overlaps(range: DateRange): AssignmentPredicate {
  return (eb) =>
    eb.and([
      eb('assignment.start_date', '<=', range.end),
      eb('assignment.end_date', '>=', range.start),
    ]);
}

export class AssignmentRepository {
  constructor(private readonly db: DbOrTx) {}

  async findById(id: AssignmentId, scope: ScopeFilter): Promise<Assignment | null> {
    if (!isUuid(id)) return null;
    const row = await this.db
      .selectFrom('assignment')
      .selectAll('assignment')
      .where('assignment.id', '=', id)
      .where(combine(scopePredicates(scope)))
      .executeTakeFirst();
    return row ? toAssignment(row) : null;
  }

  /** Unscoped, for authorization decisions that need the target before deciding. */
  async findTarget(
    id: AssignmentId,
  ): Promise<{ id: AssignmentId; memberId: MemberId; projectId: ProjectId } | null> {
    if (!isUuid(id)) return null;
    const row = await this.db
      .selectFrom('assignment')
      .select(['id', 'member_id', 'project_id'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? { id: row.id, memberId: row.member_id, projectId: row.project_id } : null;
  }

  /**
   * THE BATCHED OVERLAP QUERY (R2-1 rule 2 — the N+1 prohibition).
   *
   * One query returns the overlapping assignments for EVERY member passed in. The
   * obvious implementation — loop the members, query each — is what makes a 50-member
   * team view issue 51 queries and blow the ~1 s availability budget (U1-NFR-PE-02).
   * Callers group the result by memberId; they must not call this per member.
   *
   * `excludeAssignmentId` supports the EDIT case: when re-checking capacity for an
   * assignment being changed, its own CURRENT row must not count against the new
   * values, or every edit would appear to double-book the member (BR-A-09).
   */
  async findOverlapping(
    memberIds: readonly MemberId[],
    range: DateRange,
    options: { excludeAssignmentId?: AssignmentId; includeEnded?: boolean } = {},
  ): Promise<AssignmentWithProject[]> {
    const validMemberIds = keepUuids(memberIds);
    if (validMemberIds.length === 0) return [];

    let query = this.db
      .selectFrom('assignment')
      .innerJoin('project', 'project.id', 'assignment.project_id')
      .select([
        'assignment.id',
        'assignment.member_id',
        'assignment.project_id',
        'assignment.allocation_tenths',
        'assignment.start_date',
        'assignment.end_date',
        'assignment.project_role_id',
        'assignment.saved_as_override',
        'assignment.status',
        'assignment.ended_early_on',
        'assignment.created_at',
        'assignment.updated_at',
        'assignment.created_by_user_id',
        'assignment.updated_by_user_id',
        'project.name as project_name',
        'project.code as project_code',
      ])
      .where('assignment.member_id', 'in', validMemberIds)
      .where(overlaps(range));

    // ENDED assignments no longer consume capacity (BR-A-21), so they are excluded from
    // capacity maths by default. History views pass includeEnded to see them.
    if (options.includeEnded !== true) {
      query = query.where('assignment.status', '=', 'ACTIVE');
    }

    const excludeId = options.excludeAssignmentId;
    if (excludeId !== undefined) {
      query = query.where('assignment.id', '!=', excludeId);
    }

    const rows = await query
      .orderBy('assignment.member_id', 'asc')
      .orderBy('assignment.start_date', 'asc')
      .execute();

    return rows.map((row) => ({
      ...toAssignment(row),
      projectName: row.project_name,
      projectCode: row.project_code,
    }));
  }

  /** All assignments for one member. Scoped, because this is a user-facing read. */
  async findByMember(
    memberId: MemberId,
    scope: ScopeFilter,
    options: { includeEnded?: boolean } = {},
  ): Promise<AssignmentWithProject[]> {
    let query = this.db
      .selectFrom('assignment')
      .innerJoin('project', 'project.id', 'assignment.project_id')
      .selectAll('assignment')
      .select(['project.name as project_name', 'project.code as project_code'])
      .where('assignment.member_id', '=', memberId)
      .where(combine(scopePredicates(scope)));

    if (options.includeEnded !== true) {
      query = query.where('assignment.status', '=', 'ACTIVE');
    }

    const rows = await query.orderBy('assignment.start_date', 'asc').execute();
    return rows.map((row) => ({
      ...toAssignment(row),
      projectName: row.project_name,
      projectCode: row.project_code,
    }));
  }

  /** The project team over a period — the project-side view of the same data (US-VIS-02). */
  async findByProject(
    projectId: ProjectId,
    scope: ScopeFilter,
    range: DateRange | null,
  ): Promise<Assignment[]> {
    let query = this.db
      .selectFrom('assignment')
      .selectAll('assignment')
      .where('assignment.project_id', '=', projectId)
      .where('assignment.status', '=', 'ACTIVE')
      .where(combine(scopePredicates(scope)));

    if (range !== null) query = query.where(overlaps(range));

    const rows = await query.orderBy('assignment.start_date', 'asc').execute();
    return rows.map(toAssignment);
  }

  /**
   * Members in scope who have NO active assignment overlapping the range — the
   * bench/availability list (US-VIS-04). Computed as one anti-join rather than by
   * fetching all members and all assignments and differencing them in memory.
   */
  async findMemberIdsWithoutAssignments(
    range: DateRange,
    scope: ScopeFilter,
  ): Promise<MemberId[]> {
    const orgIds = permittedOrgUnitIds(scope);

    let query = this.db
      .selectFrom('member')
      .select('member.id')
      .where('member.status', '=', 'ACTIVE')
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('assignment')
              .select('assignment.id')
              .whereRef('assignment.member_id', '=', 'member.id')
              .where('assignment.status', '=', 'ACTIVE')
              .where('assignment.start_date', '<=', range.end)
              .where('assignment.end_date', '>=', range.start),
          ),
        ),
      );

    if (orgIds !== null) {
      query =
        orgIds.length === 0
          ? query.where((eb) => eb.lit(false))
          : query.where('member.org_unit_id', 'in', orgIds);
    }
    const ownMemberId = scope.restrictToMemberId;
    if (ownMemberId !== null) {
      query = query.where('member.id', '=', ownMemberId);
    }

    const rows = await query.orderBy('member.full_name', 'asc').execute();
    return rows.map((r) => r.id);
  }

  async create(input: AssignmentWrite): Promise<Assignment> {
    return withPgErrors(async () => {
      const row = await this.db
        .insertInto('assignment')
        .values({
          member_id: input.memberId,
          project_id: input.projectId,
          allocation_tenths: input.allocationTenths,
          start_date: input.startDate,
          end_date: input.endDate,
          project_role_id: input.projectRoleId,
          saved_as_override: input.savedAsOverride,
          created_by_user_id: input.actorUserId,
          updated_by_user_id: input.actorUserId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toAssignment(row);
    });
  }

  /** Q2:C — the assignment row is mutated in place; history is appended separately. */
  async update(id: AssignmentId, input: AssignmentWrite): Promise<Assignment | null> {
    return withPgErrors(async () => {
      const row = await this.db
        .updateTable('assignment')
        .set({
          allocation_tenths: input.allocationTenths,
          start_date: input.startDate,
          end_date: input.endDate,
          project_role_id: input.projectRoleId,
          saved_as_override: input.savedAsOverride,
          updated_by_user_id: input.actorUserId,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? toAssignment(row) : null;
    });
  }

  /**
   * BR-A-19/20: ending early sets end_date to the effective date AND marks the row
   * ENDED. Both matter: end_date drives capacity maths, status distinguishes an
   * administratively terminated assignment from one that merely lies in the past.
   */
  async endEarly(
    id: AssignmentId,
    effectiveDate: IsoDate,
    actorUserId: UserAccountId | null,
  ): Promise<Assignment | null> {
    const row = await this.db
      .updateTable('assignment')
      .set({
        end_date: effectiveDate,
        ended_early_on: effectiveDate,
        status: 'ENDED',
        updated_by_user_id: actorUserId,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toAssignment(row) : null;
  }

  async setStatus(
    id: AssignmentId,
    status: AssignmentStatus,
    actorUserId: UserAccountId | null,
  ): Promise<Assignment | null> {
    const row = await this.db
      .updateTable('assignment')
      .set({ status, updated_by_user_id: actorUserId, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toAssignment(row) : null;
  }

  /** Distinct member ids carrying at least one assignment to the project. */
  async findMemberIdsByProject(projectId: ProjectId): Promise<MemberId[]> {
    const rows = await this.db
      .selectFrom('assignment')
      .select('member_id')
      .distinct()
      .where('project_id', '=', projectId)
      .where('status', '=', 'ACTIVE')
      .execute();
    return rows.map((r) => r.member_id);
  }

  /** Active assignments extending beyond a date — used when deactivating a member. */
  async findActiveExtendingBeyond(
    memberId: MemberId,
    date: IsoDate,
  ): Promise<Assignment[]> {
    const rows = await this.db
      .selectFrom('assignment')
      .selectAll()
      .where('member_id', '=', memberId)
      .where('status', '=', 'ACTIVE')
      .where('end_date', '>', date)
      .orderBy('start_date', 'asc')
      .execute();
    return rows.map(toAssignment);
  }
}
