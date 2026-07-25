/**
 * Tests for integer-tenths percentage arithmetic (BR-A-03).
 *
 * These exist because there is no CI gate in Phase 1 (NFR-Q-01) and this module
 * underpins every allocation figure in the system.
 */

import {
  CAPACITY_TENTHS,
  availableTenths,
  isOverAllocated,
  isValidAssignmentTenths,
  percentageToTenths,
  sumTenths,
  tenthsToPercentage,
  tenthsToString,
} from '../../src/shared/util/tenths';

describe('percentageToTenths', () => {
  it('converts whole and one-decimal percentages', () => {
    expect(percentageToTenths(100)).toBe(1000);
    expect(percentageToTenths(50)).toBe(500);
    expect(percentageToTenths(37.5)).toBe(375);
    expect(percentageToTenths(0.1)).toBe(1);
  });

  it('rejects more than one decimal place rather than silently rounding', () => {
    expect(() => percentageToTenths(37.55)).toThrow(RangeError);
    expect(() => percentageToTenths(0.01)).toThrow(RangeError);
  });

  it('rejects non-finite values', () => {
    expect(() => percentageToTenths(Number.NaN)).toThrow(RangeError);
    expect(() => percentageToTenths(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('exact summation (the reason integer tenths exist)', () => {
  it('sums to exactly capacity regardless of order', () => {
    const ascending = [33.3, 33.3, 33.4].map(percentageToTenths);
    const descending = [33.4, 33.3, 33.3].map(percentageToTenths);

    expect(sumTenths(ascending)).toBe(1000);
    expect(sumTenths(descending)).toBe(1000);
    expect(sumTenths(ascending)).toBe(CAPACITY_TENTHS);
    expect(isOverAllocated(sumTenths(descending))).toBe(false);
  });

  it('is order-independent where float summation is not', () => {
    // This is the actual hazard integer tenths avoid: the SAME three values summed in
    // a different order give different float results, so an exact comparison against
    // the 100.0% threshold would depend on the order rows came back from the database.
    expect(33.3 + 33.3 + 33.4).toBe(100); // exact, by luck
    expect(33.4 + 33.3 + 33.3).not.toBe(100); // 99.99999999999999

    // Integer tenths have no such asymmetry.
    const a = sumTenths([333, 333, 334]);
    const b = sumTenths([334, 333, 333]);
    expect(a).toBe(b);
  });

  it('detects over-allocation exactly at the boundary', () => {
    expect(isOverAllocated(1000)).toBe(false); // exactly 100.0% is NOT over (BR-A-08)
    expect(isOverAllocated(1001)).toBe(true); // 100.1% is
  });

  it('reports negative available capacity when over-allocated (BR-V-03)', () => {
    expect(availableTenths(800)).toBe(200);
    expect(availableTenths(1000)).toBe(0);
    expect(availableTenths(1200)).toBe(-200);
  });
});

describe('assignment percentage bounds (BR-A-02)', () => {
  it('accepts 0.1% through 100.0%', () => {
    expect(isValidAssignmentTenths(1)).toBe(true);
    expect(isValidAssignmentTenths(1000)).toBe(true);
  });

  it('rejects zero, negatives, above 100%, and non-integers', () => {
    expect(isValidAssignmentTenths(0)).toBe(false);
    expect(isValidAssignmentTenths(-500)).toBe(false);
    expect(isValidAssignmentTenths(1001)).toBe(false);
    expect(isValidAssignmentTenths(12.5)).toBe(false);
  });
});

describe('formatting', () => {
  it('renders tenths for display', () => {
    expect(tenthsToString(1000)).toBe('100.0');
    expect(tenthsToString(375)).toBe('37.5');
    expect(tenthsToString(1)).toBe('0.1');
    expect(tenthsToString(-200)).toBe('-20.0');
  });

  it('round-trips through percentage numbers', () => {
    for (const tenths of [1, 250, 375, 1000]) {
      expect(percentageToTenths(tenthsToPercentage(tenths))).toBe(tenths);
    }
  });
});
