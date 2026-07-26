/**
 * Permissive authorization stand-in tests — X-1.
 *
 * These tests serve an unusual purpose: they pin down the stand-in's DELIBERATE GAP as
 * well as what it enforces. The `orgUnitIds: 'ALL'` assertions are not endorsements — they
 * document a known, accepted limitation, so that when Unit 2 replaces the implementation
 * against the same interface, the tests that must CHANGE are visible in one place.
 *
 * If a future reader is surprised that a test asserts a permissive result, that is the
 * point: the gap is recorded, not hidden.
 */

import {
  PermissiveAuthorizationStandIn,
  STAND_IN_ENFORCEMENT_GAPS,
} from '../../src/core-domain/authorization-standin/authorization-standin';
import { ForbiddenError } from '../../src/shared/errors';
import type { AccessScope } from '../../src/shared/types/authorization';
import type { UserRole, VerifiedIdentity } from '../../src/shared/types/domain';

const authorization = new PermissiveAuthorizationStandIn();

function identity(role: UserRole, linkedMemberId: string | null = null): VerifiedIdentity {
  return {
    userAccountId: 'u-1',
    username: 'someone',
    role,
    homeOrgUnitId: 'ou-1',
    linkedMemberId,
    isActive: true,
  };
}

function scope(role: UserRole, ownMemberId: string | null = null): AccessScope {
  return { role, orgUnitIds: 'ALL', ownMemberId };
}

const ALL_ROLES: UserRole[] = [
  'ADMIN',
  'RESOURCE_MANAGER',
  'TEAM_LEAD',
  'TEAM_MEMBER',
  'EXECUTIVE',
];

describe('resolveScope', () => {
  it('DOES resolve the role', () => {
    for (const role of ALL_ROLES) {
      expect(authorization.resolveScope(identity(role)).role).toBe(role);
    }
  });

  it('carries the linked member id through, so own-data scoping is possible', () => {
    expect(authorization.resolveScope(identity('TEAM_MEMBER', 'm-1')).ownMemberId).toBe('m-1');
  });

  it('⚠️ does NOT apply org restriction — the documented X-1 gap (BR-R-05)', () => {
    // This assertion records an accepted limitation, NOT desired behaviour. Unit 2's real
    // component must resolve the home org unit and its subtree instead, and THIS TEST must
    // change when it does.
    for (const role of ALL_ROLES) {
      expect(authorization.resolveScope(identity(role)).orgUnitIds).toBe('ALL');
    }
  });

  it('names its own gaps so they are discoverable from code', () => {
    expect(STAND_IN_ENFORCEMENT_GAPS).toHaveLength(1);
    expect(STAND_IN_ENFORCEMENT_GAPS[0]).toContain('BR-R-05');
  });
});

/**
 * BR-R-04 IS enforced, even in the stand-in — the one privacy gap an ordinary user would
 * notice and be alarmed by.
 */
describe('toScopeFilter — TEAM_MEMBER own-data restriction IS enforced (BR-R-04)', () => {
  it('restricts a TEAM_MEMBER to their own member record', () => {
    const filter = authorization.toScopeFilter(scope('TEAM_MEMBER', 'm-1'));
    expect(filter.restrictToMemberId).toBe('m-1');
  });

  it('does not restrict other roles to a single member', () => {
    for (const role of ['ADMIN', 'RESOURCE_MANAGER', 'TEAM_LEAD', 'EXECUTIVE'] as const) {
      expect(authorization.toScopeFilter(scope(role, 'm-1')).restrictToMemberId).toBeNull();
    }
  });

  it('⚠️ leaves orgUnitIds permissive for every role (the X-1 gap)', () => {
    for (const role of ALL_ROLES) {
      expect(authorization.toScopeFilter(scope(role, 'm-1')).orgUnitIds).toBe('ALL');
    }
  });
});

/**
 * The hole the specification's `return true` leaves open, closed deliberately.
 */
