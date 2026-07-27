/**
 * Surfaces and chrome — the repeating shapes of the C.H.A.O.S design language.
 *
 * These exist so pages stop hand-rolling `rounded-card border border-line bg-white p-4` in ninety
 * places with eleven slightly different paddings. A page composes Card / PageHeader / StatCard and
 * inherits the design automatically.
 */

import type { ReactNode } from 'react';

/**
 * Card — the standard white surface: 6px radius, soft lifted shadow, no border.
 *
 * The mockups use a SHADOW rather than a border to separate a card from the canvas. That is not
 * interchangeable: on `#F4F3F7` a 1px grey border reads as a harder, denser table-like frame,
 * which is why the previous bordered look felt like a spreadsheet.
 */
export function Card({
  children,
  className = '',
  padded = true,
  testId,
}: {
  children: ReactNode;
  className?: string;
  /** Off for cards whose own content manages edge-to-edge padding, e.g. a full-bleed table. */
  padded?: boolean;
  testId?: string;
}): JSX.Element {
  return (
    <div
      data-testid={testId}
      className={`rounded-card bg-white shadow-card ${padded ? 'px-5 py-4' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

/** A card's own heading row: title, optional sub-label, optional right-aligned action. */
export function CardHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {hint ? <p className="text-[12.5px] text-faded">{hint}</p> : null}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}

/**
 * StatCard — a single headline figure.
 *
 * `tone` colours the VALUE only, never the card background. A wall of tinted cards makes
 * everything look urgent, which makes nothing look urgent.
 */
export function StatCard({
  label,
  value,
  unit,
  note,
  tone = 'neutral',
  meter,
  testId,
}: {
  label: string;
  value: string;
  /** Trailing unit, set smaller and lighter so the figure stays the thing you read first. */
  unit?: string;
  note?: string;
  tone?: 'neutral' | 'danger' | 'good' | 'flag';
  /** 0–1. Renders a thin progress track under the figure. */
  meter?: number;
  testId?: string;
}): JSX.Element {
  const valueTone = {
    neutral: 'text-ink',
    danger: 'text-danger-500',
    good: 'text-good-700',
    flag: 'text-flag-800',
  }[tone];

  return (
    <Card testId={testId}>
      <p className="label-micro">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`text-[28px] font-semibold leading-none ${valueTone}`}>{value}</span>
        {unit ? <span className="text-[13px] text-faded">{unit}</span> : null}
      </p>
      {meter !== undefined ? (
        <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-line-soft">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }}
          />
        </div>
      ) : null}
      {note ? <p className="mt-2 text-[12.5px] text-faded">{note}</p> : null}
    </Card>
  );
}

/** PageHeader — the title block every screen opens with. */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  /** Tabs or filters that belong to the header rather than the body. */
  children?: ReactNode;
}): JSX.Element {
  return (
    <header className="mb-5">
      {breadcrumb ? <div className="mb-1.5 text-[12.5px] text-faded">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold leading-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}

export type BadgeTone = 'neutral' | 'brand' | 'good' | 'danger' | 'flag';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-line-soft text-faded',
  brand: 'bg-brand-50 text-brand-600',
  good: 'bg-good-500/12 text-good-700',
  danger: 'bg-danger-500/12 text-danger-700',
  flag: 'bg-flag-400/25 text-flag-800',
};

/** Badge — a status pill. Text always says the state; the tone only reinforces it. */
export function Badge({
  children,
  tone = 'neutral',
  testId,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  testId?: string;
}): JSX.Element {
  return (
    <span
      data-testid={testId}
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Avatar — initials on a colour derived from the person's identity.
 *
 * The colour is a HASH of the id, not a random pick or a list index, so the same person keeps the
 * same colour across every screen and across reloads. An index-based colour would reshuffle the
 * whole roster the moment one person is filtered out.
 *
 * Decorative: `aria-hidden`, because the name is always rendered as text beside it. Announcing
 * "AM" before "Aarav Mehta" is noise for a screen-reader user.
 */
export function Avatar({
  name,
  id,
  size = 34,
}: {
  name: string;
  /** Stable identity for the colour hash. Falls back to the name when there is no id. */
  id?: string;
  size?: number;
}): JSX.Element {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const seed = id ?? name;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 997;
  }
  const palette = ['#00B3B5', '#6C5CE7', '#FF8A48', '#12B76A', '#3D8BFD', '#E0729C', '#FECD3D'];
  const background = palette[hash % palette.length] as string;

  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-none items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background,
        // #FECD3D is far too light for white text; every other entry is dark enough.
        color: background === '#FECD3D' ? '#1F2233' : '#FFFFFF',
        fontSize: size > 30 ? 12 : 11,
      }}
    >
      {initials}
    </span>
  );
}

/**
 * Toolbar — the filter strip that sits above a grid.
 *
 * Its own white surface rather than floating on the canvas, so the filters read as controls
 * attached to the data below them.
 */
export function Toolbar({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card bg-white px-4 py-3 shadow-card">
      {children}
    </div>
  );
}
