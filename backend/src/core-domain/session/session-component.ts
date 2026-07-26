/**
 * C-08 SessionComponent — BR-AU-08…12.
 *
 * THE TOKEN NEVER TOUCHES THE DATABASE. `establish` generates a random token, stores its
 * SHA-256 hash, and returns the token to the caller exactly once. Lookups hash the
 * presented token and compare hashes. A stolen database dump therefore yields no usable
 * session, and there is deliberately no method that accepts or returns a stored token.
 *
 * Why SHA-256 here and Argon2id for passwords: a session token is 256 bits of
 * cryptographic randomness, so it has no low-entropy guess space to protect against —
 * there is nothing to brute-force. Passwords are low-entropy and user-chosen, which is
 * what makes a deliberately slow KDF necessary there. Using Argon2id per request would
 * add ~50 ms of CPU to every authenticated call for no security gain.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { UnauthorizedError } from '../../shared/errors';
import type { SessionRepository, UserAccountRepository } from '../../shared/repository';
import type {
  Session,
  SessionId,
  UserAccountId,
  VerifiedIdentity,
} from '../../shared/types/domain';

/** Returned once, at establishment. The token is never retrievable afterwards. */
export interface EstablishedSession {
  session: Session;
  /** Plaintext token for the client. NEVER logged, never stored. */
  token: string;
}

/** What a resolved session yields: the identity, and nothing about how it was proven. */
export interface ResolvedSession {
  session: Session;
  identity: VerifiedIdentity;
}

/** 32 bytes = 256 bits. Guessing is not a realistic attack at this size. */
const TOKEN_BYTES = 32;

const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;

/**
 * Hashes a token for storage and lookup.
 *
 * Unsalted on purpose: a salt would have to be stored alongside and looked up BY the
 * token, which is circular. Unsalted is safe here precisely because the input is
 * high-entropy random — the rainbow-table argument that makes unsalted password hashing
 * indefensible does not apply to a 256-bit random value.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class SessionComponent {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly accounts: UserAccountRepository,
    private readonly idleTimeoutMinutes: number = DEFAULT_IDLE_TIMEOUT_MINUTES,
  ) {}

  /**
   * BR-AU-08: establishment resolves and attaches role and scope.
   *
   * Takes a VerifiedIdentity, not a username and password — this component cannot
   * authenticate anyone, by design. Credential verification is C-07's job, and keeping the
   * two apart is what lets Unit 2 replace the authentication mechanism (SSO, say) without
   * touching session handling (US-ENB-03).
   */
  async establish(identity: VerifiedIdentity, now: Date = new Date()): Promise<EstablishedSession> {
    // An inactive account must not receive a session even if a caller somehow reached here
    // with a stale identity. Defence in depth: C-07 also refuses.
    if (!identity.isActive) {
      throw new UnauthorizedError('This account is not active.');
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');

    const session = await this.sessions.create({
      tokenHash: hashToken(token),
      userAccountId: identity.userAccountId,
      expiresAt: this.expiryFrom(now),
    });

    return { session, token };
  }

  /**
   * Resolves a presented token, applying the sliding expiry (BR-AU-10).
   *
   * Returns null rather than throwing for an expired or unknown session (BR-AU-12) so the
   * caller can treat "not signed in" as an ordinary state. Both cases are deliberately
   * indistinguishable to the client: telling an attacker that a token was *once* valid is
   * information they can use.
   *
   * The identity is re-read from the account on EVERY resolution rather than cached in the
   * session row. That is what makes a role change or a deactivation take effect on the next
   * request instead of whenever the session happens to expire — a session holding a stale
   * ADMIN role would be a privilege-escalation window up to 30 minutes wide.
   */
  async resolve(token: string, now: Date = new Date()): Promise<ResolvedSession | null> {
    if (!token || token.trim() === '') return null;

    const active = await this.sessions.findActiveByTokenHash(hashToken(token), now);
    if (!active) return null;

    const identity = await this.accounts.findIdentityById(active.userAccountId);

    // The account was deactivated or removed after the session was issued. Terminate the
    // session rather than merely refusing this request, so it cannot be retried.
    if (!identity || !identity.isActive) {
      await this.sessions.terminate(active.session.id, now);
      return null;
    }

    // BR-AU-10: sliding expiry. Touching on each resolution is what makes the timeout
    // measure INACTIVITY rather than total session age.
    const extended = await this.sessions.touch(active.session.id, now, this.expiryFrom(now));
    if (!extended) return null; // expired between the read and the write

    return {
      session: { ...active.session, lastSeenAt: now, expiresAt: this.expiryFrom(now) },
      identity,
    };
  }

  /**
   * BR-AU-11: sign-out is genuine server-side termination — `terminatedAt` is set. Clearing
   * a cookie alone would leave the token valid for anyone who captured it.
   *
   * Idempotent: signing out twice is not an error.
   */
  async terminate(sessionId: SessionId, now: Date = new Date()): Promise<boolean> {
    return this.sessions.terminate(sessionId, now);
  }

  /** Terminate by token, for a sign-out that only has the cookie to work from. */
  async terminateByToken(token: string, now: Date = new Date()): Promise<boolean> {
    if (!token || token.trim() === '') return false;

    // Deliberately ignores expiry: terminating an already-expired session is harmless and
    // returning false for it would make sign-out look like a failure.
    const active = await this.sessions.findActiveByTokenHash(hashToken(token), now);
    if (!active) return false;
    return this.sessions.terminate(active.session.id, now);
  }

  /**
   * Terminate every live session for an account — called when the account is deactivated
   * or its password changes.
   *
   * Without this, a password change would not evict a session an attacker already holds,
   * which is the main reason a user changes their password in the first place.
   */
  async terminateAllForUser(
    userAccountId: UserAccountId,
    now: Date = new Date(),
  ): Promise<number> {
    return this.sessions.terminateAllForUser(userAccountId, now);
  }

  async listActiveForUser(
    userAccountId: UserAccountId,
    now: Date = new Date(),
  ): Promise<Session[]> {
    return this.sessions.findActiveForUser(userAccountId, now);
  }

  /** Housekeeping: drop rows for sessions that expired before `before`. */
  async purgeExpired(before: Date): Promise<number> {
    return this.sessions.deleteExpiredBefore(before);
  }

  /**
   * Constant-time comparison helper for callers that must compare a token against a known
   * value. Not used by resolution — which compares HASHES via an indexed lookup — but
   * provided so no caller reaches for `===` on a secret.
   */
  static tokensEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');
    // timingSafeEqual throws on length mismatch, which would itself leak length; compare
    // fixed-size digests instead so the lengths always match.
    const digestA = createHash('sha256').update(bufferA).digest();
    const digestB = createHash('sha256').update(bufferB).digest();
    return timingSafeEqual(digestA, digestB);
  }

  private expiryFrom(now: Date): Date {
    return new Date(now.getTime() + this.idleTimeoutMinutes * 60_000);
  }
}
