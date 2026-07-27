/**
 * ReferenceDataPage and RetireReferenceDialog — US-ADM-01, US-ADM-02.
 *
 * ONE SCREEN FOR ALL THREE TYPES, because the behaviour is identical (BR-C-01) and three
 * near-identical screens would triplicate every rule.
 *
 * THE REFUSAL IS THE INTERESTING PART. BR-C-06 refuses deletion of a referenced entry and
 * reports the count; the dialog then offers DEACTIVATION as the alternative, which is what the
 * admin almost always wants. A bare "cannot delete" would leave them stuck.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import { invalidations } from '../../shared/api/queries';
import {
  Button,
  DataTable,
  Dialog,
  ErrorState,
  Select,
  TextInput,
  type Column,
} from '../../shared/components';
import { useReferenceData } from '../../shared/hooks/lookups';
import type { ReferenceDataEntry, ReferenceType, RemoveReferenceResult } from '../../shared/api/types';

const TYPE_LABELS: Record<ReferenceType, { plural: string; singular: string; hint: string }> = {
  ROLE: { plural: 'Roles', singular: 'role', hint: 'What someone does — used on every person.' },
  SKILL: { plural: 'Skills', singular: 'skill', hint: 'What someone can do — used to find people.' },
  PROJECT_TYPE: {
    plural: 'Project types',
    singular: 'project type',
    hint: 'How work is categorised.',
  },
};

export function ReferenceDataPage(): JSX.Element {
  const client = useQueryClient();
  const [type, setType] = useState<ReferenceType>('ROLE');
  const [newName, setNewName] = useState('');
  const [retiring, setRetiring] = useState<{ entry: ReferenceDataEntry; count: number } | null>(null);

  const { data, isLoading, error, refetch } = useReferenceData(type, true);

  const create = useMutation({
    mutationFn: (name: string) =>
      api.post<ReferenceDataEntry>('/api/reference-data', { referenceType: type, name }),
    onSuccess: () => {
      setNewName('');
      invalidations.referenceData(client, type);
    },
  });

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post<ReferenceDataEntry>(
        `/api/reference-data/${id}/${active ? 'reactivate' : 'deactivate'}`,
      ),
    onSuccess: () => invalidations.referenceData(client, type),
  });

  /** Attempts a hard delete; a refusal comes back as `removed: false` with the count. */
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<RemoveReferenceResult>(`/api/reference-data/${id}`),
    onSuccess: () => invalidations.referenceData(client, type),
  });

  async function attemptRemove(entry: ReferenceDataEntry): Promise<void> {
    const result = await remove.mutateAsync(entry.id);
    if (!result.removed) {
      // Refused — offer deactivation instead of leaving the admin at a dead end.
      setRetiring({ entry, count: result.blockedByReferenceCount ?? 0 });
    }
  }

  const columns: Column<ReferenceDataEntry>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (entry) => (
        <span className={entry.isActive ? 'text-ink' : 'text-faded'}>{entry.name}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (entry) =>
        entry.isActive ? (
          <span className="text-xs text-ink-muted">In use</span>
        ) : (
          <span className="text-xs font-medium text-faded">Retired</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (entry) => (
        <div className="flex justify-end gap-2">
          {entry.isActive ? (
            <Button
              variant="secondary"
              onClick={() => void setActive.mutateAsync({ id: entry.id, active: false })}
              data-testid={`retire-${entry.id}`}
            >
              Retire
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => void setActive.mutateAsync({ id: entry.id, active: true })}
              data-testid={`restore-${entry.id}`}
            >
              Bring back
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => void attemptRemove(entry)}
            data-testid={`delete-${entry.id}`}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h1 className="text-[19px] font-semibold leading-tight text-ink">Lists</h1>
        <p className="mt-0.5 text-sm text-faded">
          Roles, skills and project types. New entries are selectable immediately.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {(Object.keys(TYPE_LABELS) as ReferenceType[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setType(candidate)}
            className={
              candidate === type
                ? 'border-b-2 border-ink pb-1 text-sm font-medium text-ink'
                : 'pb-1 text-sm text-ink-muted hover:text-ink'
            }
            data-testid={`tab-${candidate}`}
          >
            {TYPE_LABELS[candidate].plural}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-faded">{TYPE_LABELS[type].hint}</p>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (newName.trim() !== '') void create.mutateAsync(newName.trim());
        }}
      >
        <TextInput
          placeholder={`Add a ${TYPE_LABELS[type].singular}`}
          aria-label={`New ${TYPE_LABELS[type].singular} name`}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          data-testid="new-reference-name"
        />
        <Button type="submit" disabled={create.isPending} data-testid="add-reference">
          Add
        </Button>
      </form>

      {create.error ? <ErrorState error={create.error} /> : null}

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(entry) => entry.id}
          loading={isLoading}
          emptyMessage={`No ${TYPE_LABELS[type].plural.toLowerCase()} yet.`}
          emptyHint="Add the first one above."
          testId="reference-table"
        />
      )}

      {retiring ? (
        <RetireReferenceDialog
          entry={retiring.entry}
          referenceCount={retiring.count}
          pending={setActive.isPending}
          onCancel={() => setRetiring(null)}
          onRetire={async () => {
            await setActive.mutateAsync({ id: retiring.entry.id, active: false });
            setRetiring(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * RetireReferenceDialog — shown when a DELETE was refused (BR-C-06).
 *
 * Explains why, and offers the thing that does work. BR-C-05 means retiring keeps existing
 * references intact and readable, which is exactly the reassurance an admin needs before
 * clicking.
 */
function RetireReferenceDialog({
  entry,
  referenceCount,
  pending,
  onRetire,
  onCancel,
}: {
  entry: ReferenceDataEntry;
  referenceCount: number;
  pending: boolean;
  onRetire: () => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  return (
    <Dialog
      title={`“${entry.name}” is still in use`}
      onClose={onCancel}
      testId="retire-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Leave it alone
          </Button>
          <Button onClick={() => void onRetire()} disabled={pending} data-testid="confirm-retire">
            {pending ? 'Retiring…' : 'Retire it instead'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink">
        {referenceCount} record{referenceCount === 1 ? '' : 's'} still reference it, so it cannot be
        deleted.
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Retiring it removes it from new selections while leaving those records untouched — they
        keep showing “{entry.name}”, and you can bring it back at any time.
      </p>
    </Dialog>
  );
}
