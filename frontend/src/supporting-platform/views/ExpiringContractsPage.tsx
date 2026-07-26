/**
 * ExpiringContractsPage — US-MEM-06.
 *
 * A FLAG, NOT AN ERROR. An expiring contract is information, and Unit 1 already established that a
 * contract-window conflict on an assignment is a NON-BLOCKING warning. This screen keeps that
 * posture: it is a list of things to act on, ordered soonest-first, not a list of problems.
 *
 * `daysRemaining` comes from the SERVER (AS-03). Computing it in the browser would render
 * "expires in 1 day" for a contract that ended yesterday, for anyone in a timezone behind UTC.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import {
  DataTable,
  ErrorState,
  Field,
  LoadingState,
  TextInput,
  type Column,
} from '../../shared/components';
import { useOrgUnits } from '../../shared/hooks/lookups';
import type { MemberSummary } from '../../shared/api/types';

interface ExpiringContract {
  member: MemberSummary;
  contractEndDate: string;
  daysRemaining: number;
}

/** Matches the server's CONTRACT_EXPIRY_WARN_DAYS default. */
const DEFAULT_WITHIN_DAYS = 30;

export function ExpiringContractsPage(): JSX.Element {
  const [withinDays, setWithinDays] = useState(String(DEFAULT_WITHIN_DAYS));

  const parsed = Number.parseInt(withinDays, 10);
  const effective = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WITHIN_DAYS;

  const { data: orgUnits } = useOrgUnits(false);

  const expiring = useQuery({
    queryKey: ['members', 'expiring-contracts', effective],
    queryFn: () =>
      api.get<{ items: ExpiringContract[]; withinDays: number }>(
        `/api/members/expiring-contracts${query({ withinDays: String(effective) })}`,
      ),
  });

  const columns: Column<ExpiringContract>[] = [
    {
      key: 'name',
      header: 'Person',
      render: (row) => (
        <Link className="font-medium text-sky-700 underline" to={`/members/${row.member.id}`}>
          {row.member.fullName}
        </Link>
      ),
    },
    {
      key: 'org',
      header: 'Org unit',
      render: (row) => orgUnits?.find((unit) => unit.id === row.member.orgUnitId)?.name ?? '—',
    },
    { key: 'end', header: 'Contract ends', render: (row) => row.contractEndDate },
    {
      key: 'days',
      header: 'Days left',
      numeric: true,
      render: (row) => (
        <span
          className={row.daysRemaining <= 7 ? 'font-semibold text-amber-800' : undefined}
          data-testid={`expiring-days-${row.member.id}`}
        >
          {/* 0 means it ends today, which is worth saying in words rather than as a bare zero. */}
          {row.daysRemaining === 0 ? 'today' : row.daysRemaining}
        </span>
      ),
    },
  ];

  const items = expiring.data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Contracts ending soon</h1>
        <p className="mt-1 text-sm text-slate-600">
          Off-roll people whose contract ends within the window below, soonest first. Assignments
          reaching past a contract end are allowed — this is a heads-up, not a block.
        </p>
      </header>

      <div className="max-w-xs">
        <Field label="Within how many days?" htmlFor="within-days">
          <TextInput
            id="within-days"
            data-testid="expiring-within-days"
            type="number"
            min={1}
            value={withinDays}
            onChange={(event) => setWithinDays(event.target.value)}
          />
        </Field>
      </div>

      {expiring.isLoading ? (
        <LoadingState />
      ) : expiring.isError ? (
        <ErrorState error={expiring.error} />
      ) : items.length === 0 ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          data-testid="expiring-empty"
        >
          No contracts end within the next {effective} days.
        </p>
      ) : (
        <DataTable columns={columns} rows={items} rowKey={(row) => row.member.id} />
      )}
    </div>
  );
}
