/**
 * C-07 IdentityComponent tests — BR-AU-01…07, BR-AU-13…15.
 *
 * These use REAL Argon2id hashing, not a stub. Stubbing the hash would defeat the point:
 * BR-AU-03 (identical passwords produce different hashes) and BR-AU-05 (the dummy
 * comparison costs comparable time) are properties OF the hash function's use, and a fake
 * would satisfy them trivially while the production path stayed broken.
 *
 * Consequence: this suite is slower than the others by design (~40 ms per hash).
 */

import {
  IdentityComponent,
  PASSWORD_ALGORITHM,
} from '../../src/core-domain/identity/identity-component';
import { ConflictError, UnauthorizedError, ValidationError } from '../../src/shared/errors';
import type { MemberRepository, UserAccountRepository } from '../../src/shared/repository';
import type { StoredCredential } from '../../src/shared/repository/user-account-repository';
import type { UserAccount } from '../../src/shared/types/domain';

const GOOD_PASSWORD = 'correct-horse-battery-staple';
const OTHER_PASSWORD = 'a-completely-different-passphrase';

interface Stored extends UserAccount {
  passwordHash: string;
  passwordAlgorithm: string;
}

interface Harness {
  component: IdentityComponent;
  accounts: Stored[];
}

/**
 * Mirrors the real repository's `toUserAccount` mapper, which OMITS the hash.
 *
 * The first version of this fake returned the raw stored row including `passwordHash`, and
 * a test caught it. Worth keeping in mind: a fake that is more permissive than the real
 * repository hides exactly the bugs the test is meant to find.
 */
function publicView(stored: Stored): UserAccount {
  return {
    id: stored.id,
    username: stored.username,
    role: stored.role,
    homeOrgUnitId: stored.homeOrgUnitId,
    linkedMemberId: stored.linkedMemberId,
    isActive: stored.isActive,
  };
}

function setup(seed: Partial<Stored>[] = []): Harness {
  const accounts: Stored[] = seed.map((account, index) => ({
    id: account.id ?? `u-${index + 1}`,
    username: account.username ?? `user${index + 1}`,
    role: account.role ?? 'ADMIN',
    homeOrgUnitId: account.homeOrgUnitId ?? null,
    linkedMemberId: account.linkedMemberId ?? null,
    isActive: account.isActive ?? true,
    passwordHash: account.passwordHash ?? '',
    passwordAlgorithm: account.passwordAlgorithm ?? PASSWORD_ALGORITHM,
  }));

  const accountRepo = {
    findCredentialByUsername: async (username: string): Promise<StoredCredential | null> => {
      const found = accounts.find(
        (a) => a.username.toLowerCase() === username.toLowerCase(),
      );
      if (!found) return null;
      return {
        userAccountId: found.id,
        username: found.username,
        passwordHash: found.passwordHash,
        passwordAlgorithm: found.passwordAlgorithm,
        role: found.role,
        homeOrgUnitId: found.homeOrgUnitId,
        linkedMemberId: found.linkedMemberId,
        isActive: found.isActive,
      };
    },
    findIdentityById: async (id: string) => {
      const found = accounts.find((a) => a.id === id);
      return found
        ? {
            userAccountId: found.id,
            username: found.username,
            role: found.role,
            homeOrgUnitId: found.homeOrgUnitId,
            linkedMemberId: found.linkedMemberId,
            isActive: found.isActive,
          }
        : null;
    },
    findById: async (id: string) => {
      const found = accounts.find((a) => a.id === id);
      return found ? publicView(found) : null;
    },
    findAll: async () => accounts.map(publicView),
    countAll: async () => accounts.length,
    create: async (input: Record<string, unknown>) => {
      const created: Stored = {
        id: `u-${accounts.length + 1}`,
        username: input.username as string,
        role: input.role as UserAccount['role'],
        homeOrgUnitId: (input.homeOrgUnitId as string | null) ?? null,
        linkedMemberId: (input.linkedMemberId as string | null) ?? null,
        isActive: true,
        passwordHash: input.passwordHash as string,
        passwordAlgorithm: input.passwordAlgorithm as string,
      };
      accounts.push(created);
      return publicView(created);
    },
    updatePasswordHash: async (id: string, passwordHash: string, algorithm: string) => {
      const found = accounts.find((a) => a.id === id);
      if (!found) return false;
      found.passwordHash = passwordHash;
      found.passwordAlgorithm = algorithm;
      return true;
    },
    updateRoleAndScope: async (
      id: string,
      role: UserAccount['role'],
      homeOrgUnitId: string | null,
      linkedMemberId: string | null,
    ) => {
      const found = accounts.find((a) => a.id === id);
      if (!found) return null;
      found.role = role;
      found.homeOrgUnitId = homeOrgUnitId;
      found.linkedMemberId = linkedMemberId;
      return publicView(found);
    },
    setActive: async (id: string, isActive: boolean) => {
      const found = accounts.find((a) => a.id === id);
      if (!found) return null;
      found.isActive = isActive;
      return publicView(found);
    },
  } as unknown as UserAccountRepository;

  const memberRepo = {
    findLocation: async (id: string) =>
      id.startsWith('m-') ? { id, orgUnitId: 'ou-1', status: 'ACTIVE' as const } : null,
  } as unknown as MemberRepository;

  return { component: new IdentityComponent(accountRepo, memberRepo), accounts };
}

