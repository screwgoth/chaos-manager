/**
 * HistoricalAllocationPage — US-ASN-07.
 *
 * THE AS-OF NOTICE IS NOT DECORATION. These figures come from `AssignmentHistory` (BR-A-22 Path
 * B): they are what the system BELIEVED on that date, which can differ from what it believes
 * now about that date. A user comparing this screen with the live allocation view must be able
 * to tell why the numbers differ, so the source and the as-of date are stated on screen.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/queries';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  TextInput,
  formatPercentage,
  presetRange,
  type Column,
} from '../../shared/components';
import { today } from '../../shared/hooks/lookups';
import type { HistoricalRevision, MemberSummary } from '../../shared/api/types';
import { useMembers } from '../members/api';

export function HistoricalAllocationPage(): JSX.Element {
  const quarter = presetRange('thisQuarter');
  const [asOf, setAsOf] = useState(today());
  const [memberId, setMemberId] = useState('');

  const { data: memberPage } = useMembers({
    search: '',
    orgUnitIds: [],
    employmentType: '',
    // Deliberately BOTH: BR-A-23 includes assignments of members since deactivated, and
    // filtering to active here would hide exactly the history this screen exists to show.
    status: '',
    skillIds: [],
    roleId: '',
    offset: 0,
    limit: 200,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.assignmentsAsOf(asOf, { memberId, quarter }),
    queryFn: () =>
      api.get<{ asOf: string; source: string; items: HistoricalRevision[] }>(
        `/api/assignments/as-of${query({
          asOf,
          start: quarter.start,
          end: quarter.end,
          memberIds: [memberId],
        })}`,
      ),
    enabled: memberId !== '',
  });

  const nameOf = (id: string): string =>
    memberPage?.items.find((member: MemberSummary) => member.id === id)?.fullName ?? id;

  const columns: Column<HistoricalRevision>[] = [
    { key: 'member', header: 'Person', render: (row) => nameOf(row.memberId) },
    {
      key: 'period',
      header: 'Period',
      render: (row) => (
        <span className="tabular-nums text-ink-muted">
          {row.startDate} → {row.endDate}
        </span>
      ),
    },
    {
      key: 'allocation',
      header: 'Allocation',
      numeric: true,
      render: (row) => formatPercentage(row.allocationPercentage),
    },
    {
      key: 'recorded',
      header: 'Recorded',
      render: (row) => (
        <span className="text-xs tabular-nums text-faded">
          {row.recordedAt.slice(0, 10)} · rev {row.revisionNumber} · {row.operation.toLowerCase()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[19px] font-semibold leading-tight text-ink">History</h1>
        <p className="mt-0.5 text-sm text-faded">
          What the plan looked like on a past date.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card bg-white shadow-card p-4">
        <div>
          <label htmlFor="member" className="mb-1 block text-xs font-medium text-ink-muted">
            Person
          </label>
          <Select id="member" value={memberId} onChange={(event) => setMemberId(event.target.value)} data-testid="history-member">
            <option value="">Choose a person</option>
            {(memberPage?.items ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
                {member.status === 'INACTIVE' ? ' (deactivated)' : ''}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="asOfDate" className="mb-1 block text-xs font-medium text-ink-muted">
            As the records stood on
          </label>
          <TextInput
            id="asOfDate"
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            data-testid="history-as-of"
          />
        </div>
        <Button variant="secondary" onClick={() => void refetch()} disabled={memberId === ''}>
          Look up
        </Button>
      </div>

      {/* The notice that makes the figures interpretable. */}
      {data ? (
        <div
          className="mb-4 rounded-card border border-line-strong bg-canvas px-3 py-2 text-sm text-ink"
          role="note"
          data-testid="as-of-notice"
        >
          Reconstructed from assignment history as the records stood on{' '}
          <strong className="tabular-nums">{data.asOf}</strong>. Later edits are not reflected, so
          these figures can differ from today’s allocation view — that difference is the point.
        </div>
      ) : null}

      {memberId === '' ? (
        <EmptyState
          message="Choose a person and a date."
          hint="History covers this quarter, and includes people who have since been deactivated."
        />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(row) => `${row.assignmentId}-${row.revisionNumber}`}
          emptyMessage="Nothing was recorded for this person on that date."
          emptyHint="They may not have been assigned to anything yet, or the assignment was created later."
          testId="history-table"
        />
      )}
    </div>
  );
}
