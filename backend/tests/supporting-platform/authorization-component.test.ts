/**
 * C-09 AuthorizationComponent — unit tests. Step 3.
 *
 * No database. These cover the matrix (BR-R-14) and scope resolution
 * (BR-R-08/09/10/11/18). The behaviour that needs a real query — whether a specific record is
 * in scope — is covered by `authorization-enforcement.test.ts`, because after defect U1-D01
 * that decision lives in SQL and cannot be unit-tested here.
 */

import { AuthorizationComponent } from '../../src/supporting-platform/authorization/authorization-component';
import {
  ALL_RESOURCE_KINDS,
  ALL_ROLES,
  PERMISSION_MATRIX,
  assertMatrixIsExhaustive,
} from '../../src/supporting-platform/authorization/permission-matrix';
import { ForbiddenError } from '../../src/shared/errors';
import type { ResourceKind } from '../../src/shared/types/authorization';
import type { MemberId, OrgUnitId, UserRole, VerifiedIdentity } from '../../src/shared/types/domain';

const ROOT = 'root-org' as OrgUnitId;
const CHILD = 'child-org' as OrgUnitId;
const OTHER_ROOT = 'other-root' as OrgUnitId;
const ME = 'me-member' as MemberId;

function identity(overrides: Partial<VerifiedIdentity> = {}): VerifiedIdentity {
  return {
    userAccountId: 'acct-1' as VerifiedIdentity['userAccountId'],
    username: 'someone',
    role: 'ADMIN',
    homeOrgUnitId: null,
    linkedMemberId: null,
    isActive: true,
    ...overrides,
  };
}

/** Root ids the component knows about, mirroring what server.ts loads after migrations. */
function component(roots: OrgUnitId[] = [ROOT, OTHER_ROOT]): AuthorizationComponent {
  return new AuthorizationComponent(roots);
}

