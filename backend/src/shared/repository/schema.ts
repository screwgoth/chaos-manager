/**
 * Kysely table interfaces — the typed shape of the database.
 *
 * Column names are snake_case (SQL convention); the domain types in shared/types are
 * camelCase. Repositories map between them, so the persistence choice cannot leak
 * upward (R2-1 rule 4).
 */

import type { ColumnType, Generated } from 'kysely';
import type {
  AssignmentStatus,
  EmploymentType,
  HistoryOperation,
  MemberStatus,
  ProjectStatus,
  ReferenceType,
  UserRole,
} from '../types/domain';

/** SQL `date` — read as a 'YYYY-MM-DD' string, never as a JS Date instant.
 *  pg is configured to return date columns as strings (see db.ts). */
type SqlDate = ColumnType<string, string, string>;
/** SQL `timestamptz` — a real instant, unlike SqlDate above.
 *
 *  Deliberately a plain `Date` and NOT a ColumnType: wrapping it as
 *  `Generated<ColumnType<...>>` nests one ColumnType inside another, which defeats
 *  Kysely's select/insert/update type extraction and made every timestamp write fail
 *  to typecheck. Writes pass a Date; `Generated` already makes them optional on insert. */
type Timestamp = Date;

export interface OrgUnitTable {
  id: Generated<string>;
  name: string;
  parent_org_unit_id: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ReferenceDataTable {
  id: Generated<string>;
  reference_type: ReferenceType;
  name: string;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface MemberTable {
  id: Generated<string>;
  external_ref: string | null;
  full_name: string;
  email: string;
  org_unit_id: string;
  employment_type: EmploymentType;
  role_id: string;
  status: Generated<MemberStatus>;
  deactivated_on: SqlDate | null;
  vendor_name: string | null;
  contract_start_date: SqlDate | null;
  contract_end_date: SqlDate | null;
  contract_status: string | null;
  /** BR-C-09: reserved for Phase 2 custom fields. UNUSED in Phase 1 — no read, no write. */
  attributes: Generated<unknown>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface MemberSkillTable {
  member_id: string;
  skill_id: string;
}

export interface ProjectTable {
  id: Generated<string>;
  code: string;
  name: string;
  description: string | null;
  owning_org_unit_id: string;
  project_type_id: string;
  start_date: SqlDate;
  planned_end_date: SqlDate;
  status: Generated<ProjectStatus>;
  closed_on: SqlDate | null;
  /** BR-C-09: reserved for Phase 2. UNUSED in Phase 1. */
  attributes: Generated<unknown>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface AssignmentTable {
  id: Generated<string>;
  member_id: string;
  project_id: string;
  /** Integer tenths of a percent (BR-A-03). Stored as integer so sums are exact. */
  allocation_tenths: number;
  start_date: SqlDate;
  end_date: SqlDate;
  project_role_id: string | null;
  saved_as_override: Generated<boolean>;
  status: Generated<AssignmentStatus>;
  ended_early_on: SqlDate | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
}

/** Append-only snapshots (Q1:B). Never updated except to set superseded_at (BR-A-18). */
export interface AssignmentHistoryTable {
  id: Generated<string>;
  assignment_id: string;
  revision_number: number;
  operation: HistoryOperation;
  /** Transaction time. */
  recorded_at: Generated<Timestamp>;
  /** null on the current revision (BR-A-17). */
  superseded_at: Timestamp | null;
  actor_user_id: string | null;
  member_id: string;
  project_id: string;
  allocation_tenths: number;
  start_date: SqlDate;
  end_date: SqlDate;
  project_role_id: string | null;
  saved_as_override: boolean;
  status: AssignmentStatus;
}

export interface UserAccountTable {
  id: Generated<string>;
  username: string;
  /** Argon2id encoded hash, salt embedded (BR-AU-01). Never plaintext. */
  password_hash: string;
  password_algorithm: string;
  role: UserRole;
  home_org_unit_id: string | null;
  linked_member_id: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface SessionTable {
  id: Generated<string>;
  /** Hash of the opaque token, never the token itself (BR-AU-09). */
  token_hash: string;
  user_account_id: string;
  created_at: Generated<Timestamp>;
  last_seen_at: Generated<Timestamp>;
  expires_at: Timestamp;
  terminated_at: Timestamp | null;
}

export interface Database {
  org_unit: OrgUnitTable;
  reference_data_entry: ReferenceDataTable;
  member: MemberTable;
  member_skill: MemberSkillTable;
  project: ProjectTable;
  assignment: AssignmentTable;
  assignment_history: AssignmentHistoryTable;
  user_account: UserAccountTable;
  session: SessionTable;
}
