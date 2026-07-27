/**
 * Session persistence.
 *
 * SECURITY (BR-AU-09): only the HASH of a session token is stored, never the token.
 * A stolen database dump therefore does not yield usable sessions. Consequences that
 * shape this interface:
 *
 *   - `create` accepts a `tokenHash`, never a token. Hashing happens in the session
 *     component, so a plaintext token never reaches this layer at all.
 *   - Lookup is BY HASH (`findActiveByTokenHash`), because the hash is the only form the
 *     database holds. There is deliberately no `findByToken`.
 *   - `toSession` omits `token_hash`, so the hash cannot travel upward into a response
 *     or a log line even by accident.
 *
 * Sessions are terminated by setting `terminated_at`, not by deleting the row, so an
 * expired or revoked session remains distinguishable from one that never existed.
 */

import type { DbOrTx } from './db';
import type { Session, SessionId, UserAccountId } from '../types/domain';
import { toSession } from './mappers';
import { withPgErrors } from './pg-errors';

export interface SessionCreate {
  /** Hash of the opaque token. NEVER the token itself. */
  tokenHash: string;
  userAccountId: UserAccountId;
  expiresAt: Date;
}

/** A live session paired with the account it authenticates. */
export interface ActiveSession {
  session: Session;
  userAccountId: UserAccountId;
}

export class SessionRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: SessionCreate): Promise<Session> {
    return withPgErrors(async () => {
      const row = await this.db
        .insertInto('session')
        .values({
          token_hash: input.tokenHash,
          user_account_id: input.userAccountId,
          expires_at: input.expiresAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toSession(row);
    });
  }

  /**
   * The authentication hot path: resolve a presented token's hash to a live session.
   *
   * "Live" means not terminated AND not expired, both checked IN the query at the
   * database's clock rather than in application code. Filtering here means an expired
   * session is never loaded into a request context in the first place — a check done
   * after the fetch is one a later refactor can drop, and the failure would be silent
   * acceptance of dead sessions.
   *
   * `now` is passed in rather than read from the clock here so the caller controls the
   * instant and the behaviour is testable.
   */
  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<ActiveSession | null> {
    const row = await this.db
      .selectFrom('session')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .where('terminated_at', 'is', null)
      .where('expires_at', '>', now)
      .executeTakeFirst();
    return row ? { session: toSession(row), userAccountId: row.user_account_id } : null;
  }

  /**
   * Sliding-expiry touch (BR-AU-07). Returns false when the session is no longer live,
   * so a caller cannot extend a session that expired between resolution and update.
   */
  async touch(id: SessionId, lastSeenAt: Date, expiresAt: Date): Promise<boolean> {
    const result = await this.db
      .updateTable('session')
      .set({ last_seen_at: lastSeenAt, expires_at: expiresAt })
      .where('id', '=', id)
      .where('terminated_at', 'is', null)
      .where('expires_at', '>', lastSeenAt)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  /** Logout. Idempotent: terminating an already-terminated session returns false. */
  async terminate(id: SessionId, terminatedAt: Date): Promise<boolean> {
    const result = await this.db
      .updateTable('session')
      .set({ terminated_at: terminatedAt })
      .where('id', '=', id)
      .where('terminated_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  /**
   * Terminate every live session for an account. Called when an account is deactivated
   * or its password changes — otherwise a session issued before the change would keep
   * working, and deactivation would not actually lock anyone out until their session
   * happened to expire.
   */
  async terminateAllForUser(
    userAccountId: UserAccountId,
    terminatedAt: Date,
  ): Promise<number> {
    const result = await this.db
      .updateTable('session')
      .set({ terminated_at: terminatedAt })
      .where('user_account_id', '=', userAccountId)
      .where('terminated_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** Live sessions for an account, newest first. No token hashes (see `toSession`). */
  async findActiveForUser(userAccountId: UserAccountId, now: Date): Promise<Session[]> {
    const rows = await this.db
      .selectFrom('session')
      .selectAll()
      .where('user_account_id', '=', userAccountId)
      .where('terminated_at', 'is', null)
      .where('expires_at', '>', now)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toSession);
  }

  /**
   * Housekeeping: physically remove sessions that expired before `before`.
   *
   * This is the one place a session row is deleted, and it is safe because an expired
   * session carries no remaining authority — the retained audit trail lives in
   * `assignment_history` and references user accounts, which are never deleted.
   */
  async deleteExpiredBefore(before: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('session')
      .where('expires_at', '<', before)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
