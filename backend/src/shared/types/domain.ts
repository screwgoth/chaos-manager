/**
 * Shared domain types. Owned by NEITHER unit (unit plan Q8:A) — both `core-domain`
 * and `supporting-platform` depend on this module, and this module depends on nothing.
 * That is what breaks the apparent dependency cycle between the two units
 * (unit-of-work-dependency.md section 1).
 */

import type { IsoDate, DateRange } from '../util/dates';
import type { Tenths } from '../util/tenths';

export type { IsoDate, DateRange, Tenths };

export type MemberId = string;
export type ProjectId = string;
export type AssignmentId = string;
export type OrgUnitId = string;
export type ReferenceId = string;
export type UserAccountId = string;
export type SessionId = string;

export type EmploymentType = 'ON_ROLL' | 'OFF_ROLL';
export type MemberStatus = 'ACTIVE' | 'INACTIVE';
export type ProjectStatus = 'ACTIVE' | 'CLOSED';
export type AssignmentStatus = 'ACTIVE' | 'ENDED';
export type ReferenceType = 'ROLE' | 'SKILL' | 'PROJECT_TYPE';

export type UserRole =
  | 'ADMIN'
  | 'RESOURCE_MANAGER'
  | 'TEAM_LEAD'
  | 'TEAM_MEMBER'
  | 'EXECUTIVE';

export type HistoryOperation = 'CREATE' | 'UPDATE' | 'END_EARLY' | 'AUTO_END';

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

// --- Entities -------------------------------------------------------------

export interface OrgUnit {
  id: OrgUnitId;
  name: string;
  /** null = department (level 1); set = team (level 2). Exactly two levels (BR-O-01). */
  parentOrgUnitId: OrgUnitId | null;
  isActive: boolean;
}

export interface ReferenceDataEntry {
  id: ReferenceId;
  referenceType: ReferenceType;
  name: string;
  isActive: boolean;
}

export interface Contract {
  vendorName: string;
  startDate: IsoDate;
  endDate: IsoDate;
  status: string;
}

export interface Member {
  id: MemberId;
  externalRef: string | null;
  fullName: string;
  email: string;
  orgUnitId: OrgUnitId;
  employmentType: EmploymentType;
  roleId: ReferenceId;
  status: MemberStatus;
  deactivatedOn: IsoDate | null;
  /** Required when employmentType is OFF_ROLL (BR-M-06). Retained on conversion (BR-M-10). */
  contract: Contract | null;
  skillIds: ReferenceId[];
}

export interface MemberSummary {
  id: MemberId;
  fullName: string;
  email: string;
  orgUnitId: OrgUnitId;
  employmentType: EmploymentType;
  roleId: ReferenceId;
  status: MemberStatus;
}

export interface Project {
  id: ProjectId;
  code: string;
  name: string;
  description: string | null;
  owningOrgUnitId: OrgUnitId;
  projectTypeId: ReferenceId;
  startDate: IsoDate;
  plannedEndDate: IsoDate;
  status: ProjectStatus;
  closedOn: IsoDate | null;
}

export interface ProjectSummary {
  id: ProjectId;
  code: string;
  name: string;
  owningOrgUnitId: OrgUnitId;
  status: ProjectStatus;
}

export interface Assignment {
  id: AssignmentId;
  memberId: MemberId;
  projectId: ProjectId;
  /** Integer tenths of a percent (BR-A-03). */
  allocationTenths: Tenths;
  startDate: IsoDate;
  endDate: IsoDate;
  projectRoleId: ReferenceId | null;
  /** Set from the DETECTION result, not from the user's flag (BR-A-11). */
  savedAsOverride: boolean;
  /** ENDED means administratively terminated. A merely past endDate stays ACTIVE (BR-A-20). */
  status: AssignmentStatus;
  endedEarlyOn: IsoDate | null;
}

/** Append-only snapshot of an assignment after each change (Q1:B, BR-A-18). */
export interface AssignmentRevision {
  assignmentId: AssignmentId;
  revisionNumber: number;
  operation: HistoryOperation;
  /** Transaction time: when the change was made. */
  recordedAt: Date;
  /** recordedAt of the next revision; null on the current revision (BR-A-17). */
  supersededAt: Date | null;
  actorUserId: UserAccountId | null;
  allocationTenths: Tenths;
  startDate: IsoDate;
  endDate: IsoDate;
  projectRoleId: ReferenceId | null;
  savedAsOverride: boolean;
  status: AssignmentStatus;
  memberId: MemberId;
  projectId: ProjectId;
}

export interface UserAccount {
  id: UserAccountId;
  username: string;
  role: UserRole;
  homeOrgUnitId: OrgUnitId | null;
  linkedMemberId: MemberId | null;
  isActive: boolean;
}

/** The sole currency between credential verification, identity resolution and
 *  session establishment. What makes the auth boundary replaceable (US-ENB-03). */
export interface VerifiedIdentity {
  userAccountId: UserAccountId;
  username: string;
  role: UserRole;
  homeOrgUnitId: OrgUnitId | null;
  linkedMemberId: MemberId | null;
  isActive: boolean;
}

export interface Session {
  id: SessionId;
  userAccountId: UserAccountId;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  terminatedAt: Date | null;
}

// --- Allocation results -------------------------------------------------

export interface AllocationContribution {
  assignmentId: AssignmentId;
  projectId: ProjectId;
  projectName: string;
  projectCode: string;
  allocationTenths: Tenths;
  savedAsOverride: boolean;
}

/** One sub-period over which the member's total allocation is constant. */
export interface AllocationSegment {
  period: DateRange;
  totalTenths: Tenths;
  /** Negative when over-allocated (BR-V-03). */
  availableTenths: Tenths;
  isOverAllocated: boolean;
  contributions: AllocationContribution[];
}

/** Identifies the SPECIFIC over-allocated sub-period, not merely that one exists (BR-A-08). */
export interface OverAllocationFinding {
  memberId: MemberId;
  period: DateRange;
  totalTenths: Tenths;
  contributions: AllocationContribution[];
  arisesFromOverride: boolean;
}

export type AssignmentConflictKind =
  | 'CONTRACT_WINDOW'
  | 'MEMBER_INACTIVE_PERIOD'
  | 'PROJECT_CLOSED';

/** Warnings that do NOT block a save (BR-A-13, BR-A-14). */
export interface AssignmentConflict {
  kind: AssignmentConflictKind;
  detail: string;
  boundaryDate: IsoDate | null;
}
