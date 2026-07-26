/**
 * AvailabilitySearchPage — US-VIS-02, US-VIS-03.
 *
 * This screen exists to answer ONE question in under a minute: "who knows X and is free next
 * month?" So the skill filter and the "next month" preset are the two most prominent controls —
 * they are the question, not refinements to it.
 *
 * MIN AND MAX are both shown, because they answer different things: the minimum says whether
 * someone can take the whole period, the maximum whether there is a window worth negotiating.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/queries';
import {
  AllocationSegmentStrip,
  Button,
  DateRangePicker,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  formatPercentage,
  presetRange,
} from '../../shared/components';
import { useOrgUnits, useReferenceData } from '../../shared/hooks/lookups';
import type { AvailabilityRow, DateRange, Page } from '../../shared/api/types';

export function AvailabilitySearchPage(): JSX.Element {
  // Defaults to NEXT month, because that is the horizon people are actually staffing.
  const [range, setRange] = useState<DateRange>(presetRange('nextMonth'));
  const [skillId, setSkillId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [minimumAvailable, setMinimumAvailable] = useState('');

  const { data: skills } = useReferenceData('SKILL', false);
  const { data: orgUnits } = useOrgUnits(false);

  const filters = { range, skillId, orgUnitId, minimumAvailable };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.availability(filters),
    queryFn: () =>
      api.get<Page<AvailabilityRow>>(
        `/api/allocations/availability${query({
          start: range.start,
          end: range.end,
          skillIds: skillId === '' ? undefined : [skillId],
          orgUnitIds: orgUnitId === '' ? undefined : [orgUnitId],
          minimumAvailablePercentage: minimumAvailable === '' ? undefined : minimumAvailable,
          limit: 100,
        })}`,
      ),
  });

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Availability</h1>
        <p className="mt-0.5 text-sm text-slate-500">Who has room, and when.</p>
      </div>

      <div className="mb-5 rounded border border-slate-200 bg-white p-4">
        {/* Skill first: it is the question people arrive with. */}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="skill" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Skill
            </label>
            <Select
              id="skill"
              value={skillId}
              onChange={(event) => setSkillId(event.target.value)}
              data-testid="availability-skill"
            >
              <option value="">Any skill</option>
              {(skills ?? []).map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="orgUnit" className="mb-1 block text-xs font-medium text-slate-600">
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
            <label htmlFor="minAvailable" className="mb-1 block text-xs font-medium text-slate-600">
              At least this free
            </label>
            <Select
              id="minAvailable"
              value={minimumAvailable}
              onChange={(event) => setMinimumAvailable(event.target.value)}
            >
              <option value="">Any</option>
              <option value="20">20%</option>
              <option value="50">50%</option>
              <option value="80">80%</option>
              <option value="100">Completely free</option>
            </Select>
          </div>
        </div>

        <DateRangePicker
          value={range}
          onChange={setRange}
          presets={['nextMonth', 'thisMonth', 'thisQuarter', 'nextQuarter']}
          testId="availability-range"
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState label="Searching" />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          message="Nobody matches this search."
          hint="Try a wider date range, a lower availability threshold, or no skill filter."
          testId="availability-empty"
        />
      ) : (
        <ul className="space-y-3" data-testid="availability-results">
          {(data?.items ?? []).map((row) => (
            <li
              key={row.member.id}
              className="rounded border border-slate-200 bg-white p-4"
              data-testid={`availability-${row.member.id}`}
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  to={`/members/${row.member.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {row.member.fullName}
                </Link>

                <div className="flex items-baseline gap-4 text-sm tabular-nums">
                  <span className={row.minAvailablePercentage < 0 ? 'text-allocation-over' : 'text-slate-600'}>
                    <span className="text-xs text-slate-500">least free </span>
                    {formatPercentage(row.minAvailablePercentage)}
                  </span>
                  <span className="text-slate-800">
                    <span className="text-xs text-slate-500">most free </span>
                    {formatPercentage(row.maxAvailablePercentage)}
                  </span>
                  {row.isOverAllocated ? (
                    <span className="rounded-full bg-allocation-over/10 px-2 py-0.5 text-xs font-medium text-allocation-over">
                      Over capacity
                    </span>
                  ) : row.isFullyAllocated ? (
                    <span className="rounded-full bg-allocation-full/10 px-2 py-0.5 text-xs font-medium text-allocation-full">
                      Fully booked
                    </span>
                  ) : null}
                </div>
              </div>

              {/* The strip shows WHEN the capacity is, which the two numbers cannot. */}
              <AllocationSegmentStrip
                segments={row.segments}
                range={range}
                testId={`strip-${row.member.id}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
