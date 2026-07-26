/**
 * C-04 AllocationComponent — the segmentation algorithm.
 *
 * PURE. No I/O, no state, no clock (U1-NFR-M-03). Repositories fetch; this computes.
 * That is what makes the highest-risk logic in the system testable without a database,
 * and it is a constraint worth defending: the moment this file needs a query, the
 * separation that makes it verifiable is gone.
 *
 * THE PROBLEM. A member's total allocation is not one number — it changes on every day an
 * assignment starts or ends. Asking "is this member over-allocated in Q1?" has no single
 * answer; the answer is a set of sub-periods, each with its own total. BR-A-08 requires
 * detection to return EACH offending sub-period, not a flag, because "over-allocated in
 * Q1" is unactionable while "120% from 15 to 31 March" can be fixed.
 *
 * THE ALGORITHM.
 *   1. Collect boundaries: every assignment start, and every assignment end + 1 day.
 *      The +1 is because ranges are INCLUSIVE (AS-03): an assignment ending 31 March
 *      still consumes capacity ON 31 March, so the total changes on 1 April.
 *   2. Sort and de-duplicate them, clipped to the requested window.
 *   3. Between consecutive boundaries the set of active assignments cannot change, so
 *      each interval has ONE total — computed by exact integer-tenths summation (BR-A-03).
 *   4. Merge adjacent segments with identical totals and contributions, so the output is
 *      the minimal correct description rather than one segment per boundary.
 *
 * Every sum is integer arithmetic. See shared/util/tenths.ts for why floats are
 * prohibited here: their order-dependence would make an exact comparison against the
 * 100.0% threshold depend on the order rows came back from the database.
 */

import type {
  AllocationContribution,
  AllocationSegment,
  DateRange,
  IsoDate,
  MemberId,
  MemberSummary,
  OverAllocationFinding,
  Tenths,
} from '../../shared/types/domain';
import { addDays, isValidRange, rangeCovers } from '../../shared/util/dates';
import {
  CAPACITY_TENTHS,
  availableTenths,
  isOverAllocated,
  sumTenths,
} from '../../shared/util/tenths';

/**
 * The shape this component consumes. Deliberately structural rather than the Assignment
 * entity: it accepts anything carrying these fields, so callers can pass the enriched
 * rows from `findOverlapping` or a hypothetical assignment being validated before it
 * exists.
 */
export interface AllocatableAssignment {
  id: string;
  memberId: MemberId;
  projectId: string;
  allocationTenths: Tenths;
  startDate: IsoDate;
  endDate: IsoDate;
  savedAsOverride: boolean;
  projectName?: string;
  projectCode?: string;
}

/** The member's position on a single date (US-VIS-01 row detail). */
export interface AllocationOnDate {
  memberId: MemberId;
  onDate: IsoDate;
  totalTenths: Tenths;
  /** Negative when over-allocated (BR-V-03). */
  availableTenths: Tenths;
  contributions: AllocationContribution[];
}

/** One row of the current-allocation view (US-VIS-01). */
export interface MemberAllocationRow {
  member: MemberSummary;
  totalTenths: Tenths;
  availableTenths: Tenths;
  isOverAllocated: boolean;
  contributions: AllocationContribution[];
}

/** Availability across a range, where the answer varies within it (US-VIS-02, US-VIS-03). */
export interface AvailabilityResult {
  member: MemberSummary;
  range: DateRange;
  segments: AllocationSegment[];
  minAvailableTenths: Tenths;
  maxAvailableTenths: Tenths;
  isFullyAllocated: boolean;
  isOverAllocated: boolean;
}

/**
 * A timeline segment. `isGap` marks a stretch with NO assignments, which the UI renders
 * differently from a partially-allocated stretch — "nothing booked" and "40% booked" are
 * different facts and must not look the same.
 */
export interface TimelineSegment {
  period: DateRange;
  totalTenths: Tenths;
  availableTenths: Tenths;
  isOverAllocated: boolean;
  isGap: boolean;
  assignments: AllocationContribution[];
}

