/**
 * C-09 AuthorizationComponent — the REAL implementation. This is the X-1 resolution.
 *
 * Replaces `core-domain/authorization-standin/`, which is DELETED. Implements the UNCHANGED
 * `IAuthorizationComponent`; no Unit 1 service call site changes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────┐
 * │ THIS FILE IS THE ENFORCEMENT POINT FOR FR-R-08.                                      │
 * │ Every authorization decision in the application is made here or by a scope filter    │
 * │ derived from here. There are 22 enforcement paths (business-logic-model.md §3) and    │
 * │ all of them route through this class.                                                │
 * └──────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ DEFECT U1-D01 AND ITS CONSEQUENCE. `resolveScope` is SYNCHRONOUS in the FINAL interface,
 * but BR-R-08 needs the home org unit's children and BR-R-09 needs to know whether the home
 * unit is a root — both database reads. Rather than make the interface async (90 call sites
 * across 7 Unit 1 services), `AccessScope.orgUnitIds` carries the scope ROOTS and the
 * subtree expansion happens inside SQL via `orgScopeMatches`. See
 * `code/DEFECT-U1-D01-authorization-interface.md`.
 *
 * The one thing that decision cost: BR-R-09's "is the home unit a root?" test also cannot run
 * here. It is resolved by `rootOrgUnitIds`, a set loaded ONCE AT STARTUP and passed in — see
 * the note on that field below, which is the honest account of its staleness window.
 */

import { ForbiddenError } from '../../shared/errors';
import type {
  AccessScope,
  IAuthorizationComponent,
  ResourceKind,
  ScopeFilter,
  TargetRef,
} from '../../shared/types/authorization';
import type { OrgUnitId, VerifiedIdentity } from '../../shared/types/domain';
import { assertMatrixIsExhaustive, permissionFor } from './permission-matrix';

export class AuthorizationComponent implements IAuthorizationComponent {
  /**
   * Ids of TOP-LEVEL org units (`parent_org_unit_id IS NULL`), for BR-R-09 only.
   *
   * ⚠️ HONEST LIMITATION, and the one piece of state in this class. N-Q1:A chose NOT to cache
   * scope, and this is not that — it is the set of ROOT UNIT IDS, needed because a synchronous
   * `resolveScope` cannot read `parent_org_unit_id` (defect U1-D01).
   *
   * STALENESS WINDOW: if a NEW root org unit is created after startup, a Resource Manager
   * attached to it resolves to their subtree rather than to 'ALL' until the process restarts.
   * That direction is deliberate — it under-grants, never over-grants. A stale entry cannot
   * widen anyone's access, only narrow it, so the failure mode is "I cannot see something I
   * should" rather than "I can see something I should not".
   *
   * ⚠️ NOTHING REFRESHES THIS AUTOMATICALLY IN PHASE 1. It is loaded once in `server.ts` at
   * startup. `setRootOrgUnitIds` exists and is tested, but wiring it into the org-unit write
   * path would mean modifying Unit 1's org-unit service — which the approved plan's Step 4
   * check ("only `services/index.ts` changes under `core-domain/`") exists to prevent.
   *
   * CONSEQUENCE, stated so it is not discovered later: create a NEW ROOT org unit and attach a
   * Resource Manager to it, and that manager sees their subtree rather than the whole
   * organisation UNTIL THE PROCESS RESTARTS. Recorded as an accepted gap; the org tree is
   * created once during setup and root units are not routinely added.
   */
  private rootOrgUnitIds: ReadonlySet<OrgUnitId>;

  constructor(rootOrgUnitIds: readonly OrgUnitId[] = []) {
    // U2-NFR-R-06: a misconfigured matrix fails at STARTUP, not at the first request that
    // happens to touch the missing cell.
    assertMatrixIsExhaustive();
    this.rootOrgUnitIds = new Set(rootOrgUnitIds);
  }

  /** Called after any org-unit create/delete so BR-R-09 stays current. */
  setRootOrgUnitIds(ids: readonly OrgUnitId[]): void {
    this.rootOrgUnitIds = new Set(ids);
  }

  /**
   * Session identity -> authorization context. BR-R-06: derived ONLY from the server-resolved
   * identity. Nothing here reads a request body, query parameter, header or cookie.
   */
  resolveScope(identity: VerifiedIdentity): AccessScope {
    const role = identity.role;
    const ownMemberId = identity.linkedMemberId;
    const home = identity.homeOrgUnitId;

    switch (role) {
      // BR-R-10: unrestricted. EXECUTIVE is held read-only by the matrix, not by scope.
      case 'ADMIN':
      case 'EXECUTIVE':
        return { role, orgUnitIds: 'ALL', ownMemberId };

      // BR-R-09 (CQ2:B): organisation-wide when rooted at a top-level unit, subtree otherwise.
      // NOT `subtree(root)` — those differ the moment a second root unit exists, and 'ALL'
      // stays correct where an expanded list would silently omit the new unit.
      case 'RESOURCE_MANAGER': {
        if (home === null) return { role, orgUnitIds: [], ownMemberId }; // BR-R-11
        if (this.rootOrgUnitIds.has(home)) return { role, orgUnitIds: 'ALL', ownMemberId };
        return { role, orgUnitIds: [home], ownMemberId };
      }

      // BR-R-08: home unit plus its children. `[home]` is the ROOT of the scope; the children
      // are added inside SQL by `orgScopeMatches` (defect U1-D01).
      case 'TEAM_LEAD': {
        if (home === null) return { role, orgUnitIds: [], ownMemberId }; // BR-R-11
        return { role, orgUnitIds: [home], ownMemberId };
      }

      // BR-R-04: narrowed by member, not by org unit. See toScopeFilter for why 'ALL' here is
      // correct rather than sloppy.
      case 'TEAM_MEMBER':
        return { role, orgUnitIds: 'ALL', ownMemberId };
    }
  }

