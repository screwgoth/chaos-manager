/**
 * Integer-tenths percentage arithmetic.
 *
 * BR-A-03: allocation percentages are fixed-point, NEVER floating point.
 * A percentage is stored and computed as an integer number of tenths:
 *   50.0%  -> 500
 *   33.3%  -> 333
 *   100.0% -> 1000
 *
 * Why: Q3:C permits one decimal place, and float summation of one-decimal values is
 * ORDER-DEPENDENT. The same three assignments summed in different orders give:
 *     33.3 + 33.3 + 33.4 === 100                  (exact, by luck)
 *     33.4 + 33.3 + 33.3 === 99.99999999999999    (drifts below capacity)
 * An exact comparison against the 100.0% threshold would therefore depend on the
 * order rows came back from the database. Integer tenths make every sum exact.
 *
 * There is no automated test gate in Phase 1 (NFR-Q-01), so this module is small,
 * total, and hand-verifiable on purpose.
 */

/** A percentage expressed as an integer number of tenths. */
export type Tenths = number;

/** Every member's capacity in Phase 1. AS-01: part-time members are not modelled.
 *  Expressed exactly once so a later phase can promote it to a Member attribute. */
export const CAPACITY_TENTHS: Tenths = 1000;

export const MIN_ASSIGNMENT_TENTHS: Tenths = 1; // 0.1%
export const MAX_ASSIGNMENT_TENTHS: Tenths = 1000; // 100.0%

/**
 * Parse a user-supplied percentage (e.g. 37.5) into tenths (375).
 * Rejects anything that is not a number with at most one decimal place.
 */
export function percentageToTenths(percentage: number): Tenths {
  if (!Number.isFinite(percentage)) {
    throw new RangeError('Allocation percentage must be a finite number.');
  }
  const scaled = percentage * 10;
  // Guard against values like 37.55 that carry more than one decimal place.
  // Math.round on the scaled value would silently accept them.
  if (Math.abs(scaled - Math.round(scaled)) > 1e-9) {
    throw new RangeError('Allocation percentage supports at most one decimal place.');
  }
  return Math.round(scaled);
}

/** Format tenths for display or transport: 375 -> "37.5". */
export function tenthsToString(tenths: Tenths): string {
  const sign = tenths < 0 ? '-' : '';
  const abs = Math.abs(tenths);
  return `${sign}${Math.floor(abs / 10)}.${abs % 10}`;
}

/** Convert tenths back to a number for JSON responses: 375 -> 37.5 */
export function tenthsToPercentage(tenths: Tenths): number {
  return tenths / 10;
}

/** Exact sum. Inputs are integers, so this cannot drift. */
export function sumTenths(values: readonly Tenths[]): Tenths {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Remaining capacity. NEGATIVE when over-allocated — callers rely on this (BR-V-03). */
export function availableTenths(totalTenths: Tenths): Tenths {
  return CAPACITY_TENTHS - totalTenths;
}

/** BR-A-08: over-allocation is strictly greater than capacity. Exactly 100.0% is not over. */
export function isOverAllocated(totalTenths: Tenths): boolean {
  return totalTenths > CAPACITY_TENTHS;
}

/** BR-A-02: a single assignment must be within 0.1%..100.0%. Zero and negatives rejected. */
export function isValidAssignmentTenths(tenths: Tenths): boolean {
  return (
    Number.isInteger(tenths) && tenths >= MIN_ASSIGNMENT_TENTHS && tenths <= MAX_ASSIGNMENT_TENTHS
  );
}
