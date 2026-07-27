/**
 * Row -> domain mapping.
 *
 * R2-1 rule 4: the persistence shape must not leak upward. Nothing above the repository
 * layer sees snake_case columns, and no domain object carries a column name. Every
 * mapper here is total and side-effect free so it can be read in one pass.
 *
 * Date columns arrive as 'YYYY-MM-DD' strings because db.ts overrides the pg parser for
 * OID 1082. These mappers therefore pass dates through untouched — any `new Date(...)`
 * on a date column here would reintroduce the timezone bug that override exists to fix.
 */

import type {
  Assignment,
  AssignmentRevision,
  Contract,
  Member,
  MemberSummary,
  OrgUnit,
  Project,
  ProjectSummary,
  ReferenceDataEntry,
  Session,
  UserAccount,
  VerifiedIdentity,
} from '../types/domain';
import type { Selectable } from 'kysely';
import type {
  AssignmentHistoryTable,
  AssignmentTable,
  MemberTable,
  OrgUnitTable,
  ProjectTable,
  ReferenceDataTable,
  SessionTable,
  UserAccountTable,
} from './schema';

export function toOrgUnit(row: Selectable<OrgUnitTable>): OrgUnit {
  return {
    id: row.id,
    name: row.name,
    parentOrgUnitId: row.parent_org_unit_id,
    isActive: row.is_active,
  };
}

export function toReferenceDataEntry(row: Selectable<ReferenceDataTable>): ReferenceDataEntry {
  return {
    id: row.id,
    referenceType: row.reference_type,
    name: row.name,
    isActive: row.is_active,
  };
}

/**
 * BR-M-06 guarantees contract fields are present for OFF_ROLL members at the database
 * level, but this mapper does not assume it: a partially-populated contract yields null
 * rather than an object with empty strings, so a downstream conflict check cannot
 * silently compare against a fabricated window (BR-A-13).
 */
function toContract(row: Selectable<MemberTable>): Contract | null {
  if (
    row.vendor_name === null ||
    row.contract_start_date === null ||
    row.contract_end_date === null
  ) {
    return null;
  }
  return {
    vendorName: row.vendor_name,
    startDate: row.contract_start_date,
    endDate: row.contract_end_date,
    status: row.contract_status ?? 'UNKNOWN',
  };
}

export function toMember(row: Selectable<MemberTable>, skillIds: string[]): Member {
  return {
    id: row.id,
    externalRef: row.external_ref,
    fullName: row.full_name,
    email: row.email,
    orgUnitId: row.org_unit_id,
    employmentType: row.employment_type,
    roleId: row.role_id,
    status: row.status,
    deactivatedOn: row.deactivated_on,
    contract: toContract(row),
    skillIds,
  };
}

export function toMemberSummary(row: Selectable<MemberTable>): MemberSummary {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    orgUnitId: row.org_unit_id,
    employmentType: row.employment_type,
    roleId: row.role_id,
    status: row.status,
  };
}

export function toProject(row: Selectable<ProjectTable>): Project {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    owningOrgUnitId: row.owning_org_unit_id,
    projectTypeId: row.project_type_id,
    startDate: row.start_date,
    plannedEndDate: row.planned_end_date,
    status: row.status,
    closedOn: row.closed_on,
  };
}

export function toProjectSummary(row: Selectable<ProjectTable>): ProjectSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    owningOrgUnitId: row.owning_org_unit_id,
    status: row.status,
  };
}

export function toAssignment(row: Selectable<AssignmentTable>): Assignment {
  return {
    id: row.id,
    memberId: row.member_id,
    projectId: row.project_id,
    allocationTenths: row.allocation_tenths,
    startDate: row.start_date,
    endDate: row.end_date,
    projectRoleId: row.project_role_id,
    savedAsOverride: row.saved_as_override,
    status: row.status,
    endedEarlyOn: row.ended_early_on,
  };
}

export function toAssignmentRevision(
  row: Selectable<AssignmentHistoryTable>,
): AssignmentRevision {
  return {
    assignmentId: row.assignment_id,
    revisionNumber: row.revision_number,
    operation: row.operation,
    recordedAt: row.recorded_at,
    supersededAt: row.superseded_at,
    actorUserId: row.actor_user_id,
    memberId: row.member_id,
    projectId: row.project_id,
    allocationTenths: row.allocation_tenths,
    startDate: row.start_date,
    endDate: row.end_date,
    projectRoleId: row.project_role_id,
    savedAsOverride: row.saved_as_override,
    status: row.status,
  };
}

/** NOTE: deliberately omits password_hash. The hash must not travel upward (NFR-SE-02). */
export function toUserAccount(row: Selectable<UserAccountTable>): UserAccount {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    homeOrgUnitId: row.home_org_unit_id,
    linkedMemberId: row.linked_member_id,
    isActive: row.is_active,
  };
}

/** Also omits password_hash — VerifiedIdentity is post-verification by definition. */
export function toVerifiedIdentity(row: Selectable<UserAccountTable>): VerifiedIdentity {
  return {
    userAccountId: row.id,
    username: row.username,
    role: row.role,
    homeOrgUnitId: row.home_org_unit_id,
    linkedMemberId: row.linked_member_id,
    isActive: row.is_active,
  };
}

/** NOTE: deliberately omits token_hash (BR-AU-09). */
export function toSession(row: Selectable<SessionTable>): Session {
  return {
    id: row.id,
    userAccountId: row.user_account_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    terminatedAt: row.terminated_at,
  };
}
