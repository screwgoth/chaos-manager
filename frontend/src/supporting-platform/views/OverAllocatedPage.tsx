/**
 * OverAllocatedPage — US-VIS-07. "Who is over capacity, and exactly when?"
 *
 * ONE ROW PER OFFENDING SUB-PERIOD, not per member. A person over capacity in two separate windows
 * appears twice, because the PERIODS are what need fixing — telling someone "Ada is over-booked in
 * Q3" is not actionable; "Ada is at 130% from 1–31 August" is.
 *
 * ⚠️ BR-R-13 LIVES HERE. For a scoped user the total includes assignments to projects OUTSIDE
 * their org scope, and those projects are NAMED (CQ1:A superseded Q4:A, so no redaction component
 * exists). A scope filter applied to the contributions before summing would produce a
 * plausible-looking smaller number and hide the over-allocation this page exists to surface.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/queries';
import {
  AllocationBar,
  DateRangePicker,
  ErrorState,
  LoadingState,
  formatPercentage,
  presetRange,
} from '../../shared/components';
import type {
  DateRange,
  MemberSummary,
  OverAllocationFinding,
  Page,
} from '../../shared/api/types';

export function OverAllocatedPage(): JSX.Element {
  const [range, setRange] = useState<DateRange>(presetRange('thisMonth'));

  const findings = useQuery({
    queryKey: queryKeys.overAllocated(range),
    queryFn: () =>
      api.get<{ items: OverAllocationFinding[] }>(
        `/api/allocations/over-allocated${query({ start: range.start, end: range.end })}`,
      ),
  });

  /**
   * One batched member lookup for the whole page, not one per finding (R2-1 rule 2 applies to the
   * client too — a page that scans twenty findings would otherwise issue twenty requests).
   */
  const memberList = useQuery({
    queryKey: ['members', 'names-for-over-allocated'],
    queryFn: () => api.get<Page<MemberSummary>>('/api/members?limit=500'),
  });
  const memberNames = new Map(
    (memberList.data?.items ?? []).map((member) => [member.id, member.fullName]),
  );

  const items = findings.data?.items ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[19px] font-semibold leading-tight text-ink">Over capacity</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Each entry is a specific date range in which someone is booked above 100%, with the
          assignments that add up to it.
        </p>
      </header>

      <DateRangePicker value={range} onChange={setRange} />

      {findings.isLoading ? (
        <LoadingState />
      ) : findings.isError ? (
        <ErrorState error={findings.error} />
      ) : items.length === 0 ? (
        <p
          className="rounded-md border border-good-500/30 bg-good-500/[.08] px-4 py-3 text-sm text-good-700"
          data-testid="over-allocated-empty"
        >
          Nobody is over capacity in this period.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="over-allocated-list">
          {items.map((finding) => (
            <li
              key={`${finding.memberId}-${finding.period.start}-${finding.period.end}`}
              className="rounded-md border border-line bg-white px-4 py-3"
              data-testid={`over-allocation-${finding.memberId}-${finding.period.start}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                {/*
                  The finding carries only `memberId` — `AllocationContribution` has no member name.
                  Rather than issue a lookup per finding (an N+1 on a page whose whole point is
                  scanning many findings), the link text is resolved from the member list fetched
                  ONCE below.
                */}
                <Link
                  className="font-medium text-brand-600 underline"
                  to={`/members/${finding.memberId}`}
                >
                  {memberNames.get(finding.memberId) ?? 'View person'}
                </Link>
                <span className="text-sm text-ink-muted">
                  {finding.period.start} → {finding.period.end}
                </span>
              </div>

              {/*
                AllocationBar already encodes over-allocation three ways: a distinct colour token, a
                hatched overflow tail that breaks past the track, and a never-clamped negative
                remainder. Colour alone would fail anyone who cannot distinguish it.
              */}
              <div className="mt-2">
                <AllocationBar
                  totalPercentage={finding.totalPercentage}
                  testId={`over-allocation-bar-${finding.memberId}`}
                />
              </div>

              <p className="mt-1 text-sm font-medium text-danger-700">
                {formatPercentage(finding.totalPercentage)} booked
                {finding.arisesFromOverride && ' (saved as an override)'}
              </p>

              <ul className="mt-2 space-y-1 text-sm text-ink">
                {finding.contributions.map((contribution) => (
                  <li key={contribution.assignmentId}>
                    <span className="font-mono text-xs">{contribution.projectCode}</span>{' '}
                    {contribution.projectName} — {formatPercentage(contribution.allocationPercentage)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
