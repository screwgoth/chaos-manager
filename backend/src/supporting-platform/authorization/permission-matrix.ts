/**
 * The role -> permission matrix. BR-R-14: a CODE CONSTANT, not a table.
 *
 * Q1:A decided this deliberately. Changing a permission is a code change and a code review,
 * which is what a security control deserves. There is no `role_permission` table, no admin
 * screen, and no runtime path that modifies authorization policy.
 *
 * EXHAUSTIVE BY TYPE. `Record<UserRole, Record<ResourceKind, Permission>>` means omitting a
 * role or a resource kind is a COMPILE error (U2-NFR-M-02), and `assertMatrixIsExhaustive`
 * below makes it a RUNTIME error too (U2-NFR-R-06). Both exist because the realistic failure
 * mode at a distance of months is a new `ResourceKind` added with no matrix entry, whose
 * symptom is a silent grant or denial rather than a crash.
 *
 * There is NO default branch anywhere in this file. A default branch is how a matrix this size
 * grants something nobody decided to grant.
 */

import type { ResourceKind } from '../../shared/types/authorization';
import type { UserRole } from '../../shared/types/domain';

export interface Permission {
  read: boolean;
  write: boolean;
}

const ALL: Permission = { read: true, write: true };
const READ: Permission = { read: true, write: false };
const NONE: Permission = { read: false, write: false };

/**
 * 5 roles x 8 resource kinds x {read, write} = 80 explicit decisions.
 *
 * Sources: FR-R-02 (Admin configures everything), FR-R-03 (Resource Manager creates and
 * modifies projects and assignments), FR-R-04 + BR-R-15 (Team Lead reads, and has NO write
 * path in Phase 1), FR-R-05 + BR-R-04 (Team Member sees only their own), FR-R-06 + BR-R-02
 * (Executive reads across all org units and is offered no write anywhere).
 */
export const PERMISSION_MATRIX: Record<UserRole, Record<ResourceKind, Permission>> = {
  // FR-R-02: the only role that may administer reference data, org units and accounts.
  ADMIN: {
    MEMBER: ALL,
    PROJECT: ALL,
    ASSIGNMENT: ALL,
    ALLOCATION_VIEW: READ,
    REFERENCE_DATA: ALL,
    ORG_UNIT: ALL,
    USER_ACCOUNT: ALL,
    IMPORT: ALL,
  },

  // FR-R-03: projects and assignments ONLY. Roster administration, reference vocabulary and
  // org structure stay with Admin (FR-R-02), and import is Admin-only (BR-IM-22).
  RESOURCE_MANAGER: {
    MEMBER: READ,
    PROJECT: ALL,
    ASSIGNMENT: ALL,
    ALLOCATION_VIEW: READ,
    REFERENCE_DATA: READ,
    ORG_UNIT: READ,
    USER_ACCOUNT: NONE,
    IMPORT: NONE,
  },

  // FR-R-04 + BR-R-15: reads within scope; NO write anywhere. "Request assignment changes" is
  // deferred (Q6:A), so there is deliberately no write cell set to true here.
  TEAM_LEAD: {
    MEMBER: READ,
    PROJECT: READ,
    ASSIGNMENT: READ,
    ALLOCATION_VIEW: READ,
    REFERENCE_DATA: READ,
    ORG_UNIT: READ,
    USER_ACCOUNT: NONE,
    IMPORT: NONE,
  },

  // FR-R-05 + BR-R-04: own profile and own assignments only. The narrowing is done by
  // `restrictToMemberId`, not by these cells — these only say WHICH KINDS are reachable.
  // REFERENCE_DATA is readable because their own record renders a role and skill names.
  TEAM_MEMBER: {
    MEMBER: READ,
    PROJECT: READ,
    ASSIGNMENT: READ,
    ALLOCATION_VIEW: READ,
    REFERENCE_DATA: READ,
    ORG_UNIT: NONE,
    USER_ACCOUNT: NONE,
    IMPORT: NONE,
  },

  // FR-R-06 + BR-R-02: read-only across all org units, offered no write action anywhere.
  // Account administration and import are excluded entirely — they are not "data to review".
  EXECUTIVE: {
    MEMBER: READ,
    PROJECT: READ,
    ASSIGNMENT: READ,
    ALLOCATION_VIEW: READ,
    REFERENCE_DATA: READ,
    ORG_UNIT: READ,
    USER_ACCOUNT: NONE,
    IMPORT: NONE,
  },
};

/** Every role in the type. Kept beside the matrix so a new role fails the check below. */
export const ALL_ROLES: readonly UserRole[] = [
  'ADMIN',
  'RESOURCE_MANAGER',
  'TEAM_LEAD',
  'TEAM_MEMBER',
  'EXECUTIVE',
];

/** Every resource kind in the FINAL interface's union. */
export const ALL_RESOURCE_KINDS: readonly ResourceKind[] = [
  'MEMBER',
  'PROJECT',
  'ASSIGNMENT',
  'ALLOCATION_VIEW',
  'REFERENCE_DATA',
  'ORG_UNIT',
  'USER_ACCOUNT',
  'IMPORT',
];

/**
 * U2-NFR-R-06: runtime exhaustiveness.
 *
 * The type already forces every role and kind to be PRESENT. This catches the case the type
 * cannot: a role or kind added to the union and to these arrays, but whose matrix entry was
 * filled in as `undefined` through a cast, or an array here that drifts from the union.
 *
 * Called once at construction, so a misconfigured matrix fails at STARTUP rather than at the
 * first request that happens to touch the missing cell.
 */
export function assertMatrixIsExhaustive(): void {
  const missing: string[] = [];

  for (const role of ALL_ROLES) {
    const row = PERMISSION_MATRIX[role];
    if (row === undefined) {
      missing.push(`role ${role} has no matrix row`);
      continue;
    }
    for (const kind of ALL_RESOURCE_KINDS) {
      const cell = row[kind];
      if (cell === undefined || typeof cell.read !== 'boolean' || typeof cell.write !== 'boolean') {
        missing.push(`${role} x ${kind}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Permission matrix is not exhaustive. Missing or malformed: ${missing.join(', ')}. ` +
        'Every role x resource kind must be an explicit decision (BR-R-14).',
    );
  }
}

export function permissionFor(role: UserRole, resource: ResourceKind): Permission {
  const cell = PERMISSION_MATRIX[role][resource];
  // Not a defensive default: `assertMatrixIsExhaustive` has already run at construction, so
  // reaching this would mean the matrix was mutated at runtime. Failing closed is the only
  // safe direction, and it is louder than returning NONE silently.
  if (cell === undefined) {
    throw new Error(`No permission entry for ${role} x ${resource}`);
  }
  return cell;
}
