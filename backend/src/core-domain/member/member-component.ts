/**
 * C-01 MemberComponent — BR-M-01…18.
 *
 * BR-M-09 IS ENFORCED BY ABSENCE: there is no rate, contract value, or purchase-order
 * field anywhere in this file, in `MemberInput`, or in the member table. Phase 1 stores
 * no contractor commercial data at all. Adding such a field is a requirements decision,
 * not an implementation detail — do not add one here without revisiting CQ1:A.
 *
 * BR-M-16: capacity is fixed at 100.0% and there is no per-member capacity attribute.
 * `CAPACITY_TENTHS` in shared/util/tenths.ts is the single expression of it (AS-01).
 */

import {
  NotFoundError,
  ValidationError,
  ViolationCollector,
  type Violation,
} from '../../shared/errors';
import type { MemberRepository, OrgUnitRepository } from '../../shared/repository';
import type { ReferenceDataComponent } from '../reference-data/reference-data-component';
import type { ScopeFilter } from '../../shared/types/authorization';
import type {
  EmploymentType,
  IsoDate,
  Member,
  MemberId,
  MemberStatus,
  MemberSummary,
  OrgUnitId,
  Page,
  ReferenceId,
} from '../../shared/types/domain';
import { isValidRange, isIsoDate, today } from '../../shared/util/dates';

export interface ContractInput {
  vendorName: string;
  startDate: IsoDate;
  endDate: IsoDate;
  status: string;
}

export interface MemberInput {
  fullName: string;
  email: string;
  orgUnitId: OrgUnitId;
  employmentType: EmploymentType;
  roleId: ReferenceId;
  /** Natural key for import duplicate detection (BR-M-03). */
  externalRef: string | null;
  skillIds: ReferenceId[];
  /** Required when employmentType is OFF_ROLL (BR-M-06). */
  contract: ContractInput | null;
}

export interface MemberSearchCriteria {
  search: string | null;
  orgUnitIds: OrgUnitId[] | null;
  employmentType: EmploymentType | null;
  status: MemberStatus | null;
  skillIds: ReferenceId[] | null;
  roleId: ReferenceId | null;
  offset: number;
  limit: number;
}

/** BR-M-13: deactivation reports how many assignments were auto-ended. */
export interface DeactivateResult {
  member: Member;
  autoEndedAssignmentCount: number;
}

/**
 * The auto-end cascade, kept as a narrow collaborator interface.
 *
 * Member deactivation must end open assignments (BR-M-13) and each ending must write a
 * history revision in the same transaction (BR-A-16). Rather than reach into the
 * assignment tables directly — which would duplicate that invariant in a second place —
 * this component asks the assignment component to do it. The narrow interface also keeps
 * this component testable without constructing the whole assignment stack.
 */
export interface AssignmentAutoEnder {
  autoEndForMember(
    memberId: MemberId,
    effectiveDate: IsoDate,
    actorUserId: string | null,
  ): Promise<number>;
}

const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;

