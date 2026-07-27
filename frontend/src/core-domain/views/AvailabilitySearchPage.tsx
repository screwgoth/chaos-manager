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
  Avatar,
  Badge,
  Button,
  Card,
  DateRangePicker,
  EmptyState,
  ErrorState,
  HEAT_LEGEND,
  LoadingState,
  PageHeader,
  Select,
  Toolbar,
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
      <PageHeader
        title="Availability"
        subtitle="Who has room, and when."
        actions={<HeatLegend />}
      />

      <Toolbar>
        {/* Skill first: it is the question people arrive with. */}
        <div className="grid w-full gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="skill" className="label-micro mb-1 block">
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
            <label htmlFor="orgUnit" className="label-micro mb-1 block">
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
            <label htmlFor="minAvailable" className="label-micro mb-1 block">
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

        <div className="w-full">
          <DateRangePicker
            value={range}
            onChange={setRange}
            presets={['nextMonth', 'thisMonth', 'thisQuarter', 'nextQuarter']}
            testId="availability-range"
          />
        </div>
      </Toolbar>

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
            <li key={row.member.id}>
              <Card testId={`availability-${row.member.id}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={row.member.fullName} id={row.member.id} size={30} />
                  <Link
                    to={`/members/${row.member.id}`}
                    className="truncate text-[13.5px] font-medium text-ink hover:text-brand-600 hover:underline"
                  >
                    {row.member.fullName}
                  </Link>
                </div>

                <div className="flex items-baseline gap-4 text-[13px] tabular-nums">
                  <span className={row.minAvailablePercentage < 0 ? 'font-semibold text-allocation-over' : 'text-ink-muted'}>
                    <span className="label-micro mr-1">least free</span>
                    {formatPercentage(row.minAvailablePercentage)}
                  </span>
                  <span className="text-ink">
                    <span className="label-micro mr-1">most free</span>
                    {formatPercentage(row.maxAvailablePercentage)}
                  </span>
                  {row.isOverAllocated ? (
                    <Badge tone="danger">Over capacity</Badge>
                  ) : row.isFullyAllocated ? (
                    <Badge tone="brand">Fully booked</Badge>
                  ) : null}
                </div>
              </div>

              {/* The strip shows WHEN the capacity is, which the two numbers cannot. */}
              <AllocationSegmentStrip
                segments={row.segments}
                range={range}
                testId={`strip-${row.member.id}`}
              />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The heat legend.
 *
 * A colour-coded strip is undecodable without this, and it belongs beside the data rather than in
 * documentation nobody opens. Five swatches is small enough to sit in the page header.
 */
function HeatLegend(): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {HEAT_LEGEND.map((step) => (
        <span key={step.label} className="flex items-center gap-1.5 text-[11.5px] text-faded">
          <span aria-hidden="true" className={`h-[13px] w-[13px] rounded-[3px] ${step.className}`} />
          {step.label}
        </span>
      ))}
    </div>
  );
}
