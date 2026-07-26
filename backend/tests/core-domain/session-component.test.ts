/**
 * C-08 SessionComponent tests — BR-AU-08…12.
 *
 * The property that matters most: the token is never stored. Everything else follows from
 * it, so several tests assert the absence of the token rather than the presence of a value.
 *
 * `now` is injected throughout, which is what makes the sliding-expiry behaviour testable
 * without sleeping for 30 minutes.
 */

import { SessionComponent, hashToken } from '../../src/core-domain/session/session-component';
import { UnauthorizedError } from '../../src/shared/errors';
import type { SessionRepository, UserAccountRepository } from '../../src/shared/repository';
import type { Session, VerifiedIdentity } from '../../src/shared/types/domain';

const IDENTITY: VerifiedIdentity = {
  userAccountId: 'u-1',
  username: 'admin',
  role: 'ADMIN',
  homeOrgUnitId: null,
  linkedMemberId: null,
  isActive: true,
};

interface StoredSession {
  id: string;
  tokenHash: string;
  userAccountId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  terminatedAt: Date | null;
}

interface Harness {
  component: SessionComponent;
  stored: StoredSession[];
  identities: VerifiedIdentity[];
}

/** Mirrors the real repository: `toSession` omits token_hash. */
function publicView(row: StoredSession): Session {
  return {
    id: row.id,
    userAccountId: row.userAccountId,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    terminatedAt: row.terminatedAt,
  };
}

function setup(identities: VerifiedIdentity[] = [IDENTITY], idleMinutes = 30): Harness {
  const stored: StoredSession[] = [];
  const known = identities.map((i) => ({ ...i }));

  const sessionRepo = {
    create: async (input: { tokenHash: string; userAccountId: string; expiresAt: Date }) => {
      const row: StoredSession = {
        id: `s-${stored.length + 1}`,
        tokenHash: input.tokenHash,
        userAccountId: input.userAccountId,
        createdAt: new Date('2026-01-01T09:00:00.000Z'),
        lastSeenAt: new Date('2026-01-01T09:00:00.000Z'),
        expiresAt: input.expiresAt,
        terminatedAt: null,
      };
      stored.push(row);
      return publicView(row);
    },
    findActiveByTokenHash: async (tokenHash: string, now: Date) => {
      const row = stored.find(
        (s) => s.tokenHash === tokenHash && s.terminatedAt === null && s.expiresAt > now,
      );
      return row ? { session: publicView(row), userAccountId: row.userAccountId } : null;
    },
    touch: async (id: string, lastSeenAt: Date, expiresAt: Date) => {
      const row = stored.find(
        (s) => s.id === id && s.terminatedAt === null && s.expiresAt > lastSeenAt,
      );
      if (!row) return false;
      row.lastSeenAt = lastSeenAt;
      row.expiresAt = expiresAt;
      return true;
    },
    terminate: async (id: string, terminatedAt: Date) => {
      const row = stored.find((s) => s.id === id && s.terminatedAt === null);
      if (!row) return false;
      row.terminatedAt = terminatedAt;
      return true;
    },
    terminateAllForUser: async (userAccountId: string, terminatedAt: Date) => {
      const live = stored.filter((s) => s.userAccountId === userAccountId && s.terminatedAt === null);
      for (const row of live) row.terminatedAt = terminatedAt;
      return live.length;
    },
    findActiveForUser: async (userAccountId: string, now: Date) =>
      stored
        .filter((s) => s.userAccountId === userAccountId && s.terminatedAt === null && s.expiresAt > now)
        .map(publicView),
    deleteExpiredBefore: async (before: Date) => {
      const doomed = stored.filter((s) => s.expiresAt < before);
      for (const row of doomed) stored.splice(stored.indexOf(row), 1);
      return doomed.length;
    },
  } as unknown as SessionRepository;

  const accountRepo = {
    findIdentityById: async (id: string) => known.find((i) => i.userAccountId === id) ?? null,
  } as unknown as UserAccountRepository;

  return {
    component: new SessionComponent(sessionRepo, accountRepo, idleMinutes),
    stored,
    identities: known,
  };
}

const T0 = new Date('2026-01-01T09:00:00.000Z');

