/**
 * S-06 AllocationQueryService — the I/O half of allocation.
 *
 * C-04 is pure and takes pre-fetched data; this service is where the fetching, scoping and
 * pagination live. That split is the resolution of the C-04 interface deviation recorded in
 * `business-logic-summary.md` §7.
 *
 * THE N+1 PROHIBITION IS ENFORCED HERE. Each method issues ONE batched
 * `findOverlapping(memberIds[], range)` for every member in the view, then hands the flat
 * result to C-04 to group. A loop calling the repository per member is what makes a
 * 50-member team view 51 queries and blows the ~1 s availability budget (U1-NFR-PE-02).
 */

import type { AllocationComponent, AllocationOnDate, AvailabilityResult, MemberAllocationRow, TimelineSegment } from '../allocation/allocation-component';
import type { AssignmentRepository, MemberRepository } from '../../shared/repository';
import type {
  AllocationSegment,
  DateRange,
  EmploymentType,
  IsoDate,
  MemberId,
  MemberSummary,
  OrgUnitId,
  OverAllocationFinding,
  Page,
  ReferenceId,
  Tenths,
  VerifiedIdentity,
} from '../../shared/types/domain';
import type { AccessControlService } from './access-control-service';
import { tenthsToPercentage } from '../../shared/util/tenths';

export interface AllocationViewCriteria {
  orgUnitIds: OrgUnitId[] | null;
  employmentType: EmploymentType | null;
  roleId: ReferenceId | null;
  skillIds: ReferenceId[] | null;
  offset: number;
  limit: number;
}

export interface AvailabilityQuery extends AllocationViewCriteria {
  range: DateRange;
  /** Filters to members with at least this much spare capacity somewhere in the range. */
  minimumAvailableTenths: Tenths | null;
}

const DEFAULT_CRITERIA: AllocationViewCriteria = {
  orgUnitIds: null,
  employmentType: null,
  roleId: null,
  skillIds: null,
  offset: 0,
  limit: 50,
};

export class AllocationQueryService {
  constructor(
    private readonly allocation: AllocationComponent,
    private readonly members: MemberRepository,
    private readonly assignments: AssignmentRepository,
    private readonly accessControl: AccessControlService,
  ) {}

  /**
   * US-VIS-01: the current allocation view.
   *
   * Two queries total, regardless of how many members are shown: one page of members, one
   * batched fetch of their overlapping assignments.
   */
  async currentAllocationView(
    asOf: IsoDate,
    criteria: Partial<AllocationViewCriteria>,
    identity: VerifiedIdentity,
  ): Promise<Page<MemberAllocationRow>> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ALLOCATION_VIEW');
    const filter = this.accessControl.filterFor(scope);
    const merged = { ...DEFAULT_CRITERIA, ...criteria };

    const page = await this.members.search(
      {
        search: null,
        orgUnitIds: merged.orgUnitIds,
        employmentType: merged.employmentType,
        status: 'ACTIVE',
        skillIds: merged.skillIds,
        roleId: merged.roleId,
        offset: merged.offset,
        limit: merged.limit,
      },
      filter,
    );

    // ONE query for every member on the page.
    const assignments = await this.assignments.findOverlapping(
      page.items.map((member) => member.id),
      { start: asOf, end: asOf },
    );

