/** ProjectListPage — US-PRJ-03. */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  DataTable,
  ErrorState,
  Select,
  TextInput,
  type Column,
} from '../../shared/components';
import { useOrgUnitResolver, useOrgUnits, useReferenceData } from '../../shared/hooks/lookups';
import { useCanWrite } from '../../shared/session/SessionProvider';
import type { ProjectSummary } from '../../shared/api/types';
import { emptyProjectFilters, useProjects, type ProjectFilters } from './api';

export function ProjectListPage(): JSX.Element {
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const [applied, setApplied] = useState<ProjectFilters>(emptyProjectFilters);
  const [draft, setDraft] = useState<ProjectFilters>(emptyProjectFilters);

  const { data, isLoading, error, refetch } = useProjects(applied);
  const { data: orgUnits } = useOrgUnits(false);
  const { data: types } = useReferenceData('PROJECT_TYPE', false);
  const orgUnitName = useOrgUnitResolver();

  const columns: Column<ProjectSummary>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (project) => <span className="tabular-nums text-ink-muted">{project.code}</span>,
    },
    {
      key: 'name',
      header: 'Project',
      render: (project) => (
        <Link
          to={`/projects/${project.id}`}
          className="font-medium text-ink hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {project.name}
        </Link>
      ),
    },
    {
      key: 'orgUnit',
      header: 'Owned by',
      render: (project) => orgUnitName(project.owningOrgUnitId),
    },
    {
      key: 'status',
      header: 'Status',
      render: (project) =>
        project.status === 'ACTIVE' ? (
          <span className="text-xs text-ink-muted">Active</span>
        ) : (
          <span className="text-xs font-medium text-faded">Closed</span>
        ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[19px] font-semibold leading-tight text-ink">Projects</h1>
          <p className="mt-0.5 text-sm text-faded">Work people can be assigned to.</p>
        </div>
        {canWrite ? (
          <Button onClick={() => navigate('/projects/new')} data-testid="add-project">
            Add project
          </Button>
        ) : null}
      </div>

      <form
        className="mb-4 rounded-card bg-white shadow-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({ ...draft, offset: 0 });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput
            placeholder="Name or code"
            aria-label="Search projects"
            value={draft.search}
            onChange={(event) => setDraft({ ...draft, search: event.target.value })}
            data-testid="filter-project-search"
          />
          <Select
            aria-label="Owning org unit"
            value={draft.orgUnitIds[0] ?? ''}
            onChange={(event) =>
              setDraft({
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
            aria-label="Project type"
            value={draft.projectTypeId}
            onChange={(event) => setDraft({ ...draft, projectTypeId: event.target.value })}
          >
            <option value="">All types</option>
            {(types ?? []).map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Status"
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as ProjectFilters['status'] })
            }
          >
            <option value="ACTIVE">Active</option>
            <option value="CLOSED">Closed</option>
            <option value="">Both</option>
          </Select>
        </div>
        <div className="mt-3 flex gap-2">
          <Button type="submit">Apply</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft(emptyProjectFilters);
              setApplied(emptyProjectFilters);
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(project) => project.id}
          loading={isLoading}
          onRowClick={(project) => navigate(`/projects/${project.id}`)}
          emptyMessage="No projects match these filters."
          emptyHint="Clear the filters to see everything in your scope."
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
          testId="project-table"
        />
      )}
    </div>
  );
}