/** Deliberately permissive: this rejects obvious nonsense, not unusual-but-valid addresses. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class MemberComponent {
  constructor(
    private readonly members: MemberRepository,
    private readonly orgUnits: OrgUnitRepository,
    private readonly referenceData: ReferenceDataComponent,
    private readonly autoEnder: AssignmentAutoEnder,
  ) {}

  async getById(id: MemberId, scope: ScopeFilter): Promise<Member | null> {
    return this.members.findById(id, scope);
  }

  /**
   * BR-M-17: results never include members outside the caller's scope, whatever the
   * search term. The scope filter is applied inside the query by the repository, so no
   * search term can widen it.
   *
   * BR-M-18: a filter combination matching nothing returns an empty page, which is
   * distinguishable from an error because it is a successful response with total 0.
   */
  async search(
    criteria: MemberSearchCriteria,
    scope: ScopeFilter,
  ): Promise<Page<MemberSummary>> {
    return this.members.search(criteria, scope);
  }

  /**
   * BR-M-14: deactivated members are excluded from ASSIGNABLE lists while remaining in
   * historical views. This method is the assignable list, so it filters to ACTIVE.
   *
   * `onDate` is accepted for interface compatibility and forward compatibility with
   * dated eligibility, but Phase 1 has no dated activation: `status`/`deactivatedOn` are
   * a single current state (BR-M-13). Filtering on the date here would imply a history
   * the schema does not record, so it is deliberately not used — noted rather than
   * silently ignored.
   */
  async listAssignable(_onDate: IsoDate, scope: ScopeFilter): Promise<MemberSummary[]> {
    const page = await this.members.search(
      {
        search: null,
        orgUnitIds: null,
        employmentType: null,
        status: 'ACTIVE',
        skillIds: null,
        roleId: null,
        offset: 0,
        limit: 1000,
      },
      scope,
    );
    return page.items;
  }

  async create(input: MemberInput, _scope: ScopeFilter): Promise<Member> {
    const violations = new ViolationCollector();
    const normalised = this.normalise(input);

    this.validateRequired(normalised, violations);
    this.validateContract(normalised, violations);
    await this.validateReferences(normalised, violations);
    violations.throwIfAny('The member could not be created.');

    // BR-M-02/03 (email and externalRef uniqueness) are enforced by the database
    // indexes, which surface as a ConflictError naming the field. Not pre-checked: a
    // read-then-write check is a race under concurrent creates.
    const created = await this.members.create({
      externalRef: normalised.externalRef,
      fullName: normalised.fullName,
      email: normalised.email,
      orgUnitId: normalised.orgUnitId,
      employmentType: normalised.employmentType,
      roleId: normalised.roleId,
      vendorName: normalised.contract?.vendorName ?? null,
      contractStartDate: normalised.contract?.startDate ?? null,
      contractEndDate: normalised.contract?.endDate ?? null,
      contractStatus: normalised.contract?.status ?? null,
    });

    if (normalised.skillIds.length > 0) {
      await this.members.replaceSkills(created.id, normalised.skillIds);
      return { ...created, skillIds: normalised.skillIds };
    }
    return created;
  }

  /**
   * Partial update.
   *
   * BR-M-10 is the subtle one: changing OFF_ROLL -> ON_ROLL RETAINS the contract fields
   * as history rather than clearing them. Clearing would destroy the record of who the
   * person was engaged through and when — information that the assignment conflict
   * warnings (BR-A-13) and any later audit both depend on. So the conversion changes only
   * `employmentType`, and the contract data stays.
   */
  async update(id: MemberId, input: Partial<MemberInput>, scope: ScopeFilter): Promise<Member> {
    const existing = await this.members.findById(id, scope);
    if (!existing) throw new NotFoundError('The member');

    const merged: MemberInput = this.normalise({
      fullName: input.fullName ?? existing.fullName,
      email: input.email ?? existing.email,
      orgUnitId: input.orgUnitId ?? existing.orgUnitId,
      employmentType: input.employmentType ?? existing.employmentType,
      roleId: input.roleId ?? existing.roleId,
      externalRef: input.externalRef !== undefined ? input.externalRef : existing.externalRef,
      skillIds: input.skillIds ?? existing.skillIds,
      // BR-M-10: fall back to the EXISTING contract, so a conversion to ON_ROLL keeps it.
      contract:
        input.contract !== undefined
          ? input.contract
          : existing.contract
            ? {
                vendorName: existing.contract.vendorName,
                startDate: existing.contract.startDate,
                endDate: existing.contract.endDate,
                status: existing.contract.status,
              }
            : null,
    });

    const violations = new ViolationCollector();
    this.validateRequired(merged, violations);
    this.validateContract(merged, violations, existing.employmentType);
    await this.validateReferences(merged, violations, existing);
    violations.throwIfAny('The member could not be updated.');

    const updated = await this.members.update(id, {
      externalRef: merged.externalRef,
      fullName: merged.fullName,
      email: merged.email,
      orgUnitId: merged.orgUnitId,
      employmentType: merged.employmentType,
      roleId: merged.roleId,
      vendorName: merged.contract?.vendorName ?? null,
      contractStartDate: merged.contract?.startDate ?? null,
      contractEndDate: merged.contract?.endDate ?? null,
      contractStatus: merged.contract?.status ?? null,
    });
    if (!updated) throw new NotFoundError('The member');

    if (input.skillIds !== undefined) {
      await this.members.replaceSkills(id, merged.skillIds);
      return { ...updated, skillIds: merged.skillIds };
    }
    return updated;
  }

  /**
   * BR-M-11: skills must reference ACTIVE SKILL reference data. Free text is rejected
   * with a message directing the user to add reference data first — silently creating a
   * skill from a typo would corrupt the reference list, which is exactly what
   * `validateIds` exists to prevent.
   *
   * BR-M-12: attaching or detaching one skill leaves the member's other skills and all
   * assignments untouched. Both methods read the current set and write the delta.
   */
  async attachSkill(id: MemberId, skillId: ReferenceId, scope: ScopeFilter): Promise<Member> {
    const existing = await this.members.findById(id, scope);
    if (!existing) throw new NotFoundError('The member');

    const check = await this.referenceData.validateIds('SKILL', [skillId]);
    this.throwForInvalidSkills(check, 'skillId');

    if (existing.skillIds.includes(skillId)) return existing;

    const next = [...existing.skillIds, skillId];
    await this.members.replaceSkills(id, next);
    return { ...existing, skillIds: next };
  }

  async detachSkill(id: MemberId, skillId: ReferenceId, scope: ScopeFilter): Promise<Member> {
    const existing = await this.members.findById(id, scope);
    if (!existing) throw new NotFoundError('The member');

    // Detaching an INACTIVE skill must remain possible — a retired skill should be
    // removable from a member, so no active-reference check here.
    const next = existing.skillIds.filter((existingId) => existingId !== skillId);
    if (next.length === existing.skillIds.length) return existing;

    await this.members.replaceSkills(id, next);
    return { ...existing, skillIds: next };
  }

  /**
   * BR-M-13: deactivation sets status INACTIVE and `deactivatedOn`, AND auto-ends all
   * open assignments at that date, reporting the count.
   *
   * The count is returned rather than logged because the user needs to see it: "3
   * assignments were ended" is the difference between an informed action and a silent
   * side effect on other people's project plans (Q5:A).
   *
   * Order matters — assignments are ended FIRST. If the cascade fails, the member is
   * still active and the operation can be retried; the reverse order would leave an
   * inactive member with dangling open assignments.
   */
  async deactivate(
    id: MemberId,
    scope: ScopeFilter,
    actorUserId: string | null = null,
    effectiveDate: IsoDate = today(),
  ): Promise<DeactivateResult> {
    const existing = await this.members.findById(id, scope);
    if (!existing) throw new NotFoundError('The member');

    if (existing.status === 'INACTIVE') {
      // Idempotent: already inactive, nothing to cascade.
      return { member: existing, autoEndedAssignmentCount: 0 };
    }

    const autoEndedAssignmentCount = await this.autoEnder.autoEndForMember(
      id,
      effectiveDate,
      actorUserId,
    );

    const member = await this.members.deactivate(id, effectiveDate);
    if (!member) throw new NotFoundError('The member');

    return { member, autoEndedAssignmentCount };
  }

  /**
   * BR-M-15: reactivation restores assignability but does NOT restore auto-ended
   * assignments.
   *
   * This is a deliberate consequence of Q5:A. Restoring them would silently re-book the
   * member onto projects that have moved on in the meantime — the assignments must be
   * recreated explicitly, by someone who has looked at the current plan.
   */
  async reactivate(id: MemberId, scope: ScopeFilter): Promise<Member> {
    const existing = await this.members.findById(id, scope);
    if (!existing) throw new NotFoundError('The member');

    const member = await this.members.reactivate(id);
    if (!member) throw new NotFoundError('The member');
    return member;
  }

  /**
   * US-MEM-06: off-roll members whose contract ends within `withinDays`.
   *
   * Filtered in application code because the set is small (off-roll members only) and the
   * window is a moving target; the alternative is a date-arithmetic predicate in SQL that
   * is harder to read for no measurable gain at this scale. If the member count grows
   * past a few thousand this should move into the query.
   */
  async findExpiringContracts(
    withinDays: number,
    scope: ScopeFilter,
  ): Promise<MemberSummary[]> {
    const page = await this.members.search(
      {
        search: null,
        orgUnitIds: null,
        employmentType: 'OFF_ROLL',
        status: 'ACTIVE',
        skillIds: null,
        roleId: null,
        offset: 0,
        limit: 1000,
      },
      scope,
    );

    const windows = await this.members.findContractWindows(page.items.map((m) => m.id));
    const from = today();
    const to = this.addDaysIso(from, withinDays);

    return page.items.filter((member) => {
      const window = windows.get(member.id);
      if (!window) return false;
      // Inclusive on both ends, consistent with AS-03 everywhere else.
      return window.endDate >= from && window.endDate <= to;
    });
  }

  // --- validation ---------------------------------------------------------

  private normalise(input: MemberInput): MemberInput {
    return {
      fullName: input.fullName?.trim() ?? '',
      email: input.email?.trim() ?? '',
      orgUnitId: input.orgUnitId,
      employmentType: input.employmentType,
      roleId: input.roleId,
      externalRef: input.externalRef?.trim() || null,
      skillIds: [...new Set(input.skillIds ?? [])],
      contract: input.contract
        ? {
            vendorName: input.contract.vendorName?.trim() ?? '',
            startDate: input.contract.startDate,
            endDate: input.contract.endDate,
            status: input.contract.status?.trim() ?? '',
          }
        : null,
    };
  }

  /** BR-M-01: every required field, reported together (US-MEM-07). */
  private validateRequired(input: MemberInput, violations: ViolationCollector): void {
    violations
      .addIf(input.fullName === '', 'fullName', 'REQUIRED', 'A full name is required.')
      .addIf(
        input.fullName.length > MAX_NAME_LENGTH,
        'fullName',
        'TOO_LONG',
        `A full name may be at most ${MAX_NAME_LENGTH} characters.`,
      )
      .addIf(input.email === '', 'email', 'REQUIRED', 'An email address is required.')
      .addIf(
        input.email !== '' && !EMAIL_PATTERN.test(input.email),
        'email',
        'INVALID_FORMAT',
        'That does not look like an email address.',
      )
      .addIf(
        input.email.length > MAX_EMAIL_LENGTH,
        'email',
        'TOO_LONG',
        `An email address may be at most ${MAX_EMAIL_LENGTH} characters.`,
      )
      .addIf(!input.orgUnitId, 'orgUnitId', 'REQUIRED', 'An organisational unit is required.')
      .addIf(!input.roleId, 'roleId', 'REQUIRED', 'A role is required.')
      .addIf(
        input.employmentType !== 'ON_ROLL' && input.employmentType !== 'OFF_ROLL',
        'employmentType',
        'REQUIRED',
        'An employment type is required.',
      );
  }

  /**
   * BR-M-06: OFF_ROLL requires all four contract fields.
   * BR-M-07: ON_ROLL does not require them.
   * BR-M-08: contractEndDate >= contractStartDate.
   *
   * `previousEmploymentType` distinguishes a conversion from a fresh record: an ON_ROLL
   * member that was PREVIOUSLY off-roll keeps its retained contract (BR-M-10), and that
   * retained data must not be re-validated as though it were being submitted now — an
   * old contract with an odd status should not block an unrelated name change.
   */
  private validateContract(
    input: MemberInput,
    violations: ViolationCollector,
    previousEmploymentType?: EmploymentType,
  ): void {
    if (input.employmentType !== 'OFF_ROLL') {
      // BR-M-07 / BR-M-10: nothing required, nothing cleared, nothing re-validated.
      void previousEmploymentType;
      return;
    }

    const contract = input.contract;
    if (!contract) {
      violations.add(
        'contract',
        'REQUIRED',
        'Contract details are required for an off-roll member: vendor, start date, end date and status.',
      );
      return;
    }

    violations
      .addIf(contract.vendorName === '', 'contract.vendorName', 'REQUIRED', 'A vendor name is required.')
      .addIf(contract.status === '', 'contract.status', 'REQUIRED', 'A contract status is required.')
      .addIf(
        !isIsoDate(contract.startDate),
        'contract.startDate',
        'INVALID_DATE',
        'A valid contract start date (YYYY-MM-DD) is required.',
      )
      .addIf(
        !isIsoDate(contract.endDate),
        'contract.endDate',
        'INVALID_DATE',
        'A valid contract end date (YYYY-MM-DD) is required.',
      );

    if (isIsoDate(contract.startDate) && isIsoDate(contract.endDate)) {
      violations.addIf(
        !isValidRange({ start: contract.startDate, end: contract.endDate }),
        'contract.endDate',
        'DATE_ORDER',
        'The contract end date cannot be before the start date.',
      );
    }
  }

  /**
   * BR-M-04: org unit must exist and be ACTIVE.
   * BR-M-05: roleId must be an active ROLE entry.
   * BR-M-11: skills must be active SKILL entries.
   *
   * An UNCHANGED org unit or role on an update is not re-validated for active status:
   * otherwise deactivating a role would make every member holding it un-editable, so a
   * simple name correction would fail for a reason the user cannot act on. Changing to an
   * inactive one is still rejected.
   */
  private async validateReferences(
    input: MemberInput,
    violations: ViolationCollector,
    existing?: Member,
  ): Promise<void> {
    if (input.orgUnitId && input.orgUnitId !== existing?.orgUnitId) {
      const orgUnit = await this.orgUnits.findById(input.orgUnitId);
      if (!orgUnit) {
        violations.add('orgUnitId', 'NOT_FOUND', 'The selected organisational unit does not exist.');
      } else if (!orgUnit.isActive) {
        violations.add(
          'orgUnitId',
          'INACTIVE',
          `"${orgUnit.name}" is deactivated and cannot take new members.`,
        );
      }
    }

    if (input.roleId && input.roleId !== existing?.roleId) {
      const check = await this.referenceData.validateIds('ROLE', [input.roleId]);
      if (check.unknown.length > 0) {
        violations.add('roleId', 'NOT_FOUND', 'The selected role does not exist.');
      } else if (check.inactive.length > 0) {
        violations.add(
          'roleId',
          'INACTIVE',
          'That role is deactivated. Reactivate it, or choose another.',
        );
      }
    }

    const changedSkills = existing
      ? input.skillIds.filter((id) => !existing.skillIds.includes(id))
      : input.skillIds;

    if (changedSkills.length > 0) {
      const check = await this.referenceData.validateIds('SKILL', changedSkills);
      for (const violation of this.skillViolations(check, 'skillIds')) {
        violations.add(violation.field, violation.rule, violation.detail);
      }
    }
  }

  private throwForInvalidSkills(
    check: { unknown: ReferenceId[]; inactive: ReferenceId[] },
    field: string,
  ): void {
    const violations = this.skillViolations(check, field);
    if (violations.length > 0) {
      throw new ValidationError('The skill could not be applied.', violations);
    }
  }

  /** BR-M-11's message: direct the user to add reference data rather than accepting text. */
  private skillViolations(
    check: { unknown: ReferenceId[]; inactive: ReferenceId[] },
    field: string,
  ): Violation[] {
    const violations: Violation[] = [];
    if (check.unknown.length > 0) {
      violations.push({
        field,
        rule: 'NOT_FOUND',
        detail:
          `${check.unknown.length} skill(s) were not recognised. Skills must be chosen from ` +
          'the managed skill list — add the skill under reference data first, then select it.',
      });
    }
    if (check.inactive.length > 0) {
      violations.push({
        field,
        rule: 'INACTIVE',
        detail: `${check.inactive.length} skill(s) are deactivated and cannot be newly assigned.`,
      });
    }
    return violations;
  }

  /** Local date arithmetic on the ISO string, consistent with the date-only convention. */
  private addDaysIso(from: IsoDate, days: number): IsoDate {
    const date = new Date(`${from}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
}
