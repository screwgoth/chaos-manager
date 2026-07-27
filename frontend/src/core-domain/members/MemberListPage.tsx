/**
 * MemberListPage and MemberFilterBar — US-MEM-04.
 *
 * The filter draft is LOCAL and applied on submit, not on every keystroke. Filtering as you
 * type would fire a request per character against a scoped, joined query — and the user's
 * intent is not knowable until they finish typing a name.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AllocationBar,
  Avatar,
  Badge,
  Button,
  DataTable,
  ErrorState,
  Select,
  TextInput,
  type Column,
} from '../../shared/components';
import { useNameResolver, useOrgUnitResolver, useOrgUnits, useReferenceData, today } from '../../shared/hooks/lookups';
import { useCanWrite } from '../../shared/session/SessionProvider';
import type { MemberAllocationRow, MemberSummary } from '../../shared/api/types';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../../shared/api/client';
import { queryKeys } from '../../shared/api/queries';
import { emptyFilters, useMembers, type MemberFilters } from './api';

/** Today's allocation for the members on screen, so the list answers "how booked?" at a glance. */
function useAllocationLookup(): (memberId: string) => MemberAllocationRow | undefined {
  const asOf = today();
  const { data } = useQuery({
    queryKey: queryKeys.allocations({ asOf, forList: true }),
    queryFn: () =>
      api.get<{ items: MemberAllocationRow[] }>(
        `/api/allocations/current${query({ asOf, limit: 200 })}`,
      ),
    select: (response) => response.items,
  });

  return (memberId: string) => data?.find((row) => row.member.id === memberId);
}

export function MemberListPage(): JSX.Element {
  const navigate = useNavigate();
  const canWrite = useCanWrite();

  const [applied, setApplied] = useState<MemberFilters>(emptyFilters);
  const [draft, setDraft] = useState<MemberFilters>(emptyFilters);

  const { data, isLoading, error, refetch } = useMembers(applied);
  const roleName = useNameResolver('ROLE');
  const orgUnitName = useOrgUnitResolver();
  const allocationFor = useAllocationLookup();

  const columns: Column<MemberSummary>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (member) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={member.fullName} id={member.id} size={32} />
          <div className="min-w-0">
            <Link
              to={`/members/${member.id}`}
              className="block truncate font-medium text-ink hover:text-brand-600 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {member.fullName}
            </Link>
            <div className="truncate text-[11.5px] text-faded">{member.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'orgUnit', header: 'Org unit', render: (member) => orgUnitName(member.orgUnitId) },
    { key: 'role', header: 'Role', render: (member) => roleName(member.roleId) },
    {
      key: 'employment',
      header: 'Engagement',
      render: (member) => (
        <Badge tone={member.employmentType === 'ON_ROLL' ? 'brand' : 'neutral'}>
          {member.employmentType === 'ON_ROLL' ? 'On roll' : 'Off roll'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (member) =>
        member.status === 'ACTIVE' ? (
          <span className="text-xs text-ink-muted">Active</span>
        ) : (
          <span className="text-xs font-medium text-faded">Deactivated</span>
        ),
    },
    {
      key: 'allocation',
      header: 'Booked today',
      render: (member) => {
        const row = allocationFor(member.id);
        if (!row) return <span className="text-xs text-faded-soft">—</span>;
        return (
          <AllocationBar
            totalPercentage={row.totalPercentage}
            availablePercentage={row.availablePercentage}
            testId={`allocation-${member.id}`}
          />
        );
      },
      className: 'w-64',
    },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[19px] font-semibold leading-tight text-ink">People</h1>
          <p className="mt-0.5 text-sm text-faded">
            Everyone in your scope, on roll and off roll.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={() => navigate('/members/new')} data-testid="add-member">
            Add person
          </Button>
        ) : null}
      </div>

      <MemberFilterBar
        draft={draft}
        onDraftChange={setDraft}
        onApply={() => setApplied({ ...draft, offset: 0 })}
        onClear={() => {
          setDraft(emptyFilters);
          setApplied(emptyFilters);
        }}
      />

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(member) => member.id}
          loading={isLoading}
          onRowClick={(member) => navigate(`/members/${member.id}`)}
          emptyMessage="No one matches these filters."
          emptyHint="Widen the filters, or clear them to see everyone in your scope."
          pagination={
            data
              ? {
                  total: data.total,
                  offset: data.offset,
                  limit: data.limit,
                  onOffsetChange: (offset) => setApplied({ ...applied, offset }),
                }
              : undefined
          }
          testId="member-table"
        />
      )}
    </div>
  );
}

function MemberFilterBar({
  draft,
  onDraftChange,
  onApply,
  onClear,
}: {
  draft: MemberFilters;
  onDraftChange: (filters: MemberFilters) => void;
  onApply: () => void;
  onClear: () => void;
}): JSX.Element {
  const { data: orgUnits } = useOrgUnits(false);
  const { data: roles } = useReferenceData('ROLE', false);
  const { data: skills } = useReferenceData('SKILL', false);

  return (
    <form
      className="mb-4 rounded-card bg-white shadow-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
      data-testid="member-filter-bar"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TextInput
          placeholder="Name or email"
          aria-label="Search by name or email"
          value={draft.search}
          onChange={(event) => onDraftChange({ ...draft, search: event.target.value })}
          data-testid="filter-search"
        />

        <Select
          aria-label="Org unit"
          value={draft.orgUnitIds[0] ?? ''}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              orgUnitIds: event.target.value === '' ? [] : [event.target.value],
            })
          }
        >
          <option value="">All org units</option>
          {(orgUnits ?? []).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Role"
          value={draft.roleId}
          onChange={(event) => onDraftChange({ ...draft, roleId: event.target.value })}
        >
          <option value="">All roles</option>
          {(roles ?? []).map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>

        {/* Skill is prominent because "who knows X and is free?" is the core resourcing question. */}
        <Select
          aria-label="Skill"
          value={draft.skillIds[0] ?? ''}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              skillIds: event.target.value === '' ? [] : [event.target.value],
            })
          }
          data-testid="filter-skill"
        >
          <option value="">Any skill</option>
          {(skills ?? []).map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.name}
            </option>
          ))}
        </Select>

        <div className="flex gap-2">
          <Select
            aria-label="Status"
            value={draft.status}
            onChange={(event) =>
              onDraftChange({ ...draft, status: event.target.value as MemberFilters['status'] })
            }
            className="flex-1"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Deactivated</option>
            <option value="">Both</option>
          </Select>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button type="submit" data-testid="apply-filters">
          Apply
        </Button>
        <Button type="button" variant="secondary" onClick={onClear}>
          Clear
        </Button>
      </div>
    </form>
  );
}