/** Creates an account through the component so the hash is produced by production code. */
async function withAccount(
  username = 'admin',
  password = GOOD_PASSWORD,
): Promise<Harness> {
  const harness = setup();
  await harness.component.createAccount({ username, role: 'ADMIN', homeOrgUnitId: null }, password);
  return harness;
}

describe('password storage (BR-AU-01, BR-AU-02)', () => {
  it('stores an Argon2id hash, never the plaintext', async () => {
    const harness = await withAccount();
    const stored = harness.accounts[0] as Stored;

    expect(stored.passwordAlgorithm).toBe('argon2id');
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    // The plaintext appears nowhere in the stored record.
    expect(JSON.stringify(stored)).not.toContain(GOOD_PASSWORD);
  });

  it('records the algorithm so parameters can be upgraded later', async () => {
    const harness = await withAccount();
    expect(harness.accounts[0]?.passwordAlgorithm).toBe(PASSWORD_ALGORITHM);
  });

  it('returns an account object carrying no hash', async () => {
    const harness = setup();
    const account = await harness.component.createAccount(
      { username: 'admin', role: 'ADMIN', homeOrgUnitId: null },
      GOOD_PASSWORD,
    );

    expect(Object.keys(account)).not.toContain('passwordHash');
    expect(JSON.stringify(account)).not.toContain('argon2');
  });

  it('embeds a random salt: identical passwords give DIFFERENT hashes (BR-AU-03)', async () => {
    // Without this, a stolen dump reveals which accounts share a password, and cracking
    // one cracks all of them.
    const harness = setup();
    await harness.component.createAccount(
      { username: 'user-a', role: 'ADMIN', homeOrgUnitId: null },
      GOOD_PASSWORD,
    );
    await harness.component.createAccount(
      { username: 'user-b', role: 'ADMIN', homeOrgUnitId: null },
      GOOD_PASSWORD, // the SAME password
    );

    const [a, b] = harness.accounts;
    expect(a?.passwordHash).not.toBe(b?.passwordHash);
    // Both still verify, so the difference is salt and not corruption.
    expect(await harness.component.verifyCredentials('user-a', GOOD_PASSWORD)).not.toBeNull();
    expect(await harness.component.verifyCredentials('user-b', GOOD_PASSWORD)).not.toBeNull();
  });

  it('re-hashing the same password produces a different hash again', async () => {
    const harness = await withAccount();
    const before = harness.accounts[0]?.passwordHash;

    await harness.component.setPassword('u-1', GOOD_PASSWORD);
    expect(harness.accounts[0]?.passwordHash).not.toBe(before);
    expect(await harness.component.verifyCredentials('admin', GOOD_PASSWORD)).not.toBeNull();
  });
});