describe('permission matrix (BR-R-14)', () => {
  /**
   * N-Q6:C: all 40 cells (80 decisions), table-driven. This catches a cell edited by accident, which is the
   * realistic failure mode for a table this size.
   */
  const EXPECTED: Record<UserRole, { read: ResourceKind[]; write: ResourceKind[] }> = {
    ADMIN: {
      read: [...ALL_RESOURCE_KINDS],
      // ALLOCATION_VIEW is a derived view, not a writable resource, for ANY role.
      write: ALL_RESOURCE_KINDS.filter((k) => k !== 'ALLOCATION_VIEW'),
    },
    RESOURCE_MANAGER: {
      read: ['MEMBER', 'PROJECT', 'ASSIGNMENT', 'ALLOCATION_VIEW', 'REFERENCE_DATA', 'ORG_UNIT'],
      write: ['PROJECT', 'ASSIGNMENT'],
    },
    TEAM_LEAD: {
      read: ['MEMBER', 'PROJECT', 'ASSIGNMENT', 'ALLOCATION_VIEW', 'REFERENCE_DATA', 'ORG_UNIT'],
      write: [], // BR-R-15: no write path anywhere in Phase 1
    },
    TEAM_MEMBER: {
      read: ['MEMBER', 'PROJECT', 'ASSIGNMENT', 'ALLOCATION_VIEW', 'REFERENCE_DATA'],
      write: [],
    },
    EXECUTIVE: {
      read: ['MEMBER', 'PROJECT', 'ASSIGNMENT', 'ALLOCATION_VIEW', 'REFERENCE_DATA', 'ORG_UNIT'],
      write: [], // BR-R-02: offered no write action anywhere
    },
  };

  const cases: Array<[UserRole, ResourceKind, boolean, boolean]> = [];
  for (const role of ALL_ROLES) {
    for (const kind of ALL_RESOURCE_KINDS) {
      cases.push([
        role,
        kind,
        EXPECTED[role].read.includes(kind),
        EXPECTED[role].write.includes(kind),
      ]);
    }
  }

  /**
   * 5 roles x 8 resource kinds = 40 CELLS, each carrying a read and a write flag = 80 DECISIONS.
   * Worth stating precisely: an earlier version of this assertion expected 80 rows and failed,
   * because "80-cell matrix" is loose phrasing for a 40-cell / 80-decision table.
   */
  it('declares exactly 40 cells and 80 decisions', () => {
    expect(ALL_ROLES).toHaveLength(5);
    expect(ALL_RESOURCE_KINDS).toHaveLength(8);
    expect(cases).toHaveLength(40);
    expect(cases.length * 2).toBe(80);
  });

  it.each(cases)('%s x %s -> read=%s write=%s', (role, kind, read, write) => {
    expect(PERMISSION_MATRIX[role][kind]).toEqual({ read, write });
  });

  /** BR-R-02 and BR-R-15 stated as properties, not just cell-by-cell. */
  it('EXECUTIVE and TEAM_LEAD can write NOTHING', () => {
    for (const role of ['EXECUTIVE', 'TEAM_LEAD'] as UserRole[]) {
      for (const kind of ALL_RESOURCE_KINDS) {
        expect(PERMISSION_MATRIX[role][kind].write).toBe(false);
      }
    }
  });

  it('only ADMIN reaches USER_ACCOUNT or IMPORT (BR-IM-22, BR-L-06)', () => {
    for (const role of ALL_ROLES) {
      const expected = role === 'ADMIN';
      expect(PERMISSION_MATRIX[role].USER_ACCOUNT.read).toBe(expected);
      expect(PERMISSION_MATRIX[role].IMPORT.read).toBe(expected);
      expect(PERMISSION_MATRIX[role].USER_ACCOUNT.write).toBe(expected);
      expect(PERMISSION_MATRIX[role].IMPORT.write).toBe(expected);
    }
  });

  /**
   * U2-NFR-R-06 / N-Q6:C. The exhaustiveness check must FAIL when a cell is missing — verified
   * by deleting one rather than by trusting that it works. A check that passes on a broken
   * matrix is worse than no check.
   */
  it('exhaustiveness check passes on the real matrix', () => {
    expect(() => assertMatrixIsExhaustive()).not.toThrow();
  });

  it('exhaustiveness check FAILS when a cell is removed', () => {
    const row = PERMISSION_MATRIX.TEAM_LEAD;
    const saved = row.ASSIGNMENT;
    // @ts-expect-error deliberately breaking the matrix to prove the guard fires
    delete row.ASSIGNMENT;
    try {
      expect(() => assertMatrixIsExhaustive()).toThrow(/not exhaustive/i);
      expect(() => assertMatrixIsExhaustive()).toThrow(/TEAM_LEAD x ASSIGNMENT/);
    } finally {
      row.ASSIGNMENT = saved;
    }
    expect(() => assertMatrixIsExhaustive()).not.toThrow();
  });

  it('a misconfigured matrix fails at CONSTRUCTION, not at first use', () => {
    const row = PERMISSION_MATRIX.ADMIN;
    const saved = row.IMPORT;
    // @ts-expect-error deliberately breaking the matrix
    delete row.IMPORT;
    try {
      expect(() => new AuthorizationComponent([])).toThrow(/not exhaustive/i);
    } finally {
      row.IMPORT = saved;
    }
  });
});

