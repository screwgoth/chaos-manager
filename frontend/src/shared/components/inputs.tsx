/**
 * Form primitives: Field, TextInput, Select, PercentageInput, DateRangePicker.
 *
 * CLIENT VALIDATION IS CONVENIENCE ONLY (Q4:A). Every rule here is re-enforced server-side,
 * and the server's `violations` array is authoritative. These inputs narrow what can be typed
 * to reduce round trips; they never decide whether something is valid.
 */

import { useId, type ReactNode } from 'react';
import type { DateRange } from '../api/types';

export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-medium text-ink-muted">
        {label}
        {required ? <span className="ml-0.5 text-allocation-over">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11.5px] text-faded">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  'w-full rounded-card border border-line-strong bg-white px-3 py-2 text-[13.5px] text-ink transition-colors placeholder:text-faded-soft hover:border-faded-soft focus:border-brand-500';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ''}`} rows={3} />;
}

/**
 * PercentageInput — one decimal place, 0.1 to 100 (BR-A-02).
 *
 * `step="0.1"` and the bounds are hints to the browser, not guarantees: a user can paste
 * anything, and the domain rejects two-decimal values with a field-level violation. The point
 * of the step is that the spinner produces valid values, not that invalid ones are impossible.
 *
 * Zero and negatives are rejected server-side; `min` merely stops the spinner reaching them.
 */
export function PercentageInput({
  value,
  onChange,
  id,
  testId,
}: {
  value: number | '';
  onChange: (value: number | '') => void;
  id?: string;
  testId?: string;
}): JSX.Element {
  return (
    <div className="relative">
      <input
        id={id}
        data-testid={testId}
        type="number"
        inputMode="decimal"
        min={0.1}
        max={100}
        step={0.1}
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          // Empty is preserved as '' rather than coerced to 0: a cleared field is not "0%",
          // and coercing it would make the required-field violation impossible to trigger.
          onChange(raw === '' ? '' : Number(raw));
        }}
        className={`${inputClass} pr-8 tabular-nums`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-faded">
        %
      </span>
    </div>
  );
}

/** Presets phrased as the questions people actually ask (US-VIS-02's "next month"). */
export type RangePreset = 'thisMonth' | 'nextMonth' | 'thisQuarter' | 'nextQuarter';

export function presetRange(preset: RangePreset, today = new Date()): DateRange {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  const iso = (date: Date): string => date.toISOString().slice(0, 10);
  const firstOf = (y: number, m: number): Date => new Date(Date.UTC(y, m, 1));
  // Day 0 of the NEXT month is the last day of this one — avoids month-length arithmetic.
  const lastOf = (y: number, m: number): Date => new Date(Date.UTC(y, m + 1, 0));

  switch (preset) {
    case 'thisMonth':
      return { start: iso(firstOf(year, month)), end: iso(lastOf(year, month)) };
    case 'nextMonth':
      return { start: iso(firstOf(year, month + 1)), end: iso(lastOf(year, month + 1)) };
    case 'thisQuarter': {
      const quarterStart = Math.floor(month / 3) * 3;
      return { start: iso(firstOf(year, quarterStart)), end: iso(lastOf(year, quarterStart + 2)) };
    }
    case 'nextQuarter': {
      const quarterStart = Math.floor(month / 3) * 3 + 3;
      return { start: iso(firstOf(year, quarterStart)), end: iso(lastOf(year, quarterStart + 2)) };
    }
  }
}

const PRESET_LABELS: Record<RangePreset, string> = {
  thisMonth: 'This month',
  nextMonth: 'Next month',
  thisQuarter: 'This quarter',
  nextQuarter: 'Next quarter',
};

/**
 * DateRangePicker — an INCLUSIVE range (AS-03).
 *
 * The label says "to" rather than "until", because "until 31 March" reads as excluding the
 * 31st to many people, and the whole system counts it. Small wording, real ambiguity.
 */
export function DateRangePicker({
  value,
  onChange,
  presets = ['thisMonth', 'nextMonth', 'thisQuarter'],
  testId,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: RangePreset[];
  testId?: string;
}): JSX.Element {
  const startId = useId();
  const endId = useId();

  return (
    <div data-testid={testId}>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={startId} className="label-micro mb-1 block">
            From
          </label>
          <input
            id={startId}
            type="date"
            value={value.start}
            onChange={(event) => onChange({ ...value, start: event.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={endId} className="label-micro mb-1 block">
            To (included)
          </label>
          <input
            id={endId}
            type="date"
            value={value.end}
            onChange={(event) => onChange({ ...value, end: event.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      {presets.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(presetRange(preset))}
              className="rounded-full border border-line-strong bg-white px-3 py-1 text-[11.5px] font-medium text-ink-muted transition-colors hover:border-brand-500/60 hover:text-brand-600"
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