describe('credential verification (BR-AU-04, BR-AU-06)', () => {
  it('accepts the correct password and returns an identity with no hash', async () => {
    const harness = await withAccount();
    const identity = await harness.component.verifyCredentials('admin', GOOD_PASSWORD);

    expect(identity?.username).toBe('admin');
    expect(identity?.role).toBe('ADMIN');
    expect(JSON.stringify(identity)).not.toContain('argon2');
  });

  it('rejects a wrong password', async () => {
    const harness = await withAccount();
    expect(await harness.component.verifyCredentials('admin', OTHER_PASSWORD)).toBeNull();
  });

  it('returns the SAME result shape for an unknown username as for a wrong password', async () => {
    // BR-AU-04: an attacker must not be able to tell the two apart.
    const harness = await withAccount();

    const wrongPassword = await harness.component.verifyCredentials('admin', OTHER_PASSWORD);
    const unknownUser = await harness.component.verifyCredentials('nobody', GOOD_PASSWORD);

    expect(wrongPassword).toBeNull();
    expect(unknownUser).toBeNull();
    expect(IdentityComponent.rejectionMessage()).toBe('The username or password is incorrect.');
  });

  it('matches the username case-insensitively', async () => {
    const harness = await withAccount();
    expect(await harness.component.verifyCredentials('ADMIN', GOOD_PASSWORD)).not.toBeNull();
  });

  it('rejects empty credentials BEFORE attempting authentication (BR-AU-06)', async () => {
    const harness = await withAccount();

    await expect(harness.component.verifyCredentials('', GOOD_PASSWORD)).rejects.toThrow(
      ValidationError,
    );
    await expect(harness.component.verifyCredentials('admin', '')).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'password', rule: 'REQUIRED' })],
    });
  });

  it('does not authenticate anyone when the stored hash is malformed', async () => {
    // Failing closed: a corrupted row locks one account out rather than letting anyone in.
    const harness = setup([{ username: 'broken', passwordHash: 'not-a-real-hash' }]);
    expect(await harness.component.verifyCredentials('broken', GOOD_PASSWORD)).toBeNull();
  });
});

/**
 * BR-AU-05 — the timing property. Skipping the dummy comparison turns login into a
 * username oracle: an attacker measuring response times learns which accounts exist and
 * then targets only those.
 */
describe('the unknown-username path performs real hash work (BR-AU-05)', () => {
  it('takes time comparable to a wrong-password attempt', async () => {
    const harness = await withAccount();

    const time = async (run: () => Promise<unknown>): Promise<number> => {
      const start = process.hrtime.bigint();
      await run();
      return Number(process.hrtime.bigint() - start) / 1e6;
    };

    // Warm both paths first: the dummy hash is computed lazily once, and including that
    // one-off cost would measure initialisation rather than the comparison.
    await harness.component.verifyCredentials('admin', OTHER_PASSWORD);
    await harness.component.verifyCredentials('nobody', GOOD_PASSWORD);

    const wrongPasswordMs = await time(() =>
      harness.component.verifyCredentials('admin', OTHER_PASSWORD),
    );
    const unknownUserMs = await time(() =>
      harness.component.verifyCredentials('nobody', GOOD_PASSWORD),
    );

    // A generous floor rather than a tight ratio: this must catch the unknown path
    // SKIPPING the hash entirely (which would be sub-millisecond against ~40 ms) without
    // being flaky on a loaded machine.
    expect(unknownUserMs).toBeGreaterThan(wrongPasswordMs * 0.4);
  });
});