export class AllocationComponent {
  /**
   * Splits `window` into the minimal set of sub-periods over which the member's total
   * allocation is constant.
   *
   * Segments cover the window contiguously and never overlap. A period with no
   * assignments yields a segment with total 0 rather than a gap — the caller needs to
   * render "available" for that stretch, and a missing segment would be indistinguishable
   * from one it forgot to handle.
   */
  segmentAllocation(
    assignments: readonly AllocatableAssignment[],
    window: DateRange,
  ): AllocationSegment[] {
    if (!isValidRange(window)) return [];

    const relevant = assignments.filter((assignment) =>
      // Inclusive overlap with the window (AS-03).
      assignment.startDate <= window.end && assignment.endDate >= window.start,
    );

    const boundaries = this.collectBoundaries(relevant, window);
    const rawSegments: AllocationSegment[] = [];

    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index];
      const nextBoundary = boundaries[index + 1];
      if (start === undefined || nextBoundary === undefined) continue;

      // Segments are inclusive, and the next boundary is the first day of the NEXT
      // segment, so this one ends the day before it.
      const end = addDays(nextBoundary, -1);
      if (end < start) continue;

      const period: DateRange = { start, end };

      // An assignment contributes to the whole segment or none of it: segment boundaries
      // are precisely the days on which membership changes, so testing coverage of the
      // segment (not merely overlap) is correct and is what makes the total constant.
      const contributions: AllocationContribution[] = relevant
        .filter((assignment) =>
          rangeCovers({ start: assignment.startDate, end: assignment.endDate }, period),
        )
        .map((assignment) => ({
          assignmentId: assignment.id,
          projectId: assignment.projectId,
          projectName: assignment.projectName ?? '',
          projectCode: assignment.projectCode ?? '',
          allocationTenths: assignment.allocationTenths,
          savedAsOverride: assignment.savedAsOverride,
        }));

      const totalTenths = sumTenths(contributions.map((c) => c.allocationTenths));

