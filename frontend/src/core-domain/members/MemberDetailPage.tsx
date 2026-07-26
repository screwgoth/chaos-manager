/**
 * MemberDetailPage and DeactivateMemberDialog — US-MEM-01, US-MEM-05.
 *
 * The dialog STATES THE COUNT of assignments that will be auto-ended before confirming
 * (BR-M-13), so the cascade is never a surprise. Deactivating someone silently changes other
 * people's project plans; the number is the difference between an informed action and a
 * side effect.
 */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/queries';
import {
  AllocationSegmentStrip,
  Button,
  Dialog,
  ErrorState,
  LoadingState,
  formatPercentage,
} from '../../shared/components';
import { useNameResolver, useOrgUnitResolver } from '../../shared/hooks/lookups';
import { presetRange } from '../../shared/components';
import type { Assignment, TimelineSegment } from '../../shared/api/types';
import { useCanWrite } from '../../shared/session/SessionProvider';
import { useDeactivateMember, useMember, useReactivateMember } from './api';

export function MemberDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const memberId = id as string;
  const navigate = useNavigate();
  const canWrite = useCanWrite();

  const { data: member, isLoading, error, refetch } = useMember(memberId);
  const roleName = useNameResolver('ROLE');
  const skillName = useNameResolver('SKILL');
  const orgUnitName = useOrgUnitResolver();

  const [confirming, setConfirming] = useState(false);
  const deactivate = useDeactivateMember();
  const reactivate = useReactivateMember();
  const [cascadeMessage, setCascadeMessage] = useState<string | null>(null);

  const range = presetRange('thisQuarter');

  const { data: timeline } = useQuery({
    queryKey: queryKeys.memberTimeline(memberId, range),
    queryFn: () =>
      api.get<{ items: TimelineSegment[] }>(
        `/api/allocations/members/${memberId}/timeline${query({ start: range.start, end: range.end })}`,
      ),
    select: (response) => response.items,
  });

  const { data: assignments } = useQuery({
    queryKey: queryKeys.assignments({ memberId }),
    queryFn: () =>
      api.get<{ items: Assignment[] }>(`/api/assignments${query({ memberId })}`),
    select: (response) => response.items,
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!member) return <ErrorState error={new Error('That person could not be found.')} />;

  const openAssignmentCount = (assignments ?? []).filter(
    (assignment) => assignment.status === 'ACTIVE' && assignment.endDate >= new Date().toISOString().slice(0, 10),
  ).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{member.fullName}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {member.email} · {orgUnitName(member.orgUnitId)} · {roleName(member.roleId)}
          </p>
          {member.status === 'INACTIVE' ? (
            <p className="mt-1 text-sm font-medium text-slate-600" data-testid="deactivated-notice">
              Deactivated on {member.deactivatedOn}. Kept for historical views.
            </p>
          ) : null}
        </div>

        {canWrite ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(`/members/${memberId}/edit`)}>
              Edit
            </Button>
            {member.status === 'ACTIVE' ? (
              <Button
                variant="danger"
                onClick={() => setConfirming(true)}
                data-testid="deactivate-member"
              >
                Deactivate
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => void reactivate.mutateAsync(memberId)}
                data-testid="reactivate-member"
              >
                Reactivate
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {cascadeMessage ? (
        <div
          className="mb-4 rounded border border-allocation-full/40 bg-allocation-full/5 px-3 py-2 text-sm text-slate-700"
          role="status"
          data-testid="cascade-result"
        >
          {cascadeMessage}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Allocation this quarter
          </h2>
          <AllocationSegmentStrip
            segments={timeline ?? []}
            range={range}
            testId={`timeline-${memberId}`}
          />

          <ul className="mt-4 space-y-1.5 text-sm">
            {(timeline ?? []).map((segment) => (
              <li
                key={segment.period.start}
                className="flex items-baseline justify-between border-b border-slate-100 pb-1 last:border-b-0"
              >
                <span className="tabular-nums text-slate-600">
                  {segment.period.start} → {segment.period.end}
                </span>
                <span
                  className={
                    segment.isOverAllocated
                      ? 'font-semibold text-allocation-over'
                      : segment.isGap
                        ? 'text-slate-400'
                        : 'text-slate-800'
                  }
                >
                  {segment.isGap ? 'Nothing booked' : formatPercentage(segment.totalPercentage)}
                  {segment.isOverAllocated ? ' — over capacity' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-5">
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Engagement</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Type</dt>
                <dd>{member.employmentType === 'ON_ROLL' ? 'On roll' : 'Off roll'}</dd>
              </div>
              {member.externalRef ? (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Employee ID</dt>
                  <dd className="tabular-nums">{member.externalRef}</dd>
                </div>
              ) : null}
            </dl>

            {/* Shown whenever a contract exists, including after an OFF_ROLL → ON_ROLL
                conversion, because BR-M-10 retains it as history. */}
            {member.contract ? (
              <div className="mt-3 border-t border-slate-100 pt-3" data-testid="contract-summary">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Contract{member.employmentType === 'ON_ROLL' ? ' (retained)' : ''}
                </h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Vendor</dt>
                    <dd>{member.contract.vendorName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Runs to</dt>
                    <dd className="tabular-nums">{member.contract.endDate}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Status</dt>
                    <dd>{member.contract.status}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </section>

          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Skills</h2>
            {member.skillIds.length === 0 ? (
              <p className="text-sm text-slate-500">None recorded.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {member.skillIds.map((skillId) => (
                  <li
                    key={skillId}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                  >
                    {skillName(skillId)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {confirming ? (
        <DeactivateMemberDialog
          memberName={member.fullName}
          openAssignmentCount={openAssignmentCount}
          pending={deactivate.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await deactivate.mutateAsync(memberId);
            setConfirming(false);
            setCascadeMessage(
              result.autoEndedAssignmentCount === 0
                ? `${member.fullName} is deactivated. No assignments needed ending.`
                : `${member.fullName} is deactivated. ${result.autoEndedAssignmentCount} assignment${result.autoEndedAssignmentCount === 1 ? '' : 's'} ended today.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * DeactivateMemberDialog — BR-M-13.
 *
 * States the count BEFORE confirming, and says plainly that reactivating will not bring the
 * assignments back (BR-M-15) — which is the part a user would otherwise assume wrongly.
 */
function DeactivateMemberDialog({
  memberName,
  openAssignmentCount,
  pending,
  onConfirm,
  onCancel,
}: {
  memberName: string;
  openAssignmentCount: number;
  pending: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  return (
    <Dialog
      title={`Deactivate ${memberName}?`}
      tone="warning"
      onClose={onCancel}
      testId="deactivate-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Keep active
          </Button>
          <Button variant="danger" onClick={() => void onConfirm()} disabled={pending} data-testid="confirm-deactivate">
            {pending ? 'Deactivating…' : 'Deactivate and end assignments'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        {openAssignmentCount === 0
          ? 'They have no assignments running past today, so nothing will be ended.'
          : `${openAssignmentCount} assignment${openAssignmentCount === 1 ? '' : 's'} running past today will be ended as of today.`}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Their history stays intact and they remain visible in past views. Reactivating later
        restores their availability but <strong>does not</strong> restore ended assignments —
        those must be created again.
      </p>
    </Dialog>
  );
}
