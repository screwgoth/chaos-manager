/**
 * MemberFormPage, ContractFieldset, SkillTagEditor — US-MEM-01, 02, 03, 07.
 *
 * ON REJECTION, ENTERED VALUES ARE RETAINED (US-MEM-07's criterion). The form holds its own
 * state and never resets on error, so a user who mistyped one field does not re-type the other
 * nine. The server's `violations` array is authoritative and is placed field by field.
 *
 * BR-M-09: there is NO rate, contract value, or purchase-order field here. Adding one is a
 * requirements decision, not a form tweak.
 */

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
  TextInput,
} from '../../shared/components';
import { useOrgUnits, useReferenceData } from '../../shared/hooks/lookups';
import type { EmploymentType } from '../../shared/api/types';
import { useMember, useSaveMember } from './api';

interface FormState {
  fullName: string;
  email: string;
  orgUnitId: string;
  employmentType: EmploymentType;
  roleId: string;
  externalRef: string;
  skillIds: string[];
  vendorName: string;
  contractStartDate: string;
  contractEndDate: string;
  contractStatus: string;
}

const blank: FormState = {
  fullName: '',
  email: '',
  orgUnitId: '',
  employmentType: 'ON_ROLL',
  roleId: '',
  externalRef: '',
  skillIds: [],
  vendorName: '',
  contractStartDate: '',
  contractEndDate: '',
  contractStatus: 'ACTIVE',
};

