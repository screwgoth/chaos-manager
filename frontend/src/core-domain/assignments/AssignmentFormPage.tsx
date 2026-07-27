/**
 * AssignmentFormPage — US-ASN-01, 03, 05, 06.
 *
 * THE TWO-STEP FLOW, from the UI's side:
 *   1. Submit. If the server returns `requiresOverrideConfirmation`, NOTHING was saved — show
 *      the blocking dialog with the offending sub-periods.
 *   2. The user either goes back (nothing persists, BR-A-10) or confirms, which re-submits the
 *      SAME payload with `overrideOverAllocation: true`.
 *
 * Re-submitting rather than holding a token means the capacity check runs again against current
 * data, inside the member lock — so what the user confirmed is what the database sees.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import {
  Button,
  Field,
  FieldErrors,
  FormErrors,
  LoadingState,
  PercentageInput,
  Select,
  TextInput,
} from '../../shared/components';
import { useReferenceData, today } from '../../shared/hooks/lookups';
import type { AssignmentWriteResult } from '../../shared/api/types';
import { useMembers } from '../members/api';
import { useOpenProjects } from '../projects/api';
import { AssignmentConflictNotice, OverAllocationDialog } from './OverAllocationDialog';
import { useAssignment, useSaveAssignment, type AssignmentPayload } from './api';

export function AssignmentFormPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editing = id !== undefined;

  const { data: existing, isLoading } = useAssignment(id);
  const save = useSaveAssignment(id);

  const { data: memberPage } = useMembers({
    search: '',
    orgUnitIds: [],
    employmentType: '',
    status: 'ACTIVE',
    skillIds: [],
    roleId: '',
    offset: 0,
    limit: 200,
  });
  const { data: projects } = useOpenProjects(today());
  const { data: projectRoles } = useReferenceData('ROLE', false);

  const [memberId, setMemberId] = useState(searchParams.get('memberId') ?? '');
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '');
  const [percentage, setPercentage] = useState<number | ''>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [projectRoleId, setProjectRoleId] = useState('');
  const [loaded, setLoaded] = useState(!editing);

  /** Held so "Save anyway" can re-submit exactly what was rejected. */
  const [pendingWarning, setPendingWarning] = useState<AssignmentWriteResult | null>(null);
  const [conflicts, setConflicts] = useState<AssignmentWriteResult['conflicts']>([]);

  useEffect(() => {
    if (!existing || loaded) return;
    setMemberId(existing.memberId);
    setProjectId(existing.projectId);
    setPercentage(existing.allocationTenths / 10);
    setStart(existing.startDate);
    setEnd(existing.endDate);
    setProjectRoleId(existing.projectRoleId ?? '');
    setLoaded(true);
  }, [existing, loaded]);

  const error = save.error instanceof ApiError ? save.error : null;
  const memberName =
    memberPage?.items.find((member) => member.id === memberId)?.fullName ?? 'This person';

  function payload(): AssignmentPayload {
    return {
      memberId,
      projectId,
      allocationPercentage: percentage === '' ? 0 : percentage,
      period: { start, end },
      projectRoleId: projectRoleId === '' ? null : projectRoleId,
    };
  }

  async function submit(override: boolean): Promise<void> {
    const result = await save.mutateAsync({ payload: payload(), override });
    setConflicts(result.conflicts);

    // Step one raised a warning: nothing was written.
    if (result.requiresOverrideConfirmation) {
      setPendingWarning(result);
      return;
    }

    setPendingWarning(null);
    if (result.assignment) navigate(`/members/${result.assignment.memberId}`);
  }

  if (editing && isLoading) return <LoadingState />;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-5 text-[19px] font-semibold leading-tight text-ink">
        {editing ? 'Edit assignment' : 'Assign someone to a project'}
      </h1>

      <form
        noValidate
        className="rounded-card bg-white shadow-card p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false).catch(() => {
            // Validation failures render from `error`; entered values are kept.
          });
        }}
      >
        <FormErrors error={error} />
        <AssignmentConflictNotice conflicts={conflicts} />

        <Field
          label="Person"
          htmlFor="memberId"
          required
          hint={editing ? 'Cannot be changed. End this assignment and create a new one instead.' : undefined}
        >
          <Select
            id="memberId"
            data-testid="memberId"
            value={memberId}
            disabled={editing}
            onChange={(event) => setMemberId(event.target.value)}
          >
            <option value="">Choose a person</option>
            {(memberPage?.items ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </Select>
          <FieldErrors error={error} field="memberId" />
        </Field>

        <Field
          label="Project"
          htmlFor="projectId"
          required
          hint={editing ? 'Cannot be changed.' : 'Only projects open on today’s date are listed.'}
        >
          <Select
            id="projectId"
            data-testid="projectId"
            value={projectId}
            disabled={editing}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">Choose a project</option>
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </Select>
          <FieldErrors error={error} field="projectId" />
        </Field>

        <Field label="Allocation" htmlFor="allocationPercentage" required hint="Between 0.1% and 100%, one decimal place.">
          <PercentageInput
            id="allocationPercentage"
            testId="allocationPercentage"
            value={percentage}
            onChange={setPercentage}
          />
          <FieldErrors error={error} field="allocationPercentage" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" htmlFor="start" required>
            <TextInput
              id="start"
              data-testid="start"
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <FieldErrors error={error} field="period.start" />
          </Field>

          <Field label="To (included)" htmlFor="end" required>
            <TextInput
              id="end"
              data-testid="end"
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
            <FieldErrors error={error} field="period.end" />
          </Field>
        </div>

        {/* BR-A-21: optional. An assignment without a project role is valid and complete. */}
        <Field label="Role on this project" htmlFor="projectRoleId" hint="Optional.">
          <Select
            id="projectRoleId"
            value={projectRoleId}
            onChange={(event) => setProjectRoleId(event.target.value)}
          >
            <option value="">Not specified</option>
            {(projectRoles ?? []).map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="mt-6 flex gap-2">
          <Button type="submit" disabled={save.isPending} data-testid="save-assignment">
            {save.isPending ? 'Checking…' : editing ? 'Save changes' : 'Assign'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>

      {pendingWarning ? (
        <OverAllocationDialog
          memberName={memberName}
          findings={pendingWarning.overAllocation}
          pending={save.isPending}
          onCancel={() => setPendingWarning(null)}
          onConfirm={() => {
            void submit(true).catch(() => {
              setPendingWarning(null);
            });
          }}
        />
      ) : null}
    </div>
  );
}