    return {
      items: this.allocation.currentAllocationView(asOf, page.items, assignments),
      total: page.total,
      offset: page.offset,
      limit: page.limit,
    };
  }

  /** US-VIS-02 / US-VIS-03: availability across a range. */
  async availability(
    query: Partial<AvailabilityQuery> & { range: DateRange },
    identity: VerifiedIdentity,
  ): Promise<Page<AvailabilityResult>> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ALLOCATION_VIEW');
    const filter = this.accessControl.filterFor(scope);
    const merged = { ...DEFAULT_CRITERIA, minimumAvailableTenths: null, ...query };

    const page = await this.members.search(
      {
        search: null,
        orgUnitIds: merged.orgUnitIds,
        employmentType: merged.employmentType,
        status: 'ACTIVE',
        skillIds: merged.skillIds,
        roleId: merged.roleId,
        offset: merged.offset,
        limit: merged.limit,
      },
      filter,
    );

    const assignments = await this.assignments.findOverlapping(
      page.items.map((member) => member.id),
      merged.range,
    );

    let results = this.allocation.availabilityFor(page.items, merged.range, assignments);

    const minimum = merged.minimumAvailableTenths;
    if (minimum !== null) {
      // Filtered on MAXIMUM availability: the question "who has 50% free?" is asking whether
      // there is any window worth negotiating, not whether they are free throughout.
      results = results.filter((result) => result.maxAvailableTenths >= minimum);
    }

    return {
      items: results,
      // NOTE: `total` is the unfiltered member total. When minimumAvailableTenths is applied
      // the page may contain fewer items than the total implies, because the capacity filter
      // runs after the query. Stated rather than silently wrong; moving the filter into SQL
      // would require the segmentation to run there, which is precisely what C-04 exists to
      // avoid.
      total: page.total,
      offset: page.offset,
      limit: page.limit,
    };
  }

  /** US-VIS-03: every over-allocated sub-period, across the members in scope. */
  async overAllocated(
    range: DateRange,
    criteria: Partial<AllocationViewCriteria>,
    identity: VerifiedIdentity,
  ): Promise<OverAllocationFinding[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ALLOCATION_VIEW');
    const filter = this.accessControl.filterFor(scope);
    const merged = { ...DEFAULT_CRITERIA, ...criteria };

    const page = await this.members.search(
      {
        search: null,
        orgUnitIds: merged.orgUnitIds,
        employmentType: merged.employmentType,
        status: 'ACTIVE',
        skillIds: merged.skillIds,
        roleId: merged.roleId,
        offset: 0,
        // Over-allocation is a whole-population question: paginating it would hide
        // problems on page two, which defeats the purpose of a warning list.
        limit: 5000,
      },
      filter,
    );

    const assignments = await this.assignments.findOverlapping(
      page.items.map((member) => member.id),
      range,
    );

    return this.allocation.overAllocatedMembers(range, assignments);
  }

  /** US-VIS-06: the bench. Computed as an anti-join in SQL, not by differencing in memory. */
  async unallocated(range: DateRange, identity: VerifiedIdentity): Promise<MemberSummary[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ALLOCATION_VIEW');
    const filter = this.accessControl.filterFor(scope);

    const memberIds = await this.assignments.findMemberIdsWithoutAssignments(range, filter);
    if (memberIds.length === 0) return [];

    const page = await this.members.search(
      {
        search: null,
        orgUnitIds: null,
        employmentType: null,
        status: 'ACTIVE',
        skillIds: null,
        roleId: null,
        offset: 0,
        limit: 5000,
      },
      filter,
    );

    const bench = new Set(memberIds);
    return page.items.filter((member) => bench.has(member.id));
  }

  /** One member's position on one date. */
  async totalOnDate(
    memberId: MemberId,
    onDate: IsoDate,
    identity: VerifiedIdentity,
  ): Promise<AllocationOnDate> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ALLOCATION_VIEW', { orgUnitId: null, memberId });

    const assignments = await this.assignments.findOverlapping([memberId], {
      start: onDate,
      end: onDate,
    });
    return this.allocation.totalOnDate(memberId, onDate, assignments);
  }

  /** One member's allocation profile over a range, with gaps marked. */
  async memberTimeline(
    memberId: MemberId,
    range: DateRange,
    identity: VerifiedIdentity,
  ): Promise<TimelineSegment[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ALLOCATION_VIEW', { orgUnitId: null, memberId });

    // Scoped read first: if the member is out of scope this returns nothing, so the timeline
    // is empty rather than leaking another member's shape.
    const member = await this.members.findById(memberId, this.accessControl.filterFor(scope));
    if (!member) return [];

    const assignments = await this.assignments.findOverlapping([memberId], range);
    return this.allocation.memberTimeline(memberId, range, assignments);
  }

  /** Segments for one member — the raw profile behind the views. */
  async profile(
    memberId: MemberId,
    range: DateRange,
    identity: VerifiedIdentity,
  ): Promise<AllocationSegment[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ALLOCATION_VIEW', { orgUnitId: null, memberId });

    const member = await this.members.findById(memberId, this.accessControl.filterFor(scope));
    if (!member) return [];

    const assignments = await this.assignments.findOverlapping([memberId], range);
    return this.allocation.profileOverRange(assignments, range);
  }

  /** Presentation helper, kept here so no route converts tenths by hand. */
  static toPercentage(tenths: Tenths): number {
    return tenthsToPercentage(tenths);
  }
}
