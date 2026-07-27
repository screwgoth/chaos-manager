/**
 * Tests for date-only handling (AS-03, the date-only UTC convention).
 *
 * The inclusive-boundary cases below are the classic off-by-one source in date-range
 * arithmetic. Every allocation figure depends on getting them right, and there is no
 * CI gate in Phase 1 (NFR-Q-01).
 */

import {
  addDays,
  inclusiveDayCount,
  isIsoDate,
  isValidRange,
  nextDay,
  parseIsoDate,
  rangeContains,
  rangeCovers,
  rangesOverlap,
  toIsoDate,
} from '../../src/shared/util/dates';

describe('isIsoDate', () => {
  it('accepts well-formed calendar dates', () => {
    expect(isIsoDate('2026-03-15')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true); // leap year
  });

  it('rejects impossible dates rather than rolling them over', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2025-02-29')).toBe(false); // not a leap year
  });

  it('rejects non-date strings and wrong formats', () => {
    expect(isIsoDate('15/03/2026')).toBe(false);
    expect(isIsoDate('2026-3-15')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe('UTC parsing (no timezone drift)', () => {
  it('parses to UTC midnight, not local midnight', () => {
    const d = parseIsoDate('2026-03-15');
    expect(d.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(d.getUTCDate()).toBe(15);
  });

  it('round-trips without shifting the calendar date', () => {
    for (const value of ['2026-01-01', '2026-06-30', '2026-12-31', '2024-02-29']) {
      expect(toIsoDate(parseIsoDate(value))).toBe(value);
    }
  });

  it('crosses month and year boundaries correctly', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('inclusive range overlap (AS-03) — the off-by-one cases', () => {
  it('treats adjacent ranges as NOT overlapping', () => {
    // 1 Jan-31 Mar and 1 Apr-30 Jun share no day.
    expect(
      rangesOverlap(
        { start: '2026-01-01', end: '2026-03-31' },
        { start: '2026-04-01', end: '2026-06-30' },
      ),
    ).toBe(false);
  });

  it('treats ranges sharing exactly one day as overlapping', () => {
    // 1 Jan-31 Mar and 31 Mar-30 Jun share 31 Mar.
    expect(
      rangesOverlap(
        { start: '2026-01-01', end: '2026-03-31' },
        { start: '2026-03-31', end: '2026-06-30' },
      ),
    ).toBe(true);
  });

  it('is symmetric', () => {
    const a = { start: '2026-02-01', end: '2026-04-30' };
    const b = { start: '2026-03-15', end: '2026-05-15' };
    expect(rangesOverlap(a, b)).toBe(rangesOverlap(b, a));
  });

  it('handles a single-day range', () => {
    const oneDay = { start: '2026-03-15', end: '2026-03-15' };
    expect(isValidRange(oneDay)).toBe(true);
    expect(inclusiveDayCount(oneDay)).toBe(1);
    expect(rangesOverlap(oneDay, { start: '2026-03-15', end: '2026-03-20' })).toBe(true);
    expect(rangesOverlap(oneDay, { start: '2026-03-16', end: '2026-03-20' })).toBe(false);
  });
});

describe('containment and coverage', () => {
  const range = { start: '2026-03-01', end: '2026-03-31' };

  it('includes both bounds', () => {
    expect(rangeContains(range, '2026-03-01')).toBe(true);
    expect(rangeContains(range, '2026-03-31')).toBe(true);
    expect(rangeContains(range, '2026-02-28')).toBe(false);
    expect(rangeContains(range, '2026-04-01')).toBe(false);
  });

  it('rangeCovers decides which assignments cover a segment', () => {
    expect(rangeCovers(range, { start: '2026-03-10', end: '2026-03-20' })).toBe(true);
    expect(rangeCovers(range, range)).toBe(true);
    expect(rangeCovers(range, { start: '2026-02-25', end: '2026-03-20' })).toBe(false);
  });
});

describe('nextDay and day counts', () => {
  it('nextDay is used for segment boundaries (end + 1 day)', () => {
    expect(nextDay('2026-03-31')).toBe('2026-04-01');
  });

  it('counts inclusive days', () => {
    expect(inclusiveDayCount({ start: '2026-03-01', end: '2026-03-31' })).toBe(31);
    expect(inclusiveDayCount({ start: '2026-01-01', end: '2026-12-31' })).toBe(365);
    expect(inclusiveDayCount({ start: '2024-01-01', end: '2024-12-31' })).toBe(366);
  });
});

describe('isValidRange', () => {
  it('rejects an end date before the start date (BR-A-04)', () => {
    expect(isValidRange({ start: '2026-03-31', end: '2026-03-01' })).toBe(false);
  });

  it('rejects malformed dates', () => {
    expect(isValidRange({ start: 'not-a-date', end: '2026-03-01' })).toBe(false);
  });
});
