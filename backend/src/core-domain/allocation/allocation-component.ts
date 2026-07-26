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

  // --- internals ----------------------------------------------------------

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
