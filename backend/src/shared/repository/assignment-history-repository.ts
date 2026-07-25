/**
 * Assignment history — append-only revision snapshots (Q1:B).
 *
 * This is the TRANSACTION-TIME half of the bi-temporal model. The `assignment` table
 * holds current values in VALID time (what is true of the world); this table holds what
 * the system believed, and when (`recorded_at` .. `superseded_at`).
 *
 * BR-A-22, Path B: an as-of-past query MUST read from here, not from `assignment`.
 * Reading current rows for a historical question returns today's values stamped with
 * yesterday's date — factually wrong answers to "what did the plan look like in March",
 * which is the whole point of keeping history.
 *
 * There is no update method beyond superseding, and no delete method, on purpose
 * (BR-A-18).
 */

import type { DbOrTx } from './db';
import type {
  AssignmentId,
  AssignmentRevision,
  DateRange,
  HistoryOperation,
  MemberId,
  UserAccountId,
} from '../types/domain';
import { toAssignmentRevision } from './mappers';
import { withPgErrors } from './pg-errors';

export interface RevisionWrite {
  assignmentId: AssignmentId;
  operation: HistoryOperation;
  actorUserId: UserAccountId | null;
  memberId: MemberId;
  projectId: string;
  allocationTenths: number;
  startDate: string;
  endDate: string;
  projectRoleId: string | null;
  savedAsOverride: boolean;
  status: 'ACTIVE' | 'ENDED';
}

export class AssignmentHistoryRepository {
  constructor(private readonly db: DbOrTx) {}

  /**
   * Appends a revision and closes the previous one, in that order, inside the caller's
   * transaction.
   *
   * The partial unique index `history_one_current_revision` guarantees at most one row
   * per assignment has `superseded_at IS NULL` (BR-A-17). If two writers race, one hits
   * that index and surfaces as a ConflictError telling the caller to retry — the
   * alternative (trusting application ordering) would silently produce two "current"
   * revisions and make every as-of query ambiguous.
   */
  async append(input: RevisionWrite): Promise<AssignmentRevision> {
    return withPgErrors(async () => {
      const now = new Date();

      // Close the current revision first, so the new row can claim the
      // superseded_at IS NULL slot the partial unique index protects.
      await this.db
        .updateTable('assignment_history')
        .set({ superseded_at: now })
        .where('assignment_id', '=', input.assignmentId)
        .where('superseded_at', 'is', null)
        .execute();

      const previous = await this.db
        .selectFrom('assignment_history')
        .select((eb) => eb.fn.max<number | null>('revision_number').as('max_revision'))
        .where('assignment_id', '=', input.assignmentId)
        .executeTakeFirst();

      const revisionNumber = (previous?.max_revision ?? 0) + 1;

      const row = await this.db
        .insertInto('assignment_history')
        .values({
          assignment_id: input.assignmentId,
          revision_number: revisionNumber,
          operation: input.operation,
          recorded_at: now,
          superseded_at: null,
          actor_user_id: input.actorUserId,
          member_id: input.memberId,
          project_id: input.projectId,
          allocation_tenths: input.allocationTenths,
          start_date: input.startDate,
          end_date: input.endDate,
          project_role_id: input.projectRoleId,
          saved_as_override: input.savedAsOverride,
          status: input.status,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return toAssignmentRevision(row);
    });
  }

  /** Full revision trail for one assignment, oldest first (US-AUD-01). */
  async findByAssignment(assignmentId: AssignmentId): Promise<AssignmentRevision[]> {
    const rows = await this.db
      .selectFrom('assignment_history')
      .selectAll()
      .where('assignment_id', '=', assignmentId)
      .orderBy('revision_number', 'asc')
      .execute();
    return rows.map(toAssignmentRevision);
  }

  /**
   * BR-A-22 Path B: the state of a member's assignments as the system knew it at
   * `asOf` (transaction time), restricted to revisions whose valid-time range overlaps
   * `range`.
   *
   * The transaction-time predicate is `recorded_at <= asOf AND (superseded_at IS NULL OR
   * superseded_at > asOf)` — the revision that was current at that instant. Batched
   * across members for the same reason as findOverlapping.
   */
  async findAsOf(
    memberIds: readonly MemberId[],
    range: DateRange,
    asOf: Date,
  ): Promise<AssignmentRevision[]> {
    if (memberIds.length === 0) return [];

    const rows = await this.db
      .selectFrom('assignment_history')
      .selectAll()
      .where('member_id', 'in', [...memberIds])
      .where('recorded_at', '<=', asOf)
      .where((eb) =>
        eb.or([eb('superseded_at', 'is', null), eb('superseded_at', '>', asOf)]),
      )
      // Inclusive valid-time overlap (AS-03), same semantics as the current-row query.
      .where('start_date', '<=', range.end)
      .where('end_date', '>=', range.start)
      .orderBy('member_id', 'asc')
      .orderBy('start_date', 'asc')
      .execute();

    return rows.map(toAssignmentRevision);
  }

  /** The current revision, for asserting the append chain is intact. */
  async findCurrent(assignmentId: AssignmentId): Promise<AssignmentRevision | null> {
    const row = await this.db
      .selectFrom('assignment_history')
      .selectAll()
      .where('assignment_id', '=', assignmentId)
      .where('superseded_at', 'is', null)
      .executeTakeFirst();
    return row ? toAssignmentRevision(row) : null;
  }
}