describe('inactive accounts (BR-AU-07)', () => {
  it('refuses sign-in and says the account is not active', async () => {
    const harness = await withAccount();
    (harness.accounts[0] as Stored).isActive = false;

    await expect(harness.component.verifyCredentials('admin', GOOD_PASSWORD)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(
      harness.component.verifyCredentials('admin', GOOD_PASSWORD),
    ).rejects.toThrow(/not active/i);
  });

  it('checks active status only AFTER the password is confirmed', async () => {
    // Reporting "inactive" on a wrong password would confirm the account exists to anyone
    // guessing a username — the oracle BR-AU-05 exists to close.
    const harness = await withAccount();
    (harness.accounts[0] as Stored).isActive = false;

    // Wrong password on an inactive account: plain rejection, NOT the inactive message.
    expect(await harness.component.verifyCredentials('admin', OTHER_PASSWORD)).toBeNull();
  });
});

describe('password policy', () => {
  it('requires a reasonable minimum length', async () => {
    const harness = setup();
    await expect(
      harness.component.createAccount({ username: 'x', role: 'ADMIN', homeOrgUnitId: null }, 'short'),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'password', rule: 'TOO_SHORT' })],
    });
  });

  it('bounds the maximum length so hashing cannot be used as a denial of service', async () => {
    const harness = setup();
    await expect(
      harness.component.createAccount(
        { username: 'x', role: 'ADMIN', homeOrgUnitId: null },
        'a'.repeat(300),
      ),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'password', rule: 'TOO_LONG' })],
    });
  });

  it('imposes no character-composition rules', async () => {
    // Length is what costs an attacker work; composition rules push users toward
    // predictable substitutions.
    const harness = setup();
    const account = await harness.component.createAccount(
      { username: 'lowercase-only', role: 'ADMIN', homeOrgUnitId: null },
      'allofthesearejustlowercaseletters',
    );
    expect(account.username).toBe('lowercase-only');
  });

  it('rejects a username containing spaces', async () => {
    const harness = setup();
    await expect(
      harness.component.createAccount(
        { username: 'has space', role: 'ADMIN', homeOrgUnitId: null },
        GOOD_PASSWORD,
      ),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'username', rule: 'INVALID_FORMAT' })],
    });
  });
});

/**
 * BR-AU-13 / BR-AU-14 — member linking.
 */
describe('member linking (BR-AU-13, BR-AU-14)', () => {
  it('links an account to a member', async () => {
    const harness = await withAccount();
    const result = await harness.component.linkToMember('u-1', 'm-1');

    expect(result.linked).toBe(true);
    expect(result.conflictWith).toBeNull();
    expect(result.account.linkedMemberId).toBe('m-1');
  });

  it('is idempotent for the same member', async () => {
    const harness = await withAccount();
    await harness.component.linkToMember('u-1', 'm-1');
    const again = await harness.component.linkToMember('u-1', 'm-1');
    expect(again.linked).toBe(true);
  });

  it('REFUSES a second account for the same member, NAMING the existing one', async () => {
    // "already linked" leaves an admin hunting; "already linked to first-user" tells them
    // what to unlink.
    const harness = await withAccount('first-user');
    await harness.component.createAccount(
      { username: 'second-user', role: 'ADMIN', homeOrgUnitId: null },
      GOOD_PASSWORD,
    );
    await harness.component.linkToMember('u-1', 'm-1');

    const result = await harness.component.linkToMember('u-2', 'm-1');

    expect(result.linked).toBe(false);
    expect(result.conflictWith?.username).toBe('first-user');
    expect(result.account.linkedMemberId).toBeNull();
  });

  it('refuses to relink an account already pointing at another member', async () => {
    const harness = await withAccount();
    await harness.component.linkToMember('u-1', 'm-1');

    await expect(harness.component.linkToMember('u-1', 'm-2')).rejects.toThrow(ConflictError);
  });

  it('rejects linking to a member that does not exist', async () => {
    const harness = await withAccount();
    await expect(harness.component.linkToMember('u-1', 'nope')).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'memberId', rule: 'NOT_FOUND' })],
    });
  });

  it('unlinks, leaving the account usable (BR-AU-14)', async () => {
    const harness = await withAccount();
    await harness.component.linkToMember('u-1', 'm-1');

    const unlinked = await harness.component.unlinkFromMember('u-1');
    expect(unlinked.linkedMemberId).toBeNull();
    expect(unlinked.isActive).toBe(true);
  });

  it('preserves the link when the role changes', async () => {
    const harness = await withAccount();
    await harness.component.linkToMember('u-1', 'm-1');

    const updated = await harness.component.updateRoleAndScope('u-1', 'TEAM_MEMBER', 'ou-1');
    expect(updated.role).toBe('TEAM_MEMBER');
    expect(updated.linkedMemberId).toBe('m-1'); // not silently dropped
  });
});

describe('account deactivation', () => {
  it('marks the account inactive', async () => {
    const harness = await withAccount();
    const deactivated = await harness.component.deactivateAccount('u-1');
    expect(deactivated.isActive).toBe(false);
  });

  it('can be reactivated', async () => {
    const harness = await withAccount();
    await harness.component.deactivateAccount('u-1');
    expect((await harness.component.reactivateAccount('u-1')).isActive).toBe(true);
  });
});
