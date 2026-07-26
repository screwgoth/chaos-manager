/**
 * AllocationSegmentStrip — allocation over TIME, positioned proportionally.
 *
 * `AllocationBar` answers "how booked is this person right now?". This answers "when are they
 * booked?", which is the question the segmentation algorithm exists to make answerable: a
 * member at 60% across a quarter might be at 100% for two weeks of it, and a single average
 * hides exactly the thing a manager needs to see.
 *
 * Each segment's WIDTH is its share of the range in days, so the strip reads as a calendar
 * rather than as a list of equal blocks.
 */

import type { AllocationSegment, DateRange } from '../api/types';
import { formatPercentage } from './AllocationBar';

/** Inclusive day count (AS-03): 1 Jan to 1 Jan is one day, not zero. */
function inclusiveDays(range: DateRange): number {
  const start = Date.parse(`${range.start}T00:00:00.000Z`);
  const end = Date.parse(`${range.end}T00:00:00.000Z`);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function toneOf(segment: { totalPercentage: number; isOverAllocated: boolean }): string {
  if (segment.isOverAllocated) return 'bg-allocation-over';
  if (segment.totalPercentage >= 100) return 'bg-allocation-full';
  if (segment.totalPercentage > 0) return 'bg-allocation-partial';
  // A gap is deliberately a light hatch rather than a colour: "nothing booked" is an absence,
  // and colouring it green would read as a positive state competing for attention.
  return 'bg-slate-100';
}

export interface AllocationSegmentStripProps {
  segments: AllocationSegment[];
  range: DateRange;
  testId?: string;
}

export function AllocationSegmentStrip({
  segments,
  range,
  testId,
}: AllocationSegmentStripProps): JSX.Element {
  const totalDays = inclusiveDays(range);

  if (segments.length === 0) {
    return (
      <div className="h-6 rounded bg-slate-100" data-testid={testId}>
        <span className="sr-only">No allocation data for this period.</span>
      </div>
    );
  }

  return (
    <div data-testid={testId}>
      <div className="flex h-6 w-full overflow-hidden rounded border border-slate-200">
        {segments.map((segment) => {
          const share = (inclusiveDays(segment.period) / totalDays) * 100;
          return (
            <div
              key={`${segment.period.start}-${segment.period.end}`}
              className={`${toneOf(segment)} relative h-full border-r border-white/60 last:border-r-0`}
              style={{
                width: `${share}%`,
                // Over-allocated segments get the same hatching as the overflow tail, so the
                // two components speak one visual language.
                backgroundImage: segment.isOverAllocated
                  ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 2px, transparent 2px 5px)'
                  : undefined,
              }}
              title={`${segment.period.start} to ${segment.period.end}: ${formatPercentage(segment.totalPercentage)}`}
            />
          );
        })}
      </div>

      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-500">
        <span>{range.start}</span>
        <span>{range.end}</span>
      </div>

      {/* The whole strip in words. A visual timeline is unusable without this. */}
      <ul className="sr-only">
        {segments.map((segment) => (
          <li key={`${segment.period.start}-sr`}>
            {segment.period.start} to {segment.period.end}:{' '}
            {formatPercentage(segment.totalPercentage)} booked
            {segment.isOverAllocated ? ', over-allocated' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
