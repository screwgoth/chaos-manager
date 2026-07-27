/**
 * Date-only handling for C.H.A.O.S.
 *
 * THE CONVENTION (tech-stack-decisions.md, date-fns rationale):
 *   Assignment start and end dates are CALENDAR DATES, not instants.
 *   - stored as SQL `date`
 *   - transported as 'YYYY-MM-DD' strings
 *   - parsed to UTC midnight, never to local midnight
 *   - never constructed with `new Date(y, m, d)`, which uses local time
 *
 * The convention is what prevents timezone drift; date-fns is merely a small,
 * immutable library that does not fight it. AS-03: both bounds are INCLUSIVE.
 *
 * Off-by-one errors here would corrupt every allocation figure in the system, and
 * there is no automated test gate in Phase 1 (NFR-Q-01), so this module keeps the
 * surface deliberately tiny.
 */

/** A calendar date in 'YYYY-MM-DD' form. */
export type IsoDate = string;

export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Reject impossible dates that Date would roll over, e.g. 2026-02-30 -> 2026-03-02
  return toIsoDate(parsed) === value;
}

export function parseIsoDate(value: IsoDate): Date {
  if (!isIsoDate(value)) {
    throw new RangeError(`Not a valid calendar date: ${String(value)}`);
  }
  return new Date(`${value}T00:00:00Z`);
}

export function toIsoDate(date: Date): IsoDate {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** The day after `value`. Used to compute segment boundaries (end + 1 day). */
export function nextDay(value: IsoDate): IsoDate {
  return addDays(value, 1);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/**
 * Inclusive-range overlap (AS-03).
 *
 * 1 Jan-31 Mar and 1 Apr-30 Jun    -> false (adjacent, NOT overlapping)
 * 1 Jan-31 Mar and 31 Mar-30 Jun   -> true  (share exactly 31 Mar)
 */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** Inclusive containment: is `date` within [range.start, range.end]? */
export function rangeContains(range: DateRange, date: IsoDate): boolean {
  return range.start <= date && date <= range.end;
}

/** Is `inner` entirely inside `outer`? Used to decide which assignments cover a segment. */
export function rangeCovers(outer: DateRange, inner: DateRange): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

export function isValidRange(range: DateRange): boolean {
  return isIsoDate(range.start) && isIsoDate(range.end) && range.start <= range.end;
}

/** Inclusive day count: a single-day range is 1, not 0. */
export function inclusiveDayCount(range: DateRange): number {
  const ms = parseIsoDate(range.end).getTime() - parseIsoDate(range.start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Today as a calendar date in UTC. */
export function today(): IsoDate {
  return toIsoDate(new Date());
}
