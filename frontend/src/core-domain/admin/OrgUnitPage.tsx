/**
 * OrgUnitPage and OrgUnitTree — US-ADM-03.
 *
 * EXACTLY TWO LEVELS (BR-O-01): departments contain teams, and a team contains nothing. The tree
 * renders that shape literally rather than recursing, so the constraint is visible in the UI
 * instead of only being enforced on submit.
 *
 * Reparenting is not offered, because the server refuses it: moving a team between departments
 * would silently change who can see its members and the scope past allocations were computed
 * under. The form offers a rename, which is what an admin actually needs.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../shared/api/client';
import { invalidations } from '../../shared/api/queries';
import {
  Button,
  Dialog,
  ErrorState,
  Field,
  FieldErrors,
  FormErrors,
  LoadingState,
  Select,
  TextInput,
} from '../../shared/components';
import { useOrgUnitHierarchy } from '../../shared/hooks/lookups';
import type { OrgUnit, OrgUnitNode, RemoveOrgUnitResult } from '../../shared/api/types';

export function OrgUnitPage(): JSX.Element {
  const client = useQueryClient();
  const { data: tree, isLoading, error, refetch } = useOrgUnitHierarchy(true);

  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [blocked, setBlocked] = useState<{ unit: OrgUnit; result: RemoveOrgUnitResult } | null>(null);

  const create = useMutation({
    mutationFn: (body: { name: string; parentOrgUnitId: string | null }) =>
      api.post<OrgUnit>('/api/org-units', body),
    onSuccess: () => {
      setName('');
      setParentId('');
      invalidations.orgUnit(client);
    },
  });

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post<OrgUnit>(`/api/org-units/${id}/${active ? 'reactivate' : 'deactivate'}`),
    onSuccess: () => invalidations.orgUnit(client),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<RemoveOrgUnitResult>(`/api/org-units/${id}`),
    onSuccess: () => invalidations.orgUnit(client),
  });

  const createError = create.error instanceof ApiError ? create.error : null;

  async function attemptRemove(unit: OrgUnit): Promise<void> {
    const result = await remove.mutateAsync(unit.id);
    if (!result.removed) setBlocked({ unit, result });
  }

  const departments = (tree ?? []).map((node) => node.orgUnit);

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Org units</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Departments contain teams. Two levels, no deeper.
        </p>
      </div>

      <form
        className="mb-6 rounded border border-slate-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void create
            .mutateAsync({
              name: name.trim(),
              parentOrgUnitId: parentId === '' ? null : parentId,
            })
            .catch(() => {
              // Rendered from createError.
            });
        }}
      >
        <FormErrors error={createError} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="orgUnitName" required>
            <TextInput
              id="orgUnitName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="org-unit-name"
            />
            <FieldErrors error={createError} field="name" />
          </Field>

          <Field
            label="Sits inside"
            htmlFor="parentOrgUnitId"
            hint="Leave empty to create a department."
          >
            <Select
              id="parentOrgUnitId"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              data-testid="org-unit-parent"
            >
              <option value="">Nothing — this is a department</option>
              {/* Only DEPARTMENTS are offered as parents, so the two-level rule is visible
                  before submit rather than only enforced afterwards. */}
              {departments.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
            <FieldErrors error={createError} field="parentOrgUnitId" />
          </Field>
        </div>

        <Button type="submit" disabled={create.isPending} data-testid="add-org-unit">
          {create.isPending ? 'Adding…' : 'Add org unit'}
        </Button>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <OrgUnitTree
          nodes={tree ?? []}
          onDeactivate={(unit) => void setActive.mutateAsync({ id: unit.id, active: false })}
          onReactivate={(unit) => void setActive.mutateAsync({ id: unit.id, active: true })}
          onRemove={(unit) => void attemptRemove(unit)}
        />
      )}

      {blocked ? (
        <Dialog
          title={`“${blocked.unit.name}” is still in use`}
          onClose={() => setBlocked(null)}
          testId="org-unit-blocked-dialog"
          footer={
            <>
              <Button variant="secondary" onClick={() => setBlocked(null)}>
                Leave it alone
              </Button>
              <Button
                onClick={() => {
                  void setActive.mutateAsync({ id: blocked.unit.id, active: false });
                  setBlocked(null);
                }}
                data-testid="confirm-deactivate-org-unit"
              >
                Deactivate it instead
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">It cannot be deleted while these point at it:</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li>{blocked.result.blockedBy?.memberCount ?? 0} people</li>
            <li>{blocked.result.blockedBy?.projectCount ?? 0} projects</li>
            <li>{blocked.result.blockedBy?.childOrgUnitCount ?? 0} teams inside it</li>
          </ul>
          <p className="mt-2 text-sm text-slate-600">
            Move them elsewhere first, or deactivate the unit so it stops appearing in new
            selections.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}

function OrgUnitTree({
  nodes,
  onDeactivate,
  onReactivate,
  onRemove,
}: {
  nodes: OrgUnitNode[];
  onDeactivate: (unit: OrgUnit) => void;
  onReactivate: (unit: OrgUnit) => void;
  onRemove: (unit: OrgUnit) => void;
}): JSX.Element {
  if (nodes.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 px-6 py-8 text-center text-sm text-slate-600">
        No org units yet. Add a department above to begin.
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="org-unit-tree">
      {nodes.map((node) => (
        <li
          key={node.orgUnit.id}
          className="rounded border border-slate-200 bg-white p-4"
          data-testid={`org-unit-${node.orgUnit.id}`}
        >
          <OrgUnitRow
            unit={node.orgUnit}
            kind="Department"
            onDeactivate={onDeactivate}
            onReactivate={onReactivate}
            onRemove={onRemove}
          />

          {/* Depth stops here, always: a team cannot parent another unit (BR-O-01). */}
          {node.children.length > 0 ? (
            <ul className="mt-3 space-y-2 border-l border-slate-200 pl-4">
              {node.children.map((child) => (
                <li key={child.orgUnit.id} data-testid={`org-unit-${child.orgUnit.id}`}>
                  <OrgUnitRow
                    unit={child.orgUnit}
                    kind="Team"
                    onDeactivate={onDeactivate}
                    onReactivate={onReactivate}
                    onRemove={onRemove}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 pl-4 text-xs text-slate-400">No teams inside it yet.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function OrgUnitRow({
  unit,
  kind,
  onDeactivate,
  onReactivate,
  onRemove,
}: {
  unit: OrgUnit;
  kind: 'Department' | 'Team';
  onDeactivate: (unit: OrgUnit) => void;
  onReactivate: (unit: OrgUnit) => void;
  onRemove: (unit: OrgUnit) => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <span className={unit.isActive ? 'font-medium text-slate-900' : 'text-slate-500'}>
          {unit.name}
        </span>
        <span className="ml-2 text-xs uppercase tracking-wide text-slate-400">{kind}</span>
        {!unit.isActive ? (
          <span className="ml-2 text-xs font-medium text-slate-500">Deactivated</span>
        ) : null}
      </div>

      <div className="flex gap-2">
        {unit.isActive ? (
          <Button variant="secondary" onClick={() => onDeactivate(unit)}>
            Deactivate
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => onReactivate(unit)}>
            Reactivate
          </Button>
        )}
        <Button variant="ghost" onClick={() => onRemove(unit)}>
          Delete
        </Button>
      </div>
    </div>
  );
}