describe('the token is never stored (BR-AU-09)', () => {
  it('stores a HASH and returns the token exactly once', async () => {
    const harness = setup();
    const { session, token } = await harness.component.establish(IDENTITY, T0);

    expect(token).toBeTruthy();
    // What is stored is the hash, not the token.
    expect(harness.stored[0]?.tokenHash).toBe(hashToken(token));
    expect(harness.stored[0]?.tokenHash).not.toBe(token);
    // The returned Session object carries no token field at all.
    expect(JSON.stringify(session)).not.toContain(token);
    expect(Object.keys(session)).not.toContain('tokenHash');
  });

  it('generates a different token every time', async () => {
    const harness = setup();
    const first = await harness.component.establish(IDENTITY, T0);
    const second = await harness.component.establish(IDENTITY, T0);
    expect(first.token).not.toBe(second.token);
  });

  it('generates a high-entropy token', async () => {
    const harness = setup();
    const { token } = await harness.component.establish(IDENTITY, T0);
    // 32 random bytes in base64url — long enough that guessing is not an attack.
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: URL- and cookie-safe
  });

  it('hashToken is deterministic, so lookup by hash works', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashToken('abc')).toHaveLength(64); // sha256 hex
  });
});

describe('establishment (BR-AU-08)', () => {
  it('attaches the account, so role and scope resolve from the session', async () => {
    const harness = setup();
    const { session } = await harness.component.establish(IDENTITY, T0);
    expect(session.userAccountId).toBe('u-1');
  });

  it('refuses to issue a session for an inactive account', async () => {
    const harness = setup();
    await expect(
      harness.component.establish({ ...IDENTITY, isActive: false }, T0),
    ).rejects.toThrow(UnauthorizedError);
    expect(harness.stored).toHaveLength(0);
  });

  it('sets expiry from the configured idle timeout', async () => {
    const harness = setup([IDENTITY], 30);
    const { session } = await harness.component.establish(IDENTITY, T0);
    expect(session.expiresAt.toISOString()).toBe('2026-01-01T09:30:00.000Z');
  });

  it('honours a non-default timeout (BR-AU-10 configurable)', async () => {
    const harness = setup([IDENTITY], 5);
    const { session } = await harness.component.establish(IDENTITY, T0);
    expect(session.expiresAt.toISOString()).toBe('2026-01-01T09:05:00.000Z');
  });
});

describe('resolution and sliding expiry (BR-AU-10, BR-AU-12)', () => {
  it('resolves a live token to its identity', async () => {
    const harness = setup();
    const { token } = await harness.component.establish(IDENTITY, T0);

    const resolved = await harness.component.resolve(token, new Date(T0.getTime() + 60_000));
    expect(resolved?.identity.username).toBe('admin');
    expect(resolved?.identity.role).toBe('ADMIN');
  });

  it('EXTENDS expiry on each resolution, so the timeout measures inactivity', async () => {
    const harness = setup();
    const { token } = await harness.component.establish(IDENTITY, T0);

    const at20Minutes = new Date(T0.getTime() + 20 * 60_000);
    const resolved = await harness.component.resolve(token, at20Minutes);

    // Expiry moved to 20 + 30 = 50 minutes past T0, not the original 30.
    expect(resolved?.session.expiresAt.toISOString()).toBe('2026-01-01T09:50:00.000Z');
  });

  it('keeps a session alive indefinitely under continuous activity', async () => {
    const harness = setup();
    const { token } = await harness.component.establish(IDENTITY, T0);

    let now = T0;
    for (let i = 0; i < 5; i += 1) {
      now = new Date(now.getTime() + 25 * 60_000); // active every 25 minutes
      expect(await harness.component.resolve(token, now)).not.toBeNull();
    }
  });

  it('rejects a session after the idle timeout passes', async () => {
    const harness = setup();
    const { token } = await harness.component.establish(IDENTITY, T0);

    const at31Minutes = new Date(T0.getTime() + 31 * 60_000);
    expect(await harness.component.resolve(token, at31Minutes)).toBeNull();
  });

  it('rejects an unknown token the same way as an expired one (BR-AU-12)', async () => {
    const harness = setup();
    await harness.component.establish(IDENTITY, T0);

    // Both null — telling an attacker a token was ONCE valid is information they can use.
    expect(await harness.component.resolve('never-issued', T0)).toBeNull();
    expect(await harness.component.resolve('', T0)).toBeNull();
  });

  it('re-reads the identity on EVERY resolution, so a role change takes effect at once', async () => {
    // A role cached in the session row would leave a privilege-escalation window up to the
    // full idle timeout wide.
    const harness = setup();
    const { token } = await harness.component.establish(IDENTITY, T0);

    (harness.identities[0] as VerifiedIdentity).role = 'TEAM_MEMBER';

    const resolved = await harness.component.resolve(token, new Date(T0.getTime() + 60_000));
    expect(resolved?.identity.role).toBe('TEAM_MEMBER');
  });

  it('TERMINATES the session when the account has been deactivated', async () => {
    // Refusing the request alone would let it be retried until the session expired.
    const harness = setup();
    const { token, session } = await harness.component.establish(IDENTITY, T0);

    (harness.identities[0] as VerifiedIdentity).isActive = false;

    expect(await harness.component.resolve(token, new Date(T0.getTime() + 60_000))).toBeNull();
    expect(harness.stored.find((s) => s.id === session.id)?.terminatedAt).not.toBeNull();
  });

  it('rejects a token whose account no longer exists', async () => {
    const harness = setup([]);
    // Establish against an identity the account repo does not know.
    const { token } = await harness.component.establish(IDENTITY, T0);
    expect(await harness.component.resolve(token, new Date(T0.getTime() + 60_000))).toBeNull();
  });
});

