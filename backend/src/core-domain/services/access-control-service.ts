/**
 * S-02 AccessControlService — a thin wrapper over the authorization component.
 *
 * MINIMAL BY DESIGN. S-02 is fully implemented in Unit 2; this exists so that every Unit 1
 * service depends on a service-layer seam rather than reaching for the stand-in directly.
 * When Unit 2 replaces C-09, only the constructor argument here changes.
 *
 * BR-R-06: the scope is derived from a server-resolved `VerifiedIdentity` and NEVER from
 * client input. That is enforced by shape — there is no method here that accepts a role, an
 * org unit list, or a member id from a caller.
 */

import type {
  AccessScope,
  IAuthorizationComponent,
  ResourceKind,
  ScopeFilter,
  TargetRef,
} from '../../shared/types/authorization';
import type { VerifiedIdentity } from '../../shared/types/domain';

export class AccessControlService {
  constructor(private readonly authorization: IAuthorizationComponent) {}

  scopeFor(identity: VerifiedIdentity): AccessScope {
    return this.authorization.resolveScope(identity);
  }

  filterFor(scope: AccessScope): ScopeFilter {
    return this.authorization.toScopeFilter(scope);
  }

  /** Convenience for the common path: identity in, query filter out. */
  filterForIdentity(identity: VerifiedIdentity): ScopeFilter {
    return this.authorization.toScopeFilter(this.authorization.resolveScope(identity));
  }

  requireRead(scope: AccessScope, resource: ResourceKind, target: TargetRef | null = null): void {
    this.authorization.assertCanRead(scope, resource, target);
  }

  requireWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null = null): void {
    this.authorization.assertCanWrite(scope, resource, target);
  }

  canWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null = null): boolean {
    return this.authorization.canWrite(scope, resource, target);
  }
}