  /**
   * BR-R-04. A TEAM_MEMBER keeps `orgUnitIds: 'ALL'` deliberately: `restrictToMemberId` is
   * strictly narrower than any org filter, so ANDing an org restriction on top is dead weight —
   * and a team member whose linked member record sits OUTSIDE their own `home_org_unit_id`
   * would otherwise be unable to see themselves.
   *
   * The unlinked TEAM_MEMBER case is refused by `canRead` (BR-R-18) rather than being allowed
   * to fall through here as `restrictToMemberId: null`, which under 'ALL' would mean
   * unrestricted — the single most dangerous combination in this file.
   */
  toScopeFilter(scope: AccessScope): ScopeFilter {
    if (scope.role === 'TEAM_MEMBER') {
      return { orgUnitIds: 'ALL', restrictToMemberId: scope.ownMemberId };
    }
    return { orgUnitIds: scope.orgUnitIds, restrictToMemberId: null };
  }

  canRead(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): boolean {
    // BR-R-18: an unlinked TEAM_MEMBER has no own-data to be scoped to, so permitting the read
    // would grant EVERYTHING. Fail closed on a misconfigured account.
    if (scope.role === 'TEAM_MEMBER' && scope.ownMemberId === null) return false;
    if (!permissionFor(scope.role, resource).read) return false;
    return this.targetInScope(scope, target);
  }

  canWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): boolean {
    // No TEAM_MEMBER-unlinked check here, deliberately: TEAM_MEMBER writes nothing in the
    // matrix, so the guard would be unreachable — and an unreachable guard reads as a live one.
    if (!permissionFor(scope.role, resource).write) return false;
    return this.targetInScope(scope, target);
  }

  /**
   * ⚠️ THIS METHOD DELIBERATELY DECIDES ALMOST NOTHING. Read this before adding to it.
   *
   * A synchronous component cannot decide whether a specific record is in scope (defect
   * U1-D01): it would need the org-unit subtree, which requires a query. Every per-record
   * decision is therefore made by the SCOPE-FILTERED QUERY (BR-R-07) — the design's
   * `business-logic-model.md` §2.4 says exactly this, and calls the repository "the last line,
   * and it holds".
   *
   * TWO BUGS LIVED HERE AND WERE CAUGHT BY UNIT 1'S OWN TESTS. Both came from trying to decide
   * per-record access here anyway:
   *
   *   1. Refusing a TEAM_MEMBER whose target was another member produced **403** on
   *      `/api/assignments?memberId=<other>` and on another member's timeline. Those are
   *      COLLECTION reads that the design protects with `restrictToMemberId` inside the query,
   *      yielding 200 + `[]`. A 403 also contradicts BR-R-16, which chose 404-not-403 precisely
   *      so a refusal cannot confirm that a record exists.
   *   2. Comparing `target.orgUnitId` against `scope.orgUnitIds` refused legitimate access,
   *      because after U1-D01 those ids are scope ROOTS and do not include children. A TEAM_LEAD
   *      reading a member in a CHILD unit would have been refused — a pre-check that wrongly
   *      denies is worse than no pre-check, because it breaks access the SQL would have allowed.
   *
   * What remains is only what can be decided correctly WITHOUT I/O.
   */
  private targetInScope(scope: AccessScope, target: TargetRef | null): boolean {
    if (target === null) return true;

    // BR-R-11 / BR-R-17: an empty root list permits NOTHING, so refusing here cannot wrongly
    // deny anything the query would have allowed — the query returns nothing either way. This
    // is the one org-scope decision that is safe to make synchronously, and it fails closed.
    if (scope.orgUnitIds !== 'ALL' && scope.orgUnitIds.length === 0) return false;

    // Everything else defers to the scope-filtered query. Note this reads `ownMemberId` from
    // `AccessScope`, never `restrictToMemberId` — that field is on `ScopeFilter`, the query-side
    // projection. An earlier draft referenced it here and `tsc` caught it.
    return true;
  }

  assertCanRead(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void {
    if (this.canRead(scope, resource, target)) return;

    if (scope.role === 'TEAM_MEMBER' && scope.ownMemberId === null) {
      throw new ForbiddenError(
        'This account is not linked to a team member record, so there is nothing it can view. ' +
          'Ask an administrator to link it.',
      );
    }
    if (scope.orgUnitIds !== 'ALL' && scope.orgUnitIds.length === 0) {
      throw new ForbiddenError(
        'This account is not assigned to an organisational unit, so it cannot see any data. ' +
          'Ask an administrator to assign one.',
      );
    }
    throw new ForbiddenError(`The ${scope.role} role cannot view this.`);
  }

  assertCanWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void {
    if (this.canWrite(scope, resource, target)) return;

    if (!permissionFor(scope.role, resource).write) {
      // Names the caller's own role so the message is actionable, without revealing which
      // other roles exist or what they can do.
      throw new ForbiddenError(
        `The ${scope.role} role cannot make changes here. Ask an administrator or resource manager.`,
      );
    }
    throw new ForbiddenError('That record is outside the organisational units you manage.');
  }
}