describe('resolveScope', () => {
  it('ADMIN and EXECUTIVE are unrestricted (BR-R-10)', () => {
    for (const role of ['ADMIN', 'EXECUTIVE'] as UserRole[]) {
      const scope = component().resolveScope(identity({ role, homeOrgUnitId: CHILD }));
      expect(scope.orgUnitIds).toBe('ALL');
      expect(scope.role).toBe(role);
    }
  });

  it('TEAM_LEAD scope is their home unit as a ROOT (BR-R-08 + U1-D01)', () => {
    const scope = component().resolveScope(
      identity({ role: 'TEAM_LEAD', homeOrgUnitId: CHILD }),
    );
    // The CHILDREN are added in SQL by orgScopeMatches — this carries the root only.
    expect(scope.orgUnitIds).toEqual([CHILD]);
  });

  it('RESOURCE_MANAGER at a ROOT unit is organisation-wide (BR-R-09 / CQ2:B)', () => {
    const scope = component([ROOT]).resolveScope(
      identity({ role: 'RESOURCE_MANAGER', homeOrgUnitId: ROOT }),
    );
    // 'ALL', NOT subtree(ROOT) — the two differ once a second root unit exists, and an
    // expanded list would silently omit a root added later.
    expect(scope.orgUnitIds).toBe('ALL');
  });

  it('RESOURCE_MANAGER at a CHILD unit is confined to that subtree (BR-R-09)', () => {
    const scope = component([ROOT]).resolveScope(
      identity({ role: 'RESOURCE_MANAGER', homeOrgUnitId: CHILD }),
    );
    expect(scope.orgUnitIds).toEqual([CHILD]);
  });

  /**
   * BR-R-11 — the single most important assertion in this file.
   *
   * `'ALL'` is the UNRESTRICTED sentinel. A misconfigured account resolving to `'ALL'` would
   * get everything, which is the exact opposite of the intent. It must be an EMPTY LIST.
   */
  it.each(['TEAM_LEAD', 'RESOURCE_MANAGER'] as UserRole[])(
    '%s with a NULL home org unit fails CLOSED, not open (BR-R-11)',
    (role) => {
      const scope = component().resolveScope(identity({ role, homeOrgUnitId: null }));
      expect(scope.orgUnitIds).toEqual([]);
      expect(scope.orgUnitIds).not.toBe('ALL');
    },
  );

  it('TEAM_MEMBER carries ownMemberId and defers org scope to the member filter', () => {
    const scope = component().resolveScope(
      identity({ role: 'TEAM_MEMBER', linkedMemberId: ME, homeOrgUnitId: OTHER_ROOT }),
    );
    // 'ALL' here is deliberate: restrictToMemberId is strictly narrower, and a team member whose
    // member record sits outside their own home org unit must still be able to see themselves.
    expect(scope.orgUnitIds).toBe('ALL');
    expect(scope.ownMemberId).toBe(ME);
  });

  it('never reads anything but the identity (BR-R-06)', () => {
    // Shape-level guarantee: resolveScope takes ONE argument. There is no seam through which a
    // request body, header or query parameter could contribute to a scope.
    expect(component().resolveScope.length).toBe(1);
  });

  it('a root unit created after startup under-grants until refresh (documented U1-D01 gap)', () => {
    const stale = component([ROOT]); // OTHER_ROOT not yet known
    const before = stale.resolveScope(
      identity({ role: 'RESOURCE_MANAGER', homeOrgUnitId: OTHER_ROOT }),
    );
    // Under-grants — subtree instead of 'ALL'. Narrowing, never widening.
    expect(before.orgUnitIds).toEqual([OTHER_ROOT]);

    stale.setRootOrgUnitIds([ROOT, OTHER_ROOT]);
    const after = stale.resolveScope(
      identity({ role: 'RESOURCE_MANAGER', homeOrgUnitId: OTHER_ROOT }),
    );
    expect(after.orgUnitIds).toBe('ALL');
  });
});

describe('toScopeFilter', () => {
  it('TEAM_MEMBER is narrowed by member id (BR-R-04)', () => {
    const auth = component();
    const filter = auth.toScopeFilter(
      auth.resolveScope(identity({ role: 'TEAM_MEMBER', linkedMemberId: ME })),
    );
    expect(filter).toEqual({ orgUnitIds: 'ALL', restrictToMemberId: ME });
  });

  it('passes scope roots through for every other role', () => {
    const auth = component();
    const filter = auth.toScopeFilter(
      auth.resolveScope(identity({ role: 'TEAM_LEAD', homeOrgUnitId: CHILD })),
    );
    expect(filter).toEqual({ orgUnitIds: [CHILD], restrictToMemberId: null });
  });

  it('an empty root list survives into the filter (BR-R-17)', () => {
    const auth = component();
    const filter = auth.toScopeFilter(
      auth.resolveScope(identity({ role: 'TEAM_LEAD', homeOrgUnitId: null })),
    );
    // The repositories turn this into an always-false predicate. It must NOT arrive as 'ALL'.
    expect(filter.orgUnitIds).toEqual([]);
  });
});

