/**
 * S-01 AuthService — sign-in, sign-out, session inspection. US-ACC-01, 02, 03.
 *
 * ORCHESTRATION ONLY. Credential verification belongs to C-07 and session handling to C-08;
 * this service composes them and owns the cross-component rules that neither can enforce
 * alone. Keeping them separate is what lets Unit 2 swap the authentication mechanism (SSO,
 * say) without touching session handling (US-ENB-03).
 */

import { UnauthorizedError } from '../../shared/errors';
import type { AccessScope } from '../../shared/types/authorization';
import type { UserAccountId, VerifiedIdentity } from '../../shared/types/domain';
import { IdentityComponent } from '../identity/identity-component';
import type { SessionComponent } from '../session/session-component';
import type { AccessControlService } from './access-control-service';

export interface SignInResult {
  token: string;
  sessionId: string;
  identity: VerifiedIdentity;
  scope: AccessScope;
}

export interface CurrentSession {
  identity: VerifiedIdentity;
  scope: AccessScope;
  sessionId: string;
  expiresAt: Date;
}

export class AuthService {
  constructor(
    private readonly identityComponent: IdentityComponent,
    private readonly sessions: SessionComponent,
    private readonly accessControl: AccessControlService,
  ) {}

  /**
   * US-ACC-01 / US-ACC-03.
   *
   * A failed verification throws UnauthorizedError with the SINGLE rejection message
   * (BR-AU-04) — the caller must not be able to tell a wrong password from an unknown
   * username. C-07 returns null for both, and this is where that null becomes the response.
   */
  async signIn(username: string, plainPassword: string): Promise<SignInResult> {
    const identity = await this.identityComponent.verifyCredentials(username, plainPassword);
    if (!identity) {
      throw new UnauthorizedError(IdentityComponent.rejectionMessage());
    }

    const { session, token } = await this.sessions.establish(identity);

    // BR-AU-08: role and scope resolved at establishment, from the verified identity.
    return {
      token,
      sessionId: session.id,
      identity,
      scope: this.accessControl.scopeFor(identity),
    };
  }

  /**
   * US-ACC-02. Genuine server-side termination (BR-AU-11) — returning true for a token that
   * was already dead would be a lie, but it is also not an error, so `false` simply means
   * "there was nothing live to end".
   */
  async signOut(token: string): Promise<boolean> {
    return this.sessions.terminateByToken(token);
  }

  /**
   * Resolves a presented token for the session middleware.
   *
   * Returns null rather than throwing so the middleware can treat "not signed in" as an
   * ordinary state for unauthenticated routes.
   */
  async currentSession(token: string): Promise<CurrentSession | null> {
    const resolved = await this.sessions.resolve(token);
    if (!resolved) return null;

    return {
      identity: resolved.identity,
      scope: this.accessControl.scopeFor(resolved.identity),
      sessionId: resolved.session.id,
      expiresAt: resolved.session.expiresAt,
    };
  }

  /**
   * Changing a password terminates every OTHER live session for that account.
   *
   * Without this, a password change would not evict a session an attacker already holds —
   * which is usually the reason the password is being changed.
   */
  async changePassword(
    userAccountId: UserAccountId,
    plainPassword: string,
  ): Promise<{ terminatedSessions: number }> {
    await this.identityComponent.setPassword(userAccountId, plainPassword);
    const terminatedSessions = await this.sessions.terminateAllForUser(userAccountId);
    return { terminatedSessions };
  }

  /** Deactivating an account must also lock out its live sessions immediately. */
  async deactivateAccount(userAccountId: UserAccountId): Promise<{ terminatedSessions: number }> {
    await this.identityComponent.deactivateAccount(userAccountId);
    const terminatedSessions = await this.sessions.terminateAllForUser(userAccountId);
    return { terminatedSessions };
  }
}
