/**
 * OverAllocationDialog tests — US-ASN-05, Q14:A.
 *
 * The dialog's job is to make an over-allocation ACTIONABLE. "This member is over-allocated" is
 * unactionable; "120% from 15 to 28 February, because of Platform at 80% and Migration at 40%"
 * tells the user exactly what to change. These tests assert the specifics are present, and that
 * confirming is a separate deliberate act from opening it.
 */

import { render, screen } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import type { OverAllocationFinding } from '../../shared/api/types';
import { AssignmentConflictNotice, OverAllocationDialog } from './OverAllocationDialog';

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


const FINDING: OverAllocationFinding = {
  memberId: 'm-1',
  period: { start: '2026-02-15', end: '2026-02-28' },
  totalPercentage: 120,
  arisesFromOverride: false,
  contributions: [
    {
      assignmentId: 'a-1',
      projectId: 'p-1',
      projectName: 'Platform Rebuild',
      projectCode: 'PRJ-1',
      allocationPercentage: 80,
      savedAsOverride: false,
    },
    {
      assignmentId: 'a-2',
      projectId: 'p-2',
      projectName: 'Data Migration',
      projectCode: 'PRJ-2',
      allocationPercentage: 40,
      savedAsOverride: false,
    },
  ],
};

function renderDialog(
  overrides: Partial<Parameters<typeof OverAllocationDialog>[0]> = {},
): { onConfirm: jest.Mock; onCancel: jest.Mock } {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(
    <OverAllocationDialog
      memberName="Ada Lovelace"
      findings={[FINDING]}
      pending={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe('the dialog names the specifics (BR-A-08)', () => {
  it('names the member', () => {
    renderDialog();
    expect(screen.getByText(/Ada Lovelace would be over capacity/i)).toBeInTheDocument();
  });

  it('names the offending SUB-PERIOD, not the whole range', () => {
    renderDialog();
    // The dates a user can act on.
    expect(screen.getByText('2026-02-15 → 2026-02-28')).toBeInTheDocument();
  });

  it('states the total for that sub-period', () => {
    renderDialog();
    // The figure appears twice by design: once in the headline as the worst point, once on
    // the sub-period row. Scoped to the row so the assertion is about the row.
    const row = screen.getByTestId('finding-2026-02-15');
    expect(row).toHaveTextContent('120%');
  });

  it('lists EVERY contributing project with its share', () => {
    renderDialog();
    expect(screen.getByText(/PRJ-1 · Platform Rebuild/)).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText(/PRJ-2 · Data Migration/)).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('renders one entry per sub-period when several offend', () => {
    const second: OverAllocationFinding = {
      ...FINDING,
      period: { start: '2026-03-01', end: '2026-03-05' },
      totalPercentage: 130,
    };
    renderDialog({ findings: [FINDING, second] });

    expect(screen.getByTestId('finding-2026-02-15')).toHaveTextContent('120%');
    expect(screen.getByTestId('finding-2026-03-01')).toHaveTextContent('130%');

    // The headline reports the WORST figure across all sub-periods, not the first.
    expect(screen.getByText(/would take Ada Lovelace to/i)).toHaveTextContent('130%');
  });

  it('marks a PRE-EXISTING over-allocation as such (BR-A-12)', () => {
    renderDialog({
      findings: [
        {
          ...FINDING,
          arisesFromOverride: true,
          contributions: FINDING.contributions.map((c) => ({ ...c, savedAsOverride: true })),
        },
      ],
    });

    expect(screen.getByText(/already over capacity before this change/i)).toBeInTheDocument();
    expect(screen.getAllByText(/already an override/i).length).toBeGreaterThan(0);
  });
});

describe('confirmation is explicit (BR-A-09, BR-A-10)', () => {
  it('offers going back as well as saving anyway', () => {
    renderDialog();
    expect(screen.getByTestId('cancel-override')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-override')).toBeInTheDocument();
  });

  it('does nothing until a button is pressed', () => {
    const { onConfirm, onCancel } = renderDialog();
    // Merely opening the dialog must not save (BR-A-10: nothing persists until confirmed).
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onConfirm only when Save anyway is pressed', async () => {
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.click(screen.getByTestId('confirm-override'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when going back, and never confirms', async () => {
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.click(screen.getByTestId('cancel-override'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes on Escape without confirming', async () => {
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.keyboard('{Escape}');

    // A modal a keyboard user cannot leave is a trap — and leaving must not save.
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('blocks: it is a modal dialog, not an inline notice', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('disables the confirm button while the save is in flight', () => {
    renderDialog({ pending: true });
    expect(screen.getByTestId('confirm-override')).toBeDisabled();
  });

  it('says the save will be flagged, so the consequence is known before confirming', () => {
    renderDialog();
    expect(screen.getByText(/flagged as an override everywhere it appears/i)).toBeInTheDocument();
  });
});

/**
 * The contrast that matters: conflicts are NON-blocking (BR-A-13, BR-A-14). Assigning a
 * contractor past their contract end is often deliberate.
 */
describe('AssignmentConflictNotice is inline, not blocking', () => {
  it('renders nothing when there are no conflicts', () => {
    const { container } = render(<AssignmentConflictNotice conflicts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the detail without any confirm or cancel action', () => {
    render(
      <AssignmentConflictNotice
        conflicts={[
          {
            kind: 'CONTRACT_WINDOW',
            detail: 'This assignment runs to 2026-12-31, beyond the contract end of 2026-09-30.',
          },
        ]}
      />,
    );

    expect(screen.getByText(/beyond the contract end of 2026-09-30/i)).toBeInTheDocument();
    // No buttons: it informs, it does not gate.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
