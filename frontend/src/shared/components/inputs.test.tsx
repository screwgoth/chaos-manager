/**
 * PercentageInput and DateRangePicker tests.
 *
 * PercentageInput's bounds are CONVENIENCE (Q4:A): they stop the spinner producing invalid
 * values and give the browser something to hint with. They are NOT the guarantee — a user can
 * paste anything, and the domain rejects it with a field-level violation. These tests therefore
 * assert two different things: that the constraints are declared, and that pasted-in invalid
 * values are still passed upward rather than silently swallowed, because swallowing them would
 * prevent the server from ever seeing (and reporting) the problem.
 */

import { render, screen } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import { useState } from 'react';
import { DateRangePicker, PercentageInput, presetRange } from './inputs';

/**
 * user-event v14's `setup()` is the current API and is used deliberately.
 *
 * KNOWN, UNRESOLVED: this suite still prints React "update was not wrapped in act" warnings —
 * one per keystroke. Four fixes were tried (act-wrapping the clicks, act-wrapping the render,
 * flushing macrotasks inside act, and switching from the legacy userEvent API to setup()) and
 * none silenced them. The tests are correct and deterministic; the noise is not. Left as-is
 * rather than suppressing console.error, which would also hide real failures.
 */
const userEvent = userEventLib.setup();


function Harness({ initial = '' as number | '' }): JSX.Element {
  const [value, setValue] = useState<number | ''>(initial);
  return (
    <>
      <PercentageInput value={value} onChange={setValue} testId="pct" />
      <output data-testid="value">{value === '' ? 'EMPTY' : String(value)}</output>
    </>
  );
}

describe('PercentageInput constraints (BR-A-02)', () => {
  it('declares the 0.1–100 range and one-decimal step', () => {
    render(<Harness />);
    const input = screen.getByTestId('pct');

    // 0 and negatives are excluded by the minimum; the step makes the spinner produce
    // one-decimal values rather than two.
    expect(input).toHaveAttribute('min', '0.1');
    expect(input).toHaveAttribute('max', '100');
    expect(input).toHaveAttribute('step', '0.1');
  });

  it('is a number input, so a browser rejects letters before React sees them', () => {
    render(<Harness />);
    expect(screen.getByTestId('pct')).toHaveAttribute('type', 'number');
  });

  it('accepts a valid one-decimal value', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByTestId('pct'), '37.5');
    expect(screen.getByTestId('value')).toHaveTextContent('37.5');
  });

  it('preserves an EMPTY field as empty rather than coercing it to 0', async () => {
    // Coercing would make a cleared field indistinguishable from a deliberate 0%, and 0 is
    // rejected by BR-A-02 — so the required-field violation could never be triggered.
    render(<Harness initial={50} />);
    await userEvent.clear(screen.getByTestId('pct'));
    expect(screen.getByTestId('value')).toHaveTextContent('EMPTY');
  });

  it('passes an out-of-range value UPWARD rather than swallowing it', async () => {
    // The server must get the chance to reject it and name the field. A component that
    // silently clamped to 100 would hide a user's mistake instead of reporting it.
    render(<Harness />);
    const input = screen.getByTestId('pct');
    await userEvent.type(input, '150');
    expect(screen.getByTestId('value')).toHaveTextContent('150');
  });

  it('shows a percent sign that is not part of the value', () => {
    render(<Harness initial={40} />);
    expect(screen.getByText('%')).toBeInTheDocument();
    expect(screen.getByTestId('pct')).toHaveValue(40);
  });
});

describe('presetRange', () => {
  const march = new Date('2026-03-15T00:00:00.000Z');

  it('computes this month inclusively, to the last real day', () => {
    expect(presetRange('thisMonth', march)).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
    });
  });

  it('computes next month, handling a shorter month correctly', () => {
    // April has 30 days. Naive +1-month arithmetic on the 31st would produce 1 May.
    expect(presetRange('nextMonth', march)).toEqual({
      start: '2026-04-01',
      end: '2026-04-30',
    });
  });

  it('computes the quarter containing the date', () => {
    expect(presetRange('thisQuarter', march)).toEqual({
      start: '2026-01-01',
      end: '2026-03-31',
    });
  });

  it('crosses a year boundary for next quarter from Q4', () => {
    const november = new Date('2026-11-10T00:00:00.000Z');
    expect(presetRange('nextQuarter', november)).toEqual({
      start: '2027-01-01',
      end: '2027-03-31',
    });
  });

  it('handles February in a leap year', () => {
    const january2024 = new Date('2024-01-10T00:00:00.000Z');
    expect(presetRange('nextMonth', january2024)).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    });
  });
});

describe('DateRangePicker', () => {
  function RangeHarness(): JSX.Element {
    const [range, setRange] = useState({ start: '2026-01-01', end: '2026-03-31' });
    return (
      <>
        <DateRangePicker value={range} onChange={setRange} presets={['nextMonth']} />
        <output data-testid="range">{`${range.start}..${range.end}`}</output>
      </>
    );
  }

  it('labels the end date as INCLUDED, since the whole system counts it', () => {
    render(<RangeHarness />);
    // "until 31 March" reads as excluding the 31st to many people; the system includes it.
    expect(screen.getByLabelText(/to \(included\)/i)).toBeInTheDocument();
  });

  it('applies a preset', async () => {
    render(<RangeHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));

    const expected = presetRange('nextMonth');
    expect(screen.getByTestId('range')).toHaveTextContent(`${expected.start}..${expected.end}`);
  });
});
