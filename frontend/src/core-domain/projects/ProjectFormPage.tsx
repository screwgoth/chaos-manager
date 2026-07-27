/** ProjectForm — US-PRJ-01, US-PRJ-05. Same retain-on-rejection behaviour as the member form. */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import {
  Button,
  Field,
  FieldErrors,
  FormErrors,
  LoadingState,
  Select,
  TextArea,
  TextInput,
} from '../../shared/components';
import { useOrgUnits, useReferenceData } from '../../shared/hooks/lookups';
import { useProject, useSaveProject } from './api';

interface FormState {
  code: string;
  name: string;
  description: string;
  owningOrgUnitId: string;
  projectTypeId: string;
  startDate: string;
  plannedEndDate: string;
}

const blank: FormState = {
  code: '',
  name: '',
  description: '',
  owningOrgUnitId: '',
  projectTypeId: '',
  startDate: '',
  plannedEndDate: '',
};

export function ProjectFormPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editing = id !== undefined;

  const { data: existing, isLoading } = useProject(id);
  const save = useSaveProject(id);
  const { data: orgUnits } = useOrgUnits(false);
  const { data: types } = useReferenceData('PROJECT_TYPE', false);

  const [form, setForm] = useState<FormState>(blank);
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    if (!existing || loaded) return;
    setForm({
      code: existing.code,
      name: existing.name,
      description: existing.description ?? '',
      owningOrgUnitId: existing.owningOrgUnitId,
      projectTypeId: existing.projectTypeId,
      startDate: existing.startDate,
      plannedEndDate: existing.plannedEndDate,
    });
    setLoaded(true);
  }, [existing, loaded]);

  const error = save.error instanceof ApiError ? save.error : null;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-5 text-[19px] font-semibold leading-tight text-ink">
        {editing ? 'Edit project' : 'Add project'}
      </h1>

      {editing && isLoading ? (
        <LoadingState />
      ) : (
        <form
          noValidate
          className="rounded-card bg-white shadow-card p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const project = await save.mutateAsync({
                ...form,
                description: form.description.trim() === '' ? null : form.description.trim(),
              });
              navigate(`/projects/${project.id}`);
            } catch {
              // Rendered from `error`; entered values are kept.
            }
          }}
        >
          <FormErrors error={error} />

          <Field label="Project code" htmlFor="code" required hint="Used to match rows on import.">
            <TextInput
              id="code"
              data-testid="code"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
            <FieldErrors error={error} field="code" />
          </Field>

          <Field label="Name" htmlFor="name" required>
            <TextInput
              id="name"
              data-testid="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <FieldErrors error={error} field="name" />
          </Field>

          <Field label="Description" htmlFor="description">
            <TextArea
              id="description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <FieldErrors error={error} field="description" />
          </Field>

          <Field label="Owned by" htmlFor="owningOrgUnitId" required>
            <Select
              id="owningOrgUnitId"
              data-testid="owningOrgUnitId"
              value={form.owningOrgUnitId}
              onChange={(event) => setForm({ ...form, owningOrgUnitId: event.target.value })}
            >
              <option value="">Choose an org unit</option>
              {(orgUnits ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
            <FieldErrors error={error} field="owningOrgUnitId" />
          </Field>

          <Field label="Type" htmlFor="projectTypeId" required hint="Types are managed under Lists.">
            <Select
              id="projectTypeId"
              data-testid="projectTypeId"
              value={form.projectTypeId}
              onChange={(event) => setForm({ ...form, projectTypeId: event.target.value })}
            >
              <option value="">Choose a type</option>
              {(types ?? []).map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
            <FieldErrors error={error} field="projectTypeId" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" htmlFor="startDate" required>
              <TextInput
                id="startDate"
                data-testid="startDate"
                type="date"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
              <FieldErrors error={error} field="startDate" />
            </Field>

            <Field label="Planned end (included)" htmlFor="plannedEndDate" required>
              <TextInput
                id="plannedEndDate"
                data-testid="plannedEndDate"
                type="date"
                value={form.plannedEndDate}
                onChange={(event) => setForm({ ...form, plannedEndDate: event.target.value })}
              />
              <FieldErrors error={error} field="plannedEndDate" />
            </Field>
          </div>

          <div className="mt-6 flex gap-2">
            <Button type="submit" disabled={save.isPending} data-testid="save-project">
              {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add project'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