      rawSegments.push({
        period,
        totalTenths,
        availableTenths: availableTenths(totalTenths),
        isOverAllocated: isOverAllocated(totalTenths),
        contributions,
      });
    }

    return this.mergeAdjacent(rawSegments);
  }

  /**
   * BR-A-08: returns EACH offending sub-period, not a flag.
   *
   * `arisesFromOverride` distinguishes an over-allocation that already carries an
   * accepted override from a newly-introduced one (BR-A-12 keeps the former visibly
   * flagged). A finding where every contribution is already an override is pre-existing;
   * one containing a non-override contribution is new.
   */
  detectOverAllocation(
    memberId: MemberId,
    assignments: readonly AllocatableAssignment[],
    window: DateRange,
  ): OverAllocationFinding[] {
    return this.segmentAllocation(assignments, window)
      .filter((segment) => segment.isOverAllocated)
      .map((segment) => ({
        memberId,
        period: segment.period,
        totalTenths: segment.totalTenths,
        contributions: segment.contributions,
        arisesFromOverride:
          segment.contributions.length > 0 &&
          segment.contributions.every((contribution) => contribution.savedAsOverride),
      }));
  }

  /**
   * Remaining capacity per sub-period. NEGATIVE where over-allocated (BR-V-03) — a caller
   * showing "0% available" for a 120%-booked member would hide the problem.
   */
  availability(
    assignments: readonly AllocatableAssignment[],
    window: DateRange,
  ): AllocationSegment[] {
    return this.segmentAllocation(assignments, window);
  }

  /**
   * The lowest availability anywhere in the window — the number that answers "can I put
   * this person on something else?".
   *
   * Uses the MINIMUM rather than an average: a member free in January and fully booked in
   * February has no spare capacity for a February assignment, and an average would say
   * they were half free.
   */
  minimumAvailableTenths(
    assignments: readonly AllocatableAssignment[],
    window: DateRange,
  ): Tenths {
    const segments = this.segmentAllocation(assignments, window);
    if (segments.length === 0) return CAPACITY_TENTHS;
    return segments.reduce(
      (lowest, segment) => (segment.availableTenths < lowest ? segment.availableTenths : lowest),
      CAPACITY_TENTHS,
    );
  }

  /**
   * The member's total on ONE date (US-VIS-01 detail).
   *
   * Implemented as a single-day window through the same segmentation path rather than as a
   * separate summation, so a date can never be answered by different arithmetic than the
   * range it sits inside. Duplicated logic here would be a place for the two to disagree.
   */
  totalOnDate(
    memberId: MemberId,
    onDate: IsoDate,
    assignments: readonly AllocatableAssignment[],
  ): AllocationOnDate {
    const segments = this.segmentAllocation(assignments, { start: onDate, end: onDate });
    const segment = segments[0];

    return {
      memberId,
      onDate,
      totalTenths: segment?.totalTenths ?? 0,
      availableTenths: segment?.availableTenths ?? CAPACITY_TENTHS,
      contributions: segment?.contributions ?? [],
    };
  }

  /** Named alias for the designed interface. Segmentation IS the profile. */
  profileOverRange(
    assignments: readonly AllocatableAssignment[],
    range: DateRange,
  ): AllocationSegment[] {
    return this.segmentAllocation(assignments, range);
  }

  /**
   * US-VIS-01: one row per member showing the position on `asOf`.
   *
   * Takes ALL members and ALL their assignments as already-fetched inputs, grouped here
   * rather than queried per member — the caller performs one batched `findOverlapping`
   * for every member id. That is what keeps this view inside its performance budget
   * (U1-NFR-PE-02); a query per row is what breaks it.
   *
   * A member with NO assignments still gets a row, at 0% with full availability. Omitting
   * them would silently turn the allocation view into a list of only busy people, hiding
   * exactly the members a manager is looking for.
   */
  currentAllocationView(
    asOf: IsoDate,
    members: readonly MemberSummary[],
    assignments: readonly AllocatableAssignment[],
  ): MemberAllocationRow[] {
    const byMember = this.groupByMember(assignments);

    return members.map((member) => {
      const onDate = this.totalOnDate(member.id, asOf, byMember.get(member.id) ?? []);
      return {
        member,
        totalTenths: onDate.totalTenths,
        availableTenths: onDate.availableTenths,
        isOverAllocated: isOverAllocated(onDate.totalTenths),
        contributions: onDate.contributions,
      };
    });
  }

  /**
   * US-VIS-06: members with NO allocation at any point in the range.
   *
   * "Unallocated" means unallocated for the WHOLE range, not merely at some point in it. A
   * member booked only in February is not on the bench for Q1 — listing them would send a
   * manager to someone who is already busy for a third of the period.
   *
   * The stricter reading is available via `availability`, where a caller can look for
   * members whose MAXIMUM availability is high.
   */
  unallocatedMembers(
    range: DateRange,
    members: readonly MemberSummary[],
    assignments: readonly AllocatableAssignment[],
  ): MemberSummary[] {
    const byMember = this.groupByMember(assignments);

    return members.filter((member) => {
      const segments = this.segmentAllocation(byMember.get(member.id) ?? [], range);
      return segments.every((segment) => segment.totalTenths === 0);
    });
  }

  /**
   * US-VIS-03: every over-allocated sub-period across many members.
   *
   * Returns one finding per offending sub-period per member, NOT one per member: a member
   * over-allocated in two separate weeks has two distinct problems, and collapsing them
   * would hide one of them.
   */
  overAllocatedMembers(
    range: DateRange,
    assignments: readonly AllocatableAssignment[],
  ): OverAllocationFinding[] {
    const byMember = this.groupByMember(assignments);
    const findings: OverAllocationFinding[] = [];

    // Sorted for a stable output order, since Map iteration order follows insertion.
    for (const memberId of [...byMember.keys()].sort()) {
      findings.push(
        ...this.detectOverAllocation(memberId, byMember.get(memberId) ?? [], range),
      );
    }
    return findings;
  }

  /**
   * US-VIS-02, US-VIS-03: availability per member across a range.
   *
   * `min` and `max` are both reported because they answer different questions: the minimum
   * says whether the member can take a full-range assignment, the maximum says whether
   * there is any window worth negotiating. Reporting only an average would answer neither.
   */
  availabilityFor(
    members: readonly MemberSummary[],
    range: DateRange,
    assignments: readonly AllocatableAssignment[],
  ): AvailabilityResult[] {
    const byMember = this.groupByMember(assignments);

    return members.map((member) => {
      const segments = this.segmentAllocation(byMember.get(member.id) ?? [], range);

      const availabilities = segments.map((segment) => segment.availableTenths);
      const minAvailableTenths =
        availabilities.length > 0 ? Math.min(...availabilities) : CAPACITY_TENTHS;
      const maxAvailableTenths =
        availabilities.length > 0 ? Math.max(...availabilities) : CAPACITY_TENTHS;

      return {
        member,
        range,
        segments,
        minAvailableTenths,
        maxAvailableTenths,
        // "Fully allocated" means no spare capacity ANYWHERE in the range.
        isFullyAllocated: maxAvailableTenths <= 0,
        isOverAllocated: segments.some((segment) => segment.isOverAllocated),
      };
    });
  }

  /**
   * US-VIS-01 detail: one member's allocation over time, with gaps marked.
   *
   * `isGap` is the reason this is not simply `segmentAllocation`. A stretch with nothing
   * booked and a stretch with 40% booked are different facts, and a UI that renders them
   * identically would make an idle month look like a busy one.
   */
  memberTimeline(
    memberId: MemberId,
    range: DateRange,
    assignments: readonly AllocatableAssignment[],
  ): TimelineSegment[] {
    const own = assignments.filter((assignment) => assignment.memberId === memberId);

    return this.segmentAllocation(own, range).map((segment) => ({
      period: segment.period,
      totalTenths: segment.totalTenths,
      availableTenths: segment.availableTenths,
      isOverAllocated: segment.isOverAllocated,
      isGap: segment.contributions.length === 0,
      assignments: segment.contributions,
    }));
  }

  // --- internals ----------------------------------------------------------

  /**
   * Groups pre-fetched assignments by member id.
   *
   * This is why the view methods take one flat array: the caller issues ONE batched query
   * for every member and this splits the result, instead of the caller looping members and
   * querying each (R2-1 rule 2).
   */
  private groupByMember(
    assignments: readonly AllocatableAssignment[],
  ): Map<MemberId, AllocatableAssignment[]> {
    const byMember = new Map<MemberId, AllocatableAssignment[]>();
    for (const assignment of assignments) {
      const existing = byMember.get(assignment.memberId);
      if (existing) existing.push(assignment);
      else byMember.set(assignment.memberId, [assignment]);
    }
    return byMember;
  }


  /**
   * The window start, every assignment start inside the window, every assignment
   * end + 1 day inside the window, and the window end + 1 day as the closing bound.
   *
   * The `end + 1` is the crux of inclusive semantics. Using the end date itself would end
   * each segment a day early and silently drop the final day of every assignment from the
   * totals — a one-day under-count that would be very hard to spot in a UI.
   */
  private collectBoundaries(
    assignments: readonly AllocatableAssignment[],
    window: DateRange,
  ): IsoDate[] {
    const boundaries = new Set<IsoDate>([window.start]);
    const exclusiveEnd = addDays(window.end, 1);

    for (const assignment of assignments) {
      if (assignment.startDate > window.start && assignment.startDate <= window.end) {
        boundaries.add(assignment.startDate);
      }
      const dayAfterEnd = addDays(assignment.endDate, 1);
      if (dayAfterEnd > window.start && dayAfterEnd <= window.end) {
        boundaries.add(dayAfterEnd);
      }
    }

    boundaries.add(exclusiveEnd);
    // Lexicographic sort is chronological for ISO dates — no Date objects needed, so no
    // timezone can intrude.
    return [...boundaries].sort();
  }

  /**
   * Merges adjacent segments describing the same state, so consecutive days with the same
   * total and the same contributing assignments become one segment.
   *
   * Without this, a member with two assignments sharing a start date would be reported as
   * several identical adjacent segments — correct, but noise the UI would have to
   * de-duplicate itself.
   */
  private mergeAdjacent(segments: readonly AllocationSegment[]): AllocationSegment[] {
    const merged: AllocationSegment[] = [];

    for (const segment of segments) {
      const previous = merged[merged.length - 1];
      if (
        previous &&
        previous.totalTenths === segment.totalTenths &&
        this.sameContributions(previous.contributions, segment.contributions) &&
        addDays(previous.period.end, 1) === segment.period.start
      ) {
        // Extend rather than append. Replacing the object keeps AllocationSegment
        // readonly-friendly for callers holding an earlier reference.
        merged[merged.length - 1] = {
          ...previous,
          period: { start: previous.period.start, end: segment.period.end },
        };
        continue;
      }
      merged.push(segment);
    }

    return merged;
  }

  /** Same assignments contributing, compared by id — order-independent. */
  private sameContributions(
    a: readonly AllocationContribution[],
    b: readonly AllocationContribution[],
  ): boolean {
    if (a.length !== b.length) return false;
    const idsA = new Set(a.map((c) => c.assignmentId));
    for (const contribution of b) {
      if (!idsA.has(contribution.assignmentId)) return false;
    }
    return true;
  }
}