describe('canRead — fails closed for an unlinked TEAM_MEMBER', () => {
  it('permits reads for a linked TEAM_MEMBER', () => {
    expect(authorization.canRead(scope('TEAM_MEMBER', 'm-1'), 'MEMBER', null)).toBe(true);
  });

  it('REFUSES an unlinked TEAM_MEMBER, who would otherwise see everything', () => {
    // With orgUnitIds 'ALL' and restrictToMemberId null, a permissive read would return
    // every member in the organisation. Failing closed is the only safe direction.
    expect(authorization.canRead(scope('TEAM_MEMBER', null), 'MEMBER', null)).toBe(false);
  });

  it('assertCanRead throws an actionable ForbiddenError for that case', () => {
    expect(() => authorization.assertCanRead(scope('TEAM_MEMBER', null), 'MEMBER', null)).toThrow(
      ForbiddenError,
    );
    expect(() => authorization.assertCanRead(scope('TEAM_MEMBER', null), 'MEMBER', null)).toThrow(
      /not linked/i,
    );
  });

  it('permits reads for every other role', () => {
    for (const role of ['ADMIN', 'RESOURCE_MANAGER', 'TEAM_LEAD', 'EXECUTIVE'] as const) {
      expect(authorization.canRead(scope(role, null), 'MEMBER', null)).toBe(true);
      expect(() => authorization.assertCanRead(scope(role, null), 'MEMBER', null)).not.toThrow();
    }
  });
});

/**
 * BR-R-01, BR-R-02, BR-R-03 — genuinely enforced, because they need no org-scope knowledge.
 */
describe('canWrite — role-level write rules ARE enforced', () => {
  it('permits ADMIN and RESOURCE_MANAGER (BR-R-01)', () => {
    expect(authorization.canWrite(scope('ADMIN'), 'MEMBER', null)).toBe(true);
    expect(authorization.canWrite(scope('RESOURCE_MANAGER'), 'ASSIGNMENT', null)).toBe(true);
  });

  it('refuses EXECUTIVE everywhere (BR-R-02)', () => {
    for (const resource of ['MEMBER', 'PROJECT', 'ASSIGNMENT', 'REFERENCE_DATA'] as const) {
      expect(authorization.canWrite(scope('EXECUTIVE'), resource, null)).toBe(false);
    }
  });

  it('refuses TEAM_LEAD, including assignments (BR-R-03)', () => {
    expect(authorization.canWrite(scope('TEAM_LEAD'), 'ASSIGNMENT', null)).toBe(false);
    expect(authorization.canWrite(scope('TEAM_LEAD'), 'MEMBER', null)).toBe(false);
  });

  it('refuses TEAM_MEMBER', () => {
    expect(authorization.canWrite(scope('TEAM_MEMBER', 'm-1'), 'MEMBER', null)).toBe(false);
  });

  it('assertCanWrite names the role so the message is actionable', () => {
    expect(() => authorization.assertCanWrite(scope('EXECUTIVE'), 'MEMBER', null)).toThrow(
      ForbiddenError,
    );
    expect(() => authorization.assertCanWrite(scope('EXECUTIVE'), 'MEMBER', null)).toThrow(
      /EXECUTIVE/,
    );
  });

  it('assertCanWrite does not throw for a permitted role', () => {
    expect(() => authorization.assertCanWrite(scope('ADMIN'), 'MEMBER', null)).not.toThrow();
  });

  it('is not affected by the resource or target, unlike the real component will be', () => {
    // Documents that this stand-in makes a role-only decision. The real component may
    // consider target org unit — which is why the interface accepts them now.
    expect(authorization.canWrite(scope('ADMIN'), 'IMPORT', { orgUnitId: 'ou-9', memberId: null })).toBe(
      true,
    );
    expect(
      authorization.canWrite(scope('TEAM_LEAD'), 'IMPORT', { orgUnitId: 'ou-1', memberId: 'm-1' }),
    ).toBe(false);
  });
});

/**
 * BR-R-06: decisions derive from the server-resolved session, never from client input. This
 * holds BY CONSTRUCTION — the only entry point takes a VerifiedIdentity, which can only be
 * produced by credential verification.
 */
describe('BR-R-06 — decisions come from the resolved identity', () => {
  it('exposes no way to supply a role directly to a decision', () => {
    // canRead/canWrite take an AccessScope, and the only sanctioned way to obtain one is
    // resolveScope(identity). This test documents that shape rather than probing behaviour.
    const resolved = authorization.resolveScope(identity('TEAM_MEMBER', 'm-1'));
    expect(resolved.role).toBe('TEAM_MEMBER');
    expect(resolved.ownMemberId).toBe('m-1');
  });
});
