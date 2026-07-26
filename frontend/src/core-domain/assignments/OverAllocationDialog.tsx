/**
 * OverAllocationDialog — US-ASN-05, Q14:A: a BLOCKING modal.
 *
 * Q14:A chose blocking over an inline warning deliberately. An inline warning beside a save
 * button gets clicked past; over-allocating a person affects their other projects, so the
 * decision deserves a stop.
 *
 * WHAT IT MUST NAME (BR-A-08): the member, each offending SUB-PERIOD, the total, and the
 * contributing assignments. "This member is over-allocated" is unactionable. "120% from 15 to
 * 28 February, because of Platform (80%) and Migration (40%)" tells the user exactly what to
 * change.
 */

import { Button, Dialog, formatPercentage } from '../../shared/components';
import type { OverAllocationFinding } from '../../shared/api/types';

export function OverAllocationDialog({
  memberName,
  findings,
  pending,
  onConfirm,
  onCancel,
}: {
  memberName: string;
  findings: OverAllocationFinding[];
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const worst = findings.reduce(
    (highest, finding) => Math.max(highest, finding.totalPercentage),
    0,
  );

  return (
    <Dialog
      title={`${memberName} would be over capacity`}
      tone="warning"
      onClose={onCancel}
      testId="over-allocation-dialog"
      footer={
        <>
          {/* Cancel is the safe default and comes first. BR-A-10: cancelling persists nothing. */}
          <Button variant="secondary" onClick={onCancel} data-testid="cancel-override">
            Go back and change it
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={pending}
            data-testid="confirm-override"
          >
            {pending ? 'Saving…' : 'Save anyway'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        This assignment would take {memberName} to{' '}
        <strong className="text-allocation-over">{formatPercentage(worst)}</strong> at their busiest
        point. You can still save it — it will be flagged as an override everywhere it appears.
      </p>

      <ul className="mt-4 space-y-3" data-testid="over-allocation-findings">
        {findings.map((finding) => (
          <li
            key={`${finding.period.start}-${finding.period.end}`}
            className="rounded border border-allocation-over/30 bg-allocation-over/5 p-3"
            data-testid={`finding-${finding.period.start}`}
          >
            <div className="flex items-baseline justify-between">
              {/* The specific sub-period, not the whole range. */}
              <span className="text-sm font-medium tabular-nums text-slate-800">
                {finding.period.start} → {finding.period.end}
              </span>
              <span className="text-sm font-semibold tabular-nums text-allocation-over">
                {formatPercentage(finding.totalPercentage)}
              </span>
            </div>

            <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
              {finding.contributions.map((contribution) => (
                <li key={contribution.assignmentId} className="flex justify-between tabular-nums">
                  <span>
                    {contribution.projectCode} · {contribution.projectName}
                    {contribution.savedAsOverride ? ' (already an override)' : ''}
                  </span>
                  <span>{formatPercentage(contribution.allocationPercentage)}</span>
                </li>
              ))}
            </ul>

            {finding.arisesFromOverride ? (
              <p className="mt-2 text-xs text-slate-500">
                This period was already over capacity before this change.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/**
 * AssignmentConflictNotice — BR-A-13, BR-A-14.
 *
 * NON-BLOCKING and inline, unlike the over-allocation dialog. These are legitimate plans that
 * need a caveat: assigning a contractor past their contract end is often deliberate, and
 * blocking it would force a contract edit before the plan could be recorded.
 */
export function AssignmentConflictNotice({
  conflicts,
}: {
  conflicts: { kind: string; detail: string }[];
}): JSX.Element | null {
  if (conflicts.length === 0) return null;

  return (
    <div
      className="mb-4 rounded border border-allocation-full/40 bg-allocation-full/5 px-3 py-2"
      role="status"
      data-testid="assignment-conflicts"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-allocation-full">
        Worth knowing
      </p>
      <ul className="mt-1 space-y-1">
        {conflicts.map((conflict) => (
          <li key={conflict.detail} className="text-sm text-slate-700">
            {conflict.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
