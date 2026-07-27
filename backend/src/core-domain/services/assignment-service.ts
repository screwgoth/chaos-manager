/**
 * S-05 AssignmentService.
 *
 * THE EIGHT-STEP CREATE FLOW (business-logic-model.md §4.1) lives in C-03, not here — and
 * deliberately so. The member lock and the transaction must span the capacity check AND the
 * write (BR-A-24), which means they belong in the component that owns the transaction
 * boundary. Duplicating any of it here would create a second place for the invariant to
 * drift.
 *
 * What this service owns instead: deriving the scope from the session (BR-R-06), enforcing
 * that TEAM_LEAD cannot modify assignments (BR-R-03, via the authorization component), and
 * the two-step override protocol's service-side contract.
 */

import type {
  AssignmentComponent,
  AssignmentInput,
  CreateAssignmentResult,
} from '../assignment/assignment-component';
import { NotFoundError } from '../../shared/errors';
import type {
  Assignment,
  AssignmentId,
  AssignmentRevision,
  DateRange,
  IsoDate,
  MemberId,
  ProjectId,
  VerifiedIdentity,
} from '../../shared/types/domain';
import type { AccessControlService } from './access-control-service';

export class AssignmentService {
  constructor(
    private readonly assignments: AssignmentComponent,
    private readonly accessControl: AccessControlService,
  ) {}

  /**
   * US-ASN-01, US-ASN-05, US-ASN-06.
   *
   * `overrideOverAllocation` is the SECOND step of the two-step protocol: the first call
   * arrives with it false, and if the capacity check finds a problem the result carries
   * `assignment: null` plus the offending sub-periods, having written nothing (BR-A-10).
   * The client re-submits with it true to proceed.
   *
   * Note this flag is permitted from the client — it is a user DECISION, not an
   * authorization claim. What is NOT taken from the client is `savedAsOverride`, which C-03
   * derives from the detection result (BR-A-11).
   */
  async create(
    input: AssignmentInput,
    overrideOverAllocation: boolean,
    identity: VerifiedIdentity,
  ): Promise<CreateAssignmentResult> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'ASSIGNMENT', {
      orgUnitId: null,
      memberId: input.memberId,
    });

    return this.assignments.create(
      input,
      overrideOverAllocation,
      this.accessControl.filterFor(scope),
      identity.userAccountId,
    );
  }

  async update(
    id: AssignmentId,
    input: Partial<AssignmentInput>,
    overrideOverAllocation: boolean,
    identity: VerifiedIdentity,
  ): Promise<CreateAssignmentResult> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'ASSIGNMENT', { orgUnitId: null, memberId: null });

    return this.assignments.update(
      id,
      input,
      overrideOverAllocation,
      this.accessControl.filterFor(scope),
      identity.userAccountId,
    );
  }

  /** US-ASN-03. */
  async endEarly(
    id: AssignmentId,
    effectiveEndDate: IsoDate,
    identity: VerifiedIdentity,
  ): Promise<Assignment> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'ASSIGNMENT', { orgUnitId: null, memberId: null });

    return this.assignments.endEarly(
      id,
      effectiveEndDate,
      this.accessControl.filterFor(scope),
      identity.userAccountId,
    );
  }

  async getById(id: AssignmentId, identity: VerifiedIdentity): Promise<Assignment> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ASSIGNMENT');

    const assignment = await this.assignments.getById(id, this.accessControl.filterFor(scope));
    // NOT FOUND rather than FORBIDDEN, for the same reason as MemberService.getById.
    if (!assignment) throw new NotFoundError('The assignment');
    return assignment;
  }

  /** US-ASN-02. A TEAM_MEMBER reaching for another member gets an empty list, not an error. */
  async findByMember(
    memberId: MemberId,
    range: DateRange | null,
    identity: VerifiedIdentity,
  ): Promise<Assignment[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ASSIGNMENT', { orgUnitId: null, memberId });
    return this.assignments.findByMember(memberId, range, this.accessControl.filterFor(scope));
  }

  /** The caller's own assignments, resolved from the scope rather than a supplied id. */
  async findOwn(range: DateRange | null, identity: VerifiedIdentity): Promise<Assignment[]> {
    const scope = this.accessControl.scopeFor(identity);
    if (scope.ownMemberId === null) return [];
    return this.findByMember(scope.ownMemberId, range, identity);
  }

  async findByProject(
    projectId: ProjectId,
    range: DateRange | null,
    identity: VerifiedIdentity,
  ): Promise<Assignment[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ASSIGNMENT');
    return this.assignments.findByProject(projectId, range, this.accessControl.filterFor(scope));
  }

  /**
   * US-ASN-07: the historical view. BR-A-22 Path B — resolves against AssignmentHistory,
   * never current rows.
   *
   * `asOf` defaults to the END of the given valid date, per business-logic-model.md §5:
   * "as the records stood at the end of that day". Using the start of the day would exclude
   * changes made during it.
   */
  async findAsOf(
    memberIds: MemberId[],
    range: DateRange,
    asOfDate: IsoDate,
    identity: VerifiedIdentity,
  ): Promise<AssignmentRevision[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ASSIGNMENT');

    const transactionInstant = new Date(`${asOfDate}T23:59:59.999Z`);

    // A TEAM_MEMBER may only ask about themselves. Applied here rather than relying on the
    // history query, which is keyed by member id and has no scope filter of its own.
    const permitted =
      scope.ownMemberId !== null && scope.role === 'TEAM_MEMBER'
        ? memberIds.filter((id) => id === scope.ownMemberId)
        : memberIds;

    return this.assignments.findAsOf(
      permitted,
      range,
      transactionInstant,
      this.accessControl.filterFor(scope),
    );
  }
}
