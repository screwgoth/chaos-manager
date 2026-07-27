/**
 * AllocationViewPage — US-VIS-01.
 *
 * The primary landing screen for everyone except a Team Member. Its job is one question
 * answered fast: who is booked, and who has room?
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/queries';
import {
  AllocationBar,
  Button,
  DataTable,
  ErrorState,
  Select,
  TextInput,
  formatPercentage,
  type Column,
} from '../../shared/components';
import { useOrgUnits, useReferenceData, today } from '../../shared/hooks/lookups';
import type { MemberAllocationRow, Page } from '../../shared/api/types';

export function AllocationViewPage(): JSX.Element {
  const [asOf, setAsOf] = useState(today());
  const [orgUnitId, setOrgUnitId] = useState('');
  const [skillId, setSkillId] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const { data: orgUnits } = useOrgUnits(false);
  const { data: skills } = useReferenceData('SKILL', false);

  const filters = { asOf, orgUnitId, skillId, offset, limit };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.allocations(filters),
    queryFn: () =>
      api.get<Page<MemberAllocationRow> & { asOf: string }>(
        `/api/allocations/current${query({
          asOf,
          orgUnitIds: orgUnitId === '' ? undefined : [orgUnitId],
          skillIds: skillId === '' ? undefined : [skillId],
          offset,
          limit,
        })}`,
      ),
  });

  const columns: Column<MemberAllocationRow>[] = [
    {
      key: 'member',
      header: 'Person',
      render: (row) => (
        <Link to={`/members/${row.member.id}`} className="font-medium text-ink hover:underline">
          {row.member.fullName}
        </Link>
      ),
    },
    {
      key: 'allocation',
      header: 'Booked',
      render: (row) => (
        <AllocationBar
          totalPercentage={row.totalPercentage}
          availablePercentage={row.availablePercentage}
          testId={`allocation-${row.member.id}`}
        />
      ),
      className: 'w-72',
    },
    {
      key: 'projects',
      header: 'On',
      render: (row) =>
        row.contributions.length === 0 ? (
          <span className="text-xs text-faded-soft">Nothing booked</span>
        ) : (
          <ul className="space-y-0.5 text-xs text-ink-muted">
            {row.contributions.map((contribution) => (
              <li key={contribution.assignmentId}>
                {contribution.projectCode} · {formatPercentage(contribution.allocationPercentage)}
                {/* BR-A-12: an accepted override stays visibly flagged. */}
                {contribution.savedAsOverride ? (
                  <span className="ml-1 text-allocation-over">(override)</span>
                ) : null}
              </li>
            ))}
          </ul>
        ),
    },
  ];

  const overAllocatedCount = (data?.items ?? []).filter((row) => row.isOverAllocated).length;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[19px] font-semibold leading-tight text-ink">Allocation</h1>
        <p className="mt-0.5 text-sm text-faded">Who is booked, and how much room is left.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card bg-white shadow-card p-4">
        <div>
          <label htmlFor="asOf" className="mb-1 block text-xs font-medium text-ink-muted">
            On
          </label>
          <TextInput
            id="asOf"
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            data-testid="as-of"
          />
        </div>
        <div>
          <label htmlFor="orgUnit" className="mb-1 block text-xs font-medium text-ink-muted">
            Org unit
          </label>
          <Select id="orgUnit" value={orgUnitId} onChange={(event) => setOrgUnitId(event.target.value)}>
            <option value="">All</option>
            {(orgUnits ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="skill" className="mb-1 block text-xs font-medium text-ink-muted">
            Skill
          </label>
          <Select id="skill" value={skillId} onChange={(event) => setSkillId(event.target.value)}>
            <option value="">Any</option>
            {(skills ?? []).map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={() => setAsOf(today())}>
          Today
        </Button>
      </div>

      {overAllocatedCount > 0 ? (
        <div
          className="mb-4 rounded-card border border-allocation-over/30 bg-allocation-over/5 px-3 py-2 text-sm text-allocation-over"
          role="status"
          data-testid="over-allocated-banner"
        >
          {overAllocatedCount} {overAllocatedCount === 1 ? 'person is' : 'people are'} over capacity
          on this date.
        </div>
      ) : null}

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(row) => row.member.id}
          loading={isLoading}
          emptyMessage="Nobody in scope on this date."
          emptyHint="Change the date or clear the filters."
          pagination={
            data
              ? { total: data.total, offset: data.offset, limit: data.limit, onOffsetChange: setOffset }
              : undefined
          }
          testId="allocation-table"
        />
      )}
    </div>
  );
}
