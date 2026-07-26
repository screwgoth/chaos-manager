/**
 * AllocationBar — the most-seen component in the product.
 *
 * It appears in the member list, the allocation view, availability results, project staffing,
 * and the over-allocation dialog. Its success criterion is SPEED OF COMPREHENSION: a manager
 * answering "who's available next month?" in under a minute (U1-NFR-U-05).
 *
 * THE ONE RULE THAT MATTERS. An over-allocated member must NOT look like a fully-booked one.
 * A bar that simply fills to its end says "complete" — the most reassuring thing a UI can
 * say — about the single state that most needs attention. So over-allocation is encoded three
 * ways at once, because any one of them can fail a given reader:
 *
 *   1. COLOUR — a distinct red, not the amber of "full".
 *   2. SHAPE — the overflow breaks out past the track with a hatched tail, so the bar is
 *      visibly the wrong size for its container. This survives greyscale and colour blindness,
 *      which colour alone does not.
 *   3. NUMBER — the figure reads "120%" and the remainder reads "-20%", never clamped to 0.
 *
 * Point 3 is why `availablePercentage` is never `Math.max(0, …)` anywhere in this codebase.
 */

const TRACK_HEIGHT = 'h-2.5';

export interface AllocationBarProps {
  totalPercentage: number;
  /** Shown as the numeric remainder. Negative when over-allocated — pass it through. */
  availablePercentage?: number;
  /** Suppresses the numeric labels where the surrounding row already shows them. */
  showLabels?: boolean;
  /** Identifies the bar in tests by ENTITY id, never a row index. */
  testId?: string;
}

function stateOf(total: number): 'free' | 'partial' | 'full' | 'over' {
  if (total > 100) return 'over';
  if (total >= 100) return 'full';
  if (total > 0) return 'partial';
  return 'free';
}

const FILL_CLASS: Record<ReturnType<typeof stateOf>, string> = {
  free: 'bg-slate-200',
  partial: 'bg-allocation-partial',
  full: 'bg-allocation-full',
  over: 'bg-allocation-over',
};

const LABEL_CLASS: Record<ReturnType<typeof stateOf>, string> = {
  free: 'text-slate-500',
  partial: 'text-slate-700',
  full: 'text-allocation-full',
  over: 'text-allocation-over font-semibold',
};

export function AllocationBar({
  totalPercentage,
  availablePercentage,
  showLabels = true,
  testId,
}: AllocationBarProps): JSX.Element {
  const state = stateOf(totalPercentage);
  const isOver = state === 'over';

  // Within the track, capped at 100%. The excess is rendered OUTSIDE the track deliberately.
  const insideWidth = Math.min(100, Math.max(0, totalPercentage));

  /**
   * Overflow width, as a fraction of the track.
   *
   * Capped at 40% of the track so a wildly over-allocated member (say 300%) does not push the
   * layout apart — but the cap means the tail's LENGTH is not proportional beyond 140%. That
   * is acceptable because the tail's job is to say "over", and the exact figure is in the
   * label right beside it.
   */
  const overflowWidth = isOver ? Math.min(40, totalPercentage - 100) : 0;

  const remainder = availablePercentage ?? 100 - totalPercentage;

  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <div className="relative flex-1 min-w-[6rem]">
        <div className={`${TRACK_HEIGHT} w-full rounded-full bg-slate-100 overflow-hidden`}>
          <div
            className={`${TRACK_HEIGHT} ${FILL_CLASS[state]} transition-[width] duration-200 motion-reduce:transition-none`}
            style={{ width: `${insideWidth}%` }}
          />
        </div>

        {isOver ? (
          /**
           * The overflow tail. Positioned to start at the track's end and run past it, so the
           * bar is visibly too long for its container — the shape cue that survives greyscale.
           * The stripes distinguish it from a solid fill at a glance.
           */
          <div
            className={`absolute top-0 left-full ${TRACK_HEIGHT} rounded-r-full bg-allocation-over`}
            style={{
              width: `${overflowWidth}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 2px, transparent 2px 5px)',
            }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {showLabels ? (
        <div className="flex items-baseline gap-2 whitespace-nowrap tabular-nums text-sm">
          <span className={LABEL_CLASS[state]}>{formatPercentage(totalPercentage)}</span>
          <span
            className={
              remainder < 0 ? 'text-allocation-over text-xs font-medium' : 'text-slate-500 text-xs'
            }
          >
            {/* Never clamped: "-20% left" and "0% left" mean very different things. */}
            {formatPercentage(remainder)} left
          </span>
        </div>
      ) : null}

      {/* The state in words, for screen readers and for anyone who cannot see the colour. */}
      <span className="sr-only">
        {isOver
          ? `Over-allocated: ${formatPercentage(totalPercentage)} booked, exceeding capacity by ${formatPercentage(totalPercentage - 100)}.`
          : `${formatPercentage(totalPercentage)} booked, ${formatPercentage(remainder)} available.`}
      </span>
    </div>
  );
}

/** One decimal only when there is one, so "50%" does not render as "50.0%". */
export function formatPercentage(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}
