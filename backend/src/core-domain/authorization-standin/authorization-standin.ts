/**
 * PERMISSIVE AUTHORIZATION STAND-IN — X-1. TEMPORARY. TO BE DELETED.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────────┐
 * │ ⚠️  THIS IS NOT THE REAL AUTHORIZATION COMPONENT.                                  │
 * │                                                                                    │
 * │ While `core-domain` is the only completed unit, a TEAM_LEAD or RESOURCE_MANAGER    │
 * │ can see members, projects and allocations across ALL org units. Org-scope          │
 * │ visibility (BR-R-05) is NOT enforced here.                                        │
 * │                                                                                    │
 * │ Acceptable ONLY under the single-track, no-external-users assumption (unit plan    │
 * │ Q7:A). If pilot users get access before `supporting-platform` completes, either    │
 * │ switch this to a restrictive stand-in or pull C-09 into Unit 1.                    │
 * └────────────────────────────────────────────────────────────────────────────────────┘
 *
 * WHY A STAND-IN AT ALL. Unit 1's components need an authorization interface to call, but
 * the real policy component belongs to Unit 2. Building against a stand-in behind the FINAL
 * interface means Unit 2 replaces only the implementation — no Unit 1 call site changes.
 *
 * THE INTERFACE IS FIXED. `IAuthorizationComponent` lives in `shared/types/authorization.ts`,
 * owned by neither unit. If Unit 2 needs to WIDEN it, every Unit 1 call site changes with
 * it — which is exactly the rework this pattern exists to prevent, and would be a Unit 1
 * design defect rather than a Unit 2 one.
 *
 * REPLACEMENT PROCEDURE (business-logic-model.md §11):
 *   1. Implement C-09 at `backend/src/supporting-platform/authorization/` against the
 *      unchanged interface.
 *   2. Repoint the composition root from this class to the real one.
 *   3. DELETE THIS DIRECTORY ENTIRELY. A stand-in left in the tree is a stand-in that gets
 *      wired up again by accident.
 *   4. Verify no Unit 1 caller changed. If any did, the interface was incomplete.
 */

import { ForbiddenError } from '../../shared/errors';
import type {
  AccessScope,
  IAuthorizationComponent,
  ResourceKind,
  ScopeFilter,
  TargetRef,
} from '../../shared/types/authorization';
import type { UserRole, VerifiedIdentity } from '../../shared/types/domain';

/**
 * BR-R-01: write is permitted only for ADMIN and RESOURCE_MANAGER.
 * BR-R-02: EXECUTIVE is offered no write action anywhere.
 * BR-R-03: TEAM_LEAD cannot modify assignments — and here, cannot write at all.
 *
 * These three ARE enforced by the stand-in, because they are role-level rules needing no
 * org-scope knowledge. Only the org-scope rules are deferred.
 */
const WRITE_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(['ADMIN', 'RESOURCE_MANAGER']);

export class PermissiveAuthorizationStandIn implements IAuthorizationComponent {
  /**
   * The role IS resolved; the org restriction is NOT applied.
   *
   * `orgUnitIds: 'ALL'` is the gap, stated in one place rather than scattered through the
   * call sites. `ownMemberId` is carried so `toScopeFilter` can honour the TEAM_MEMBER
   * restriction below.
   */
  resolveScope(identity: VerifiedIdentity): AccessScope {
    return {
      role: identity.role,
      // ⚠️ THE GAP: the real component resolves this from the user's home org unit and its
      // subtree (OrgUnitComponent.resolveScope already computes exactly that — it is
      // deliberately NOT called here, because Q6:A defines the stand-in as permissive and
      // silently half-enforcing would be worse than a documented gap).
      orgUnitIds: 'ALL',
      ownMemberId: identity.linkedMemberId,
    };
  }

  /**
   * BR-R-04 IS ENFORCED, even in the stand-in.
   *
   * A deliberate choice within Q6:A: US-VIS-04's criterion is "no other member's
   * assignments are reachable to me by any route", and that is the one gap an ORDINARY user
   * would see and be alarmed by — a team member glimpsing colleagues' allocations reads as
   * a privacy breach, whereas a manager seeing another department's data reads as a
   * configuration quirk. `restrictToMemberId` costs nothing to honour, so it is honoured.
   *
   * A TEAM_MEMBER with NO linked member record gets `restrictToMemberId: null` — which
   * under `orgUnitIds: 'ALL'` would mean unrestricted. That combination is refused by
   * `canRead` below rather than being allowed to fall through, because failing closed on a
   * misconfigured account is the only safe direction.
   */
  toScopeFilter(scope: AccessScope): ScopeFilter {
    if (scope.role === 'TEAM_MEMBER') {
      return { orgUnitIds: 'ALL', restrictToMemberId: scope.ownMemberId };
    }
    return { orgUnitIds: 'ALL', restrictToMemberId: null };
  }

  /**
   * Permissive by specification — with one exception.
   *
   * A TEAM_MEMBER whose account is not linked to a member record has no own-data to be
   * scoped to, so permitting the read would give them EVERYTHING. Q6:A's `return true`
   * assumes a linked team member; this closes the hole that assumption leaves, and the real
   * component must keep refusing it.
   */
  canRead(scope: AccessScope, _resource: ResourceKind, _target: TargetRef | null): boolean {
    if (scope.role === 'TEAM_MEMBER' && scope.ownMemberId === null) return false;
    return true;
  }

  /** BR-R-01/02/03: role-level write restriction, genuinely enforced. */
  canWrite(scope: AccessScope, _resource: ResourceKind, _target: TargetRef | null): boolean {
    return WRITE_ROLES.has(scope.role);
  }

  assertCanRead(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void {
    if (!this.canRead(scope, resource, target)) {
      throw new ForbiddenError(
        'This account is not linked to a team member record, so there is nothing it can view. ' +
          'Ask an administrator to link it.',
      );
    }
  }

  assertCanWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void {
    if (!this.canWrite(scope, resource, target)) {
      // Names the role so the message is actionable, without revealing which roles exist
      // beyond the caller's own.
      throw new ForbiddenError(
        `The ${scope.role} role cannot make changes here. Ask an administrator or resource manager.`,
      );
    }
  }
}

/**
 * What this stand-in does and does not enforce. Kept in code, not only in the design docs,
 * so it is visible to whoever next reads the file.
 *
 * | Rule                                             | Stand-in       |
 * |--------------------------------------------------|----------------|
 * | BR-R-01 write only ADMIN / RESOURCE_MANAGER      | ENFORCED       |
 * | BR-R-02 EXECUTIVE read-only                      | ENFORCED       |
 * | BR-R-03 TEAM_LEAD cannot modify assignments      | ENFORCED       |
 * | BR-R-04 TEAM_MEMBER sees only own data           | ENFORCED       |
 * | BR-R-05 TEAM_LEAD / RM confined to own org unit  | **NOT enforced** |
 * | BR-R-06 decisions from server-resolved session   | ENFORCED (by construction) |
 * | BR-R-07 scope filters applied inside queries     | Mechanism present, filter permissive |
 */
export const STAND_IN_ENFORCEMENT_GAPS = [
  'BR-R-05: TEAM_LEAD and RESOURCE_MANAGER are NOT confined to their own org unit.',
] as const;