describe('termination is genuine, not cosmetic (BR-AU-11)', () => {
  it('sets terminatedAt and blocks further resolution', async () => {
    const harness = setup();
    const { token, session } = await harness.component.establish(IDENTITY, T0);

    expect(await harness.component.terminate(session.id, T0)).toBe(true);
    expect(harness.stored[0]?.terminatedAt).not.toBeNull();
    // The token is dead server-side — clearing a cookie alone would leave it usable.
    expect(await harness.component.resolve(token, T0)).toBeNull();
  });

  it('is idempotent', async () => {
    const harness = setup();
    const { session } = await harness.component.establish(IDENTITY, T0);

    expect(await harness.component.terminate(session.id, T0)).toBe(true);
    expect(await harness.component.terminate(session.id, T0)).toBe(false);
  });

  it('terminates by token, for a sign-out that only has the cookie', async () => {
    const harness = setup();
    const { token } = await harness.component.establish(IDENTITY, T0);

    expect(await harness.component.terminateByToken(token, T0)).toBe(true);
    expect(await harness.component.resolve(token, T0)).toBeNull();
  });

  it('returns false rather than throwing for an unknown token', async () => {
    const harness = setup();
    expect(await harness.component.terminateByToken('never-issued', T0)).toBe(false);
    expect(await harness.component.terminateByToken('', T0)).toBe(false);
  });

  it('terminates EVERY live session for a user', async () => {
    // Without this, a password change would not evict a session an attacker already holds —
    // the main reason someone changes their password.
    const harness = setup();
    const first = await harness.component.establish(IDENTITY, T0);
    const second = await harness.component.establish(IDENTITY, T0);

    expect(await harness.component.terminateAllForUser('u-1', T0)).toBe(2);
    expect(await harness.component.resolve(first.token, T0)).toBeNull();
    expect(await harness.component.resolve(second.token, T0)).toBeNull();
  });

  it('does not touch another user sessions', async () => {
    const other: VerifiedIdentity = { ...IDENTITY, userAccountId: 'u-2', username: 'other' };
    const harness = setup([IDENTITY, other]);

    const mine = await harness.component.establish(IDENTITY, T0);
    const theirs = await harness.component.establish(other, T0);

    await harness.component.terminateAllForUser('u-1', T0);

    expect(await harness.component.resolve(mine.token, T0)).toBeNull();
    expect(await harness.component.resolve(theirs.token, T0)).not.toBeNull();
  });
});

describe('housekeeping', () => {
  it('lists live sessions for a user without exposing hashes', async () => {
    const harness = setup();
    await harness.component.establish(IDENTITY, T0);

    const live = await harness.component.listActiveForUser('u-1', T0);
    expect(live).toHaveLength(1);
    expect(Object.keys(live[0] as object)).not.toContain('tokenHash');
  });

  it('purges expired rows', async () => {
    const harness = setup();
    await harness.component.establish(IDENTITY, T0);

    const wellAfter = new Date(T0.getTime() + 24 * 60 * 60_000);
    expect(await harness.component.purgeExpired(wellAfter)).toBe(1);
    expect(harness.stored).toHaveLength(0);
  });
});

describe('tokensEqual', () => {
  it('compares equal and unequal values correctly', () => {
    expect(SessionComponent.tokensEqual('abc', 'abc')).toBe(true);
    expect(SessionComponent.tokensEqual('abc', 'abd')).toBe(false);
  });

  it('handles different lengths without throwing', () => {
    // timingSafeEqual throws on length mismatch, which would itself leak length — the
    // implementation digests both sides first so the lengths always match.
    expect(SessionComponent.tokensEqual('short', 'much-longer-value')).toBe(false);
  });
});
