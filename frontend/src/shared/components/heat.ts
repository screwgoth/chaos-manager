/**
 * The five-step capacity heat scale.
 *
 * One place decides what a percentage LOOKS like, so the availability grid, a member's strip and
 * any future dashboard cannot drift apart — two screens disagreeing about whether 86% is "busy" or
 * "full" is worse than either answer.
 *
 * ⚠️ The class strings are written out LITERALLY below. Tailwind builds its stylesheet by scanning
 * source text, so a computed name like `bg-heat-${step}` produces no CSS at all and the cell ships
 * transparent. Every class here must remain a literal.
 */

export type HeatStep = 0 | 1 | 2 | 3 | 4;

/** Background + matching foreground for each step, pre-paired so nothing ships teal-on-teal. */
const HEAT_CLASS: Record<HeatStep, string> = {
  0: 'bg-heat-0 text-heat-0-fg',
  1: 'bg-heat-1 text-heat-1-fg',
  2: 'bg-heat-2 text-heat-2-fg',
  3: 'bg-heat-3 text-heat-3-fg',
  4: 'bg-heat-4 text-heat-4-fg',
};

const HEAT_LABEL: Record<HeatStep, string> = {
  0: 'free',
  1: 'lightly booked',
  2: 'busy',
  3: 'full',
  4: 'over capacity',
};

/**
 * Bucket a booked percentage into a heat step.
 *
 * The boundaries are relative to `threshold` (normally 100) rather than hard-coded, so the scale
 * still reads correctly if a deployment ever treats a different figure as full capacity.
 *
 * Anything ABOVE the threshold is step 4 — the one boundary that must never be fuzzy, because
 * step 3 and step 4 are the distinction the product exists to make (U1-NFR-U-05).
 */
export function heatStep(percentage: number, threshold = 100): HeatStep {
  if (percentage <= 0) return 0;
  if (percentage > threshold) return 4;
  if (percentage <= threshold * 0.5) return 1;
  if (percentage <= threshold * 0.85) return 2;
  return 3;
}

export function heatClass(percentage: number, threshold = 100): string {
  return HEAT_CLASS[heatStep(percentage, threshold)];
}

/** Words for the step — used in `title` and screen-reader text, never colour alone. */
export function heatLabel(percentage: number, threshold = 100): string {
  return HEAT_LABEL[heatStep(percentage, threshold)];
}

/** The legend, in scale order. Rendered once per grid so the colours are decodable. */
export const HEAT_LEGEND: { className: string; label: string }[] = [
  { className: 'bg-heat-0', label: '0%' },
  { className: 'bg-heat-1', label: '1–50' },
  { className: 'bg-heat-2', label: '51–85' },
  { className: 'bg-heat-3', label: '86–100' },
  { className: 'bg-heat-4', label: '>100' },
];
