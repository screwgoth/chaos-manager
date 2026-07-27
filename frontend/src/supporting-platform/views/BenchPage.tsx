/**
 * BenchPage — US-VIS-06. "Who has nothing booked?"
 *
 * The endpoint has existed since Unit 1 (`/api/allocations/unallocated`) with a query key already
 * declared in `queries.ts`, but no screen consumed it. This is that screen.
 *
 * THE EMPTY STATE IS POSITIVE, and that is a deliberate departure from the shared `EmptyState`
 * default. An empty bench is GOOD NEWS — everyone has work. Rendering the generic "No results"
 * would read as a failed query and invite someone to go looking for a bug (U2-NFR-U-07).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/queries';
import {
  DataTable,
  DateRangePicker,
  ErrorState,
  LoadingState,
  presetRange,
  type Column,
} from '../../shared/components';
import { useOrgUnits, useReferenceData } from '../../shared/hooks/lookups';
import type { DateRange, MemberSummary } from '../../shared/api/types';

export function BenchPage(): JSX.Element {
  // Next month, matching AvailabilitySearchPage: the bench you care about is the one ahead of you.
  const [range, setRange] = useState<DateRange>(presetRange('nextMonth'));

  const { data: orgUnits } = useOrgUnits(false);
  const { data: roles } = useReferenceData('ROLE', false);

  const bench = useQuery({
    queryKey: queryKeys.unallocated(range),
    queryFn: () =>
      api.get<{ items: MemberSummary[] }>(
        `/api/allocations/unallocated${query({ start: range.start, end: range.end })}`,
      ),
  });

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string): string =>
    list?.find((entry) => entry.id === id)?.name ?? '—';

  const columns: Column<MemberSummary>[] = [
    {
      key: 'name',
      header: 'Person',
      render: (row) => (
        <Link className="font-medium text-brand-600 underline" to={`/members/${row.id}`}>
          {row.fullName}
        </Link>
      ),
    },
    { key: 'org', header: 'Org unit', render: (row) => nameOf(orgUnits, row.orgUnitId) },
    { key: 'role', header: 'Role', render: (row) => nameOf(roles, row.roleId) },
    {
      key: 'type',
      header: 'Employment',
      render: (row) => (row.employmentType === 'ON_ROLL' ? 'On roll' : 'Off roll'),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[19px] font-semibold leading-tight text-ink">Bench</h1>
        <p className="mt-1 text-sm text-ink-muted">
          People with nothing booked for any part of the selected period.
        </p>
      </header>

      <DateRangePicker value={range} onChange={setRange} />

      {bench.isLoading ? (
        <LoadingState />
      ) : bench.isError ? (
        <ErrorState error={bench.error} />
      ) : (bench.data?.items ?? []).length === 0 ? (
        <p
          className="rounded-md border border-good-500/30 bg-good-500/[.08] px-4 py-3 text-sm text-good-700"
          data-testid="bench-empty"
        >
          Everyone has work booked in this period. Nobody is on the bench.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted" data-testid="bench-count">
            {bench.data?.items.length} on the bench.
          </p>
          <DataTable
            columns={columns}
            rows={bench.data?.items ?? []}
            rowKey={(row) => row.id}
          />
        </>
      )}
    </div>
  );
}
