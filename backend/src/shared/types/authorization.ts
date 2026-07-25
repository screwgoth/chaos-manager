/**
 * The authorization contract.
 *
 * X-1 CROSS-UNIT DEPENDENCY. This interface is FINAL and must NOT be widened by
 * `supporting-platform` (Unit 2). Unit 1 ships a permissive stand-in implementation;
 * Unit 2 replaces the implementation behind this unchanged interface. If Unit 2 needs
 * to change this file, every Unit 1 call site changes with it — which is exactly the
 * rework the stand-in pattern exists to prevent, and would be a Unit 1 design defect.
 *
 * Lives in `shared/` — owned by neither unit — which is what makes the units
 * acyclic (unit-of-work-dependency.md section 1).
 */

import type { MemberId, OrgUnitId, UserRole, VerifiedIdentity } from './domain';

/** Server-resolved authorization context. NEVER built from client input (BR-R-06). */
export interface AccessScope {
  role: UserRole;
  /** 'ALL' means unrestricted across org units. */
  orgUnitIds: OrgUnitId[] | 'ALL';
  /** The member record this user IS, when linked. Used to scope own-data views. */
  ownMemberId: MemberId | null;
}

/**
 * The constraint repositories apply INSIDE their queries, so out-of-scope rows are
 * never fetched rather than fetched and trimmed (FR-R-08, R2-1 rule 1).
 */
export interface ScopeFilter {
  orgUnitIds: OrgUnitId[] | 'ALL';
  /** When set, results must be limited to this member (TEAM_MEMBER own-data rule). */
  restrictToMemberId: MemberId | null;
}

export type ResourceKind =
  | 'MEMBER'
  | 'PROJECT'
  | 'ASSIGNMENT'
  | 'ALLOCATION_VIEW'
  | 'REFERENCE_DATA'
  | 'ORG_UNIT'
  | 'USER_ACCOUNT'
  | 'IMPORT';

export interface TargetRef {
  orgUnitId: OrgUnitId | null;
  memberId: MemberId | null;
}

export interface IAuthorizationComponent {
  resolveScope(identity: VerifiedIdentity): AccessScope;
  toScopeFilter(scope: AccessScope): ScopeFilter;

  canRead(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): boolean;
  canWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): boolean;

  /** Throws ForbiddenError when not permitted. */
  assertCanRead(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void;
  assertCanWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void;
}