describe('canRead / canWrite', () => {
  const auth = component();
  const teamLead = auth.resolveScope(identity({ role: 'TEAM_LEAD', homeOrgUnitId: CHILD }));
  const executive = auth.resolveScope(identity({ role: 'EXECUTIVE' }));
  const admin = auth.resolveScope(identity({ role: 'ADMIN' }));

  it('BR-R-18: an UNLINKED team member is refused everything', () => {
    const unlinked = auth.resolveScope(identity({ role: 'TEAM_MEMBER', linkedMemberId: null }));
    for (const kind of ALL_RESOURCE_KINDS) {
      expect(auth.canRead(unlinked, kind, null)).toBe(false);
    }
    expect(() => auth.assertCanRead(unlinked, 'MEMBER', null)).toThrow(ForbiddenError);
    expect(() => auth.assertCanRead(unlinked, 'MEMBER', null)).toThrow(/not linked/i);
  });

  it('a LINKED team member can read their permitted kinds', () => {
    const linked = auth.resolveScope(identity({ role: 'TEAM_MEMBER', linkedMemberId: ME }));
    expect(auth.canRead(linked, 'ASSIGNMENT', null)).toBe(true);
    expect(auth.canRead(linked, 'IMPORT', null)).toBe(false);
  });

  it('EXECUTIVE reads but cannot write (BR-R-02)', () => {
    expect(auth.canRead(executive, 'MEMBER', null)).toBe(true);
    expect(auth.canWrite(executive, 'MEMBER', null)).toBe(false);
    expect(() => auth.assertCanWrite(executive, 'MEMBER', null)).toThrow(/EXECUTIVE role cannot/);
  });

  it('TEAM_LEAD cannot write anything (BR-R-15)', () => {
    for (const kind of ALL_RESOURCE_KINDS) {
      expect(auth.canWrite(teamLead, kind, null)).toBe(false);
    }
  });

  it('only ADMIN may import (BR-IM-22) or link accounts (BR-L-06)', () => {
    expect(auth.canWrite(admin, 'IMPORT', null)).toBe(true);
    expect(auth.canWrite(admin, 'USER_ACCOUNT', null)).toBe(true);
    for (const scope of [teamLead, executive]) {
      expect(auth.canWrite(scope, 'IMPORT', null)).toBe(false);
      expect(auth.canWrite(scope, 'USER_ACCOUNT', null)).toBe(false);
    }
  });

  it('an EMPTY scope is refused for a specific target (BR-R-11 fail-closed)', () => {
    const stranded = auth.resolveScope(identity({ role: 'TEAM_LEAD', homeOrgUnitId: null }));
    expect(auth.canRead(stranded, 'MEMBER', { orgUnitId: CHILD, memberId: null })).toBe(false);
    expect(() => auth.assertCanRead(stranded, 'MEMBER', { orgUnitId: CHILD, memberId: null })).toThrow(
      /not assigned to an organisational unit/i,
    );
  });

  /**
   * Regression guard for a bug this file caught. `targetInScope` must NOT try to decide
   * per-record org scope, because `orgUnitIds` holds ROOTS (U1-D01) and excludes children — so
   * comparing against it would refuse a Team Lead reading a member in a CHILD unit.
   */
  it('does NOT refuse a target in a child unit (the query decides, not the component)', () => {
    expect(auth.canRead(teamLead, 'MEMBER', { orgUnitId: 'some-grandchild' as OrgUnitId, memberId: null })).toBe(
      true,
    );
  });

  it('does NOT refuse a team member targeting another member (BR-R-16: 404, not 403)', () => {
    const linked = auth.resolveScope(identity({ role: 'TEAM_MEMBER', linkedMemberId: ME }));
    // Refusing here produced 403 on collection reads that must return 200 + [], and a 403 also
    // confirms existence, which BR-R-16 chose 404 to avoid.
    expect(auth.canRead(linked, 'ASSIGNMENT', { orgUnitId: null, memberId: 'other' as MemberId })).toBe(
      true,
    );
  });
});
