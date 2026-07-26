/**
 * Wire types — the shapes the API actually returns.
 *
 * Deliberately NOT imported from the backend. The frontend is a separate deployable that
 * talks HTTP, and sharing types across that boundary would let a backend refactor silently
 * change what the frontend believes without either side failing to compile. These are written
 * from the route handlers' response shapes.
 *
 * PERCENTAGES, NOT TENTHS. The API converts at its boundary, so nothing here handles tenths.
 */

export type UserRole = 'ADMIN' | 'RESOURCE_MANAGER' | 'TEAM_LEAD' | 'TEAM_MEMBER' | 'EXECUTIVE';
export type EmploymentType = 'ON_ROLL' | 'OFF_ROLL';
export type MemberStatus = 'ACTIVE' | 'INACTIVE';
export type ProjectStatus = 'ACTIVE' | 'CLOSED';
export type AssignmentStatus = 'ACTIVE' | 'ENDED';
export type ReferenceType = 'ROLE' | 'SKILL' | 'PROJECT_TYPE';

export interface DateRange {
  start: string;
  end: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface SessionUser {
  userAccountId: string;
  username: string;
  role: UserRole;
  linkedMemberId: string | null;
}

export interface SessionResponse {
  authenticated: boolean;
  user?: SessionUser;
  scope?: { role: UserRole; ownMemberId: string | null };
  expiresAt?: string;
}

export interface OrgUnit {
  id: string;
  name: string;
  parentOrgUnitId: string | null;
  isActive: boolean;
}

export interface OrgUnitNode {
  orgUnit: OrgUnit;
  children: OrgUnitNode[];
}

export interface ReferenceDataEntry {
  id: string;
  referenceType: ReferenceType;
  name: string;
  isActive: boolean;
}

export interface Contract {
  vendorName: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface Member {
  id: string;
  externalRef: string | null;
  fullName: string;
  email: string;
  orgUnitId: string;
  employmentType: EmploymentType;
  roleId: string;
  status: MemberStatus;
  deactivatedOn: string | null;
  contract: Contract | null;
  skillIds: string[];
}

export interface MemberSummary {
  id: string;
  fullName: string;
  email: string;
  orgUnitId: string;
  employmentType: EmploymentType;
  roleId: string;
  status: MemberStatus;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string | null;
  owningOrgUnitId: string;
  projectTypeId: string;
  startDate: string;
  plannedEndDate: string;
  status: ProjectStatus;
  closedOn: string | null;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  owningOrgUnitId: string;
  status: ProjectStatus;
}

export interface Assignment {
  id: string;
  memberId: string;
  projectId: string;
  allocationTenths: number;
  startDate: string;
  endDate: string;
  projectRoleId: string | null;
  savedAsOverride: boolean;
  status: AssignmentStatus;
  endedEarlyOn: string | null;
}

export interface AllocationContribution {
  assignmentId: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  allocationPercentage: number;
  savedAsOverride: boolean;
}

export interface AllocationSegment {
  period: DateRange;
  totalPercentage: number;
  /** Negative when over-allocated (BR-V-03) — never clamp this to zero when displaying. */
  availablePercentage: number;
  isOverAllocated: boolean;
  contributions: AllocationContribution[];
}

export interface TimelineSegment extends AllocationSegment {
  /** True when NOTHING is booked. Must not render like a partially-booked stretch. */
  isGap: boolean;
  assignments: AllocationContribution[];
}

export interface OverAllocationFinding {
  memberId: string;
  period: DateRange;
  totalPercentage: number;
  arisesFromOverride: boolean;
  contributions: AllocationContribution[];
}

export type AssignmentConflictKind = 'CONTRACT_WINDOW' | 'MEMBER_INACTIVE_PERIOD' | 'PROJECT_CLOSED';

export interface AssignmentConflict {
  kind: AssignmentConflictKind;
  detail: string;
  boundaryDate: string | null;
}

/** The two-step override protocol's response (US-ASN-05). */
export interface AssignmentWriteResult {
  assignment: Assignment | null;
  savedAsOverride: boolean;
  requiresOverrideConfirmation: boolean;
  overAllocation: OverAllocationFinding[];
  conflicts: AssignmentConflict[];
}

export interface MemberAllocationRow {
  member: MemberSummary;
  totalPercentage: number;
  availablePercentage: number;
  isOverAllocated: boolean;
  contributions: AllocationContribution[];
}

export interface AvailabilityRow {
  member: MemberSummary;
  minAvailablePercentage: number;
  maxAvailablePercentage: number;
  isFullyAllocated: boolean;
  isOverAllocated: boolean;
  segments: AllocationSegment[];
}

export interface StaffedMember {
  memberId: string;
  assignments: {
    id: string;
    memberId: string;
    allocationTenths: number;
    startDate: string;
    endDate: string;
  }[];
  subtotalTenths: number;
}

export interface ProjectStaffing {
  projectId: string;
  asOf: string;
  current: StaffedMember[];
  past: StaffedMember[];
  /** BR-P-09: stated explicitly, not inferred from empty arrays. */
  isUnstaffed: boolean;
}

export interface CloseProjectResult {
  project: Project | null;
  openAssignments: {
    id: string;
    memberId: string;
    allocationTenths: number;
    startDate: string;
    endDate: string;
  }[];
  confirmationRequired: boolean;
  autoEndedAssignmentCount: number;
}

export interface DeactivateMemberResult {
  member: Member;
  autoEndedAssignmentCount: number;
}

export interface RemoveReferenceResult {
  removed: boolean;
  blockedByReferenceCount: number | null;
  alternative: 'DEACTIVATE' | null;
}

export interface OrgUnitReferenceCount {
  memberCount: number;
  projectCount: number;
  childOrgUnitCount: number;
}

export interface RemoveOrgUnitResult {
  removed: boolean;
  blockedBy: OrgUnitReferenceCount | null;
  alternative: 'DEACTIVATE' | null;
}

export interface HistoricalRevision {
  assignmentId: string;
  revisionNumber: number;
  operation: 'CREATE' | 'UPDATE' | 'END_EARLY' | 'AUTO_END';
  memberId: string;
  projectId: string;
  allocationPercentage: number;
  startDate: string;
  endDate: string;
  savedAsOverride: boolean;
  status: AssignmentStatus;
  recordedAt: string;
}