export function MemberFormPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editing = id !== undefined;

  const { data: existing, isLoading } = useMember(id);
  const save = useSaveMember(id);

  const [form, setForm] = useState<FormState>(blank);
  const [loaded, setLoaded] = useState(!editing);

  const { data: orgUnits } = useOrgUnits(false);
  const { data: roles } = useReferenceData('ROLE', false);

  useEffect(() => {
    if (!existing || loaded) return;
    setForm({
      fullName: existing.fullName,
      email: existing.email,
      orgUnitId: existing.orgUnitId,
      employmentType: existing.employmentType,
      roleId: existing.roleId,
      externalRef: existing.externalRef ?? '',
      skillIds: existing.skillIds,
      // BR-M-10: a retained contract is shown even for an ON_ROLL member, because converting
      // back and forth must not destroy the record of who they were engaged through.
      vendorName: existing.contract?.vendorName ?? '',
      contractStartDate: existing.contract?.startDate ?? '',
      contractEndDate: existing.contract?.endDate ?? '',
      contractStatus: existing.contract?.status ?? 'ACTIVE',
    });
    setLoaded(true);
  }, [existing, loaded]);

  const error = save.error instanceof ApiError ? save.error : null;

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    const payload = {
      fullName: form.fullName,
      email: form.email,
      orgUnitId: form.orgUnitId,
      employmentType: form.employmentType,
      roleId: form.roleId,
      externalRef: form.externalRef.trim() === '' ? null : form.externalRef.trim(),
      skillIds: form.skillIds,
      contract:
        form.employmentType === 'OFF_ROLL'
          ? {
              vendorName: form.vendorName,
              startDate: form.contractStartDate,
              endDate: form.contractEndDate,
              status: form.contractStatus,
            }
          : // Sending the retained contract on an ON_ROLL save would re-validate old data
            // (BR-M-10 keeps it server-side without the client resubmitting it).
            undefined,
    };

    try {
      const member = await save.mutateAsync(payload);
      navigate(`/members/${member.id}`);
    } catch {
      // Handled by rendering `error`; the form keeps every entered value.
    }
  }

  if (editing && isLoading) return <LoadingState />;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-5 text-[19px] font-semibold leading-tight text-ink">
        {editing ? 'Edit person' : 'Add person'}
      </h1>

      <form onSubmit={onSubmit} noValidate className="rounded-card bg-white shadow-card p-6">
        <FormErrors error={error} />

        <Field label="Full name" htmlFor="fullName" required>
          <TextInput
            id="fullName"
            data-testid="fullName"
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
          <FieldErrors error={error} field="fullName" />
        </Field>

        <Field label="Email" htmlFor="email" required>
          <TextInput
            id="email"
            data-testid="email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <FieldErrors error={error} field="email" />
        </Field>

        <Field label="Org unit" htmlFor="orgUnitId" required>
          <Select
            id="orgUnitId"
            data-testid="orgUnitId"
            value={form.orgUnitId}
            onChange={(event) => setForm({ ...form, orgUnitId: event.target.value })}
          >
            <option value="">Choose an org unit</option>
            {(orgUnits ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
          <FieldErrors error={error} field="orgUnitId" />
        </Field>

        <Field label="Role" htmlFor="roleId" required hint="Roles are managed under Lists.">
          <Select
            id="roleId"
            data-testid="roleId"
            value={form.roleId}
            onChange={(event) => setForm({ ...form, roleId: event.target.value })}
          >
            <option value="">Choose a role</option>
            {(roles ?? []).map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
          <FieldErrors error={error} field="roleId" />
        </Field>

        <Field label="Employee ID" htmlFor="externalRef" hint="Optional. Used to match rows on import.">
          <TextInput
            id="externalRef"
            value={form.externalRef}
            onChange={(event) => setForm({ ...form, externalRef: event.target.value })}
          />
          <FieldErrors error={error} field="externalRef" />
        </Field>

        <Field label="Engagement" htmlFor="employmentType" required>
          <Select
            id="employmentType"
            data-testid="employmentType"
            value={form.employmentType}
            onChange={(event) =>
              setForm({ ...form, employmentType: event.target.value as EmploymentType })
            }
          >
            <option value="ON_ROLL">On roll</option>
            <option value="OFF_ROLL">Off roll (contractor)</option>
          </Select>
        </Field>

        {/* BR-M-06/07: contract fields appear only for OFF_ROLL. */}
        {form.employmentType === 'OFF_ROLL' ? (
          <ContractFieldset form={form} setForm={setForm} error={error} />
        ) : null}

        <SkillTagEditor
          selected={form.skillIds}
          onChange={(skillIds) => setForm({ ...form, skillIds })}
          error={error}
        />

        <div className="mt-6 flex gap-2">
          <Button type="submit" disabled={save.isPending} data-testid="save-member">
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add person'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * ContractFieldset — BR-M-06.
 *
 * Vendor, start, end, status. NOTHING ELSE. No rate, no contract value, no PO number: Phase 1
 * stores no contractor commercial data at all (BR-M-09, CQ1:A).
 */
function ContractFieldset({
  form,
  setForm,
  error,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  error: ApiError | null;
}): JSX.Element {
  return (
    <fieldset
      className="mb-4 rounded-card border border-line bg-canvas p-4"
      data-testid="contract-fieldset"
    >
      <legend className="px-1 text-sm font-medium text-ink">Contract</legend>
      <p className="mb-3 text-xs text-faded">
        Required for off-roll people. Commercial terms are not held in C.H.A.O.S.
      </p>

      <Field label="Vendor" htmlFor="vendorName" required>
        <TextInput
          id="vendorName"
          data-testid="vendorName"
          value={form.vendorName}
          onChange={(event) => setForm({ ...form, vendorName: event.target.value })}
        />
        <FieldErrors error={error} field="contract.vendorName" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contract starts" htmlFor="contractStartDate" required>
          <TextInput
            id="contractStartDate"
            data-testid="contractStartDate"
            type="date"
            value={form.contractStartDate}
            onChange={(event) => setForm({ ...form, contractStartDate: event.target.value })}
          />
          <FieldErrors error={error} field="contract.startDate" />
        </Field>

        <Field label="Contract ends" htmlFor="contractEndDate" required>
          <TextInput
            id="contractEndDate"
            data-testid="contractEndDate"
            type="date"
            value={form.contractEndDate}
            onChange={(event) => setForm({ ...form, contractEndDate: event.target.value })}
          />
          <FieldErrors error={error} field="contract.endDate" />
        </Field>
      </div>

      <Field label="Contract status" htmlFor="contractStatus" required>
        <Select
          id="contractStatus"
          value={form.contractStatus}
          onChange={(event) => setForm({ ...form, contractStatus: event.target.value })}
        >
          <option value="ACTIVE">Active</option>
          <option value="PENDING">Pending</option>
          <option value="EXPIRED">Expired</option>
        </Select>
        <FieldErrors error={error} field="contract.status" />
      </Field>
      <FieldErrors error={error} field="contract" />
    </fieldset>
  );
}

/**
 * SkillTagEditor — BR-M-11.
 *
 * Offers only existing ACTIVE skills. Free text is not accepted: silently creating a skill from
 * a typo corrupts the list for everyone, so an unrecognised entry gets a message pointing at
 * the admin screen instead.
 */
function SkillTagEditor({
  selected,
  onChange,
  error,
}: {
  selected: string[];
  onChange: (skillIds: string[]) => void;
  error: ApiError | null;
}): JSX.Element {
  const { data: skills } = useReferenceData('SKILL', false);
  const [typed, setTyped] = useState('');

  const available = (skills ?? []).filter((skill) => !selected.includes(skill.id));
  const unmatched =
    typed.trim() !== '' &&
    !(skills ?? []).some((skill) => skill.name.toLowerCase() === typed.trim().toLowerCase());

  return (
    <Field label="Skills" hint="Chosen from the managed skill list.">
      <div className="mb-2 flex flex-wrap gap-2" data-testid="skill-tags">
        {selected.length === 0 ? (
          <span className="text-sm text-faded">None yet.</span>
        ) : (
          selected.map((skillId) => {
            const skill = skills?.find((entry) => entry.id === skillId);
            return (
              <span
                key={skillId}
                className="inline-flex items-center gap-1 rounded-full bg-line-soft px-2.5 py-1 text-xs text-ink"
                data-testid={`skill-tag-${skillId}`}
              >
                {skill?.name ?? skillId}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((id) => id !== skillId))}
                  className="text-faded hover:text-allocation-over"
                  aria-label={`Remove ${skill?.name ?? 'skill'}`}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>

      <div className="flex gap-2">
        <TextInput
          placeholder="Type to find a skill"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          data-testid="skill-search"
          list="skill-options"
        />
        <datalist id="skill-options">
          {available.map((skill) => (
            <option key={skill.id} value={skill.name} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const match = (skills ?? []).find(
              (skill) => skill.name.toLowerCase() === typed.trim().toLowerCase(),
            );
            if (match) {
              onChange([...selected, match.id]);
              setTyped('');
            }
          }}
        >
          Add
        </Button>
      </div>

      {unmatched ? (
        <p className="mt-1 text-xs text-allocation-full" data-testid="skill-not-found">
          Not in the skill list — ask an admin to add it.
        </p>
      ) : null}

      <FieldErrors error={error} field="skillIds" />
    </Field>
  );
}
