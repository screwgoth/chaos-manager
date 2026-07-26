/**
 * C-07 IdentityComponent — credentials and member linking. BR-AU-01…07, BR-AU-13…15.
 *
 * SECURITY PROPERTIES THIS FILE IS RESPONSIBLE FOR. Each is stated with the attack it
 * prevents, because a future edit that looks harmless can remove one silently:
 *
 *   BR-AU-01/02 — passwords exist as Argon2id hashes only. No plaintext is persisted,
 *   returned, or logged. `setPassword` takes a plaintext, hashes it, and lets it go out of
 *   scope; nothing else in the system ever holds one.
 *
 *   BR-AU-03 — identical passwords for different users produce different hashes, because
 *   Argon2id embeds a random salt. Without this, a stolen dump reveals which accounts
 *   share a password, and cracking one cracks all of them.
 *
 *   BR-AU-04/05 — a wrong password and an unknown username return the SAME rejection, and
 *   the unknown-username path performs a DUMMY hash comparison so the two take comparable
 *   time. Skipping the dummy work turns login into a username oracle: an attacker
 *   measuring response times learns which accounts exist, then targets only those.
 *
 *   BR-AU-15 — nothing outside `verifyCredentials` reads `passwordHash`, and no
 *   authorization decision may inspect HOW a user authenticated. `VerifiedIdentity` is the
 *   only thing this component hands out.
 */

import { hash, verify } from '@node-rs/argon2';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ViolationCollector,
} from '../../shared/errors';
import type { MemberRepository, UserAccountRepository } from '../../shared/repository';
import type {
  MemberId,
  OrgUnitId,
  UserAccount,
  UserAccountId,
  UserRole,
  VerifiedIdentity,
} from '../../shared/types/domain';

export interface UserAccountInput {
  username: string;
  role: UserRole;
  homeOrgUnitId: OrgUnitId | null;
}

export interface LinkResult {
  account: UserAccount;
  linked: boolean;
  /** Set when the link was refused, naming what already holds it (BR-AU-13). */
  conflictWith: { userAccountId: UserAccountId; username: string } | null;
}

export const PASSWORD_ALGORITHM = 'argon2id';

/**
 * Argon2id parameters. Recorded alongside the hash (BR-AU-01) so a later parameter
 * increase can re-hash on next login without invalidating existing credentials.
 *
 * 19 MiB / 2 iterations / 1 lane is the OWASP-recommended minimum floor. These are
 * deliberately NOT tuned down for test speed: a test that measures a weaker hash than
 * production measures the wrong thing.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
const MAX_USERNAME_LENGTH = 100;

/**
 * A precomputed Argon2id hash of a value no user can supply, used as the comparison
 * target when the username is unknown (BR-AU-05).
 *
 * It must be a REAL hash with the production parameters, because the point is to spend the
 * same CPU time as a genuine verification. Comparing against a short constant, or skipping
 * the comparison, is what leaks the username.
 */
let dummyHashPromise: Promise<string> | null = null;

async function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash(
    'this-value-is-never-a-real-password-and-cannot-be-submitted',
    ARGON2_OPTIONS,
  );
  return dummyHashPromise;
}

/** The single rejection message. Identical for both failure modes (BR-AU-04). */
const REJECTION = 'The username or password is incorrect.';

export class IdentityComponent {
  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly members: MemberRepository,
  ) {}

  /**
   * BR-AU-04/05/06/07 — the whole point of this method is that its FAILURE modes are
   * indistinguishable to an attacker while remaining distinguishable in the logs.
   *
   * Returns null for a genuine credential failure rather than throwing, so the caller
   * decides the response; an inactive account throws with a DIFFERENT message, because
   * BR-AU-07 requires the user to be told their account is not active — that is not a
   * credential secret, and leaving them guessing generates support tickets.
   */
  async verifyCredentials(
    username: string,
    plainPassword: string,
  ): Promise<VerifiedIdentity | null> {
    // BR-AU-06: caught BEFORE any authentication attempt, so an empty submission cannot
    // even reach the hash comparison.
    const violations = new ViolationCollector();
    violations
      .addIf(!username || username.trim() === '', 'username', 'REQUIRED', 'A username is required.')
      .addIf(!plainPassword, 'password', 'REQUIRED', 'A password is required.');
    violations.throwIfAny('Sign-in failed.');

    const credential = await this.accounts.findCredentialByUsername(username.trim());

    if (!credential) {
      // BR-AU-05: burn comparable CPU on a real hash so the timing of this path resembles
      // the found-user path. The result is discarded; it can never be true.
      await verify(await getDummyHash(), plainPassword).catch(() => false);
      return null;
    }

    const passwordMatches = await verify(credential.passwordHash, plainPassword).catch(
      // A malformed stored hash must not authenticate anyone. Failing closed here means a
      // corrupted row locks that one account out rather than letting anybody in.
      () => false,
    );

    if (!passwordMatches) return null;

    // BR-AU-07: only AFTER the password is confirmed. Reporting "inactive" before
    // verifying the password would confirm the account exists to anyone who guesses a
    // username, which is the oracle BR-AU-05 exists to close.
    if (!credential.isActive) {
      throw new UnauthorizedError(
        'This account is not active. Ask an administrator to reactivate it.',
      );
    }

    // Only the identity leaves this method — never the hash (BR-AU-15).
    return {
      userAccountId: credential.userAccountId,
      username: credential.username,
      role: credential.role,
      homeOrgUnitId: credential.homeOrgUnitId,
      linkedMemberId: credential.linkedMemberId,
      isActive: credential.isActive,
    };
  }

  /** The message a caller should return for a null verification result (BR-AU-04). */
  static rejectionMessage(): string {
    return REJECTION;
  }

  async createAccount(input: UserAccountInput, plainPassword: string): Promise<UserAccount> {
    const violations = new ViolationCollector();
    const username = input.username?.trim() ?? '';

    this.validateUsername(username, violations);
    this.validatePassword(plainPassword, violations);
    violations.throwIfAny('The account could not be created.');

    // Hashed here; the plaintext goes out of scope at the end of this method and is never
    // passed onward, stored, or logged (BR-AU-02).
    const passwordHash = await hash(plainPassword, ARGON2_OPTIONS);

    // BR-AU-11's uniqueness counterpart (username) is enforced by the database index and
    // surfaces as a ConflictError naming the field.
    return this.accounts.create({
      username,
      passwordHash,
      passwordAlgorithm: PASSWORD_ALGORITHM,
      role: input.role,
      homeOrgUnitId: input.homeOrgUnitId,
      linkedMemberId: null,
    });
  }

  /** Accepts a plaintext, stores only a hash. There is no method that stores a password. */
  async setPassword(id: UserAccountId, plainPassword: string): Promise<void> {
    const violations = new ViolationCollector();
    this.validatePassword(plainPassword, violations);
    violations.throwIfAny('The password could not be set.');

    const passwordHash = await hash(plainPassword, ARGON2_OPTIONS);
    const updated = await this.accounts.updatePasswordHash(
      id,
      passwordHash,
      PASSWORD_ALGORITHM,
    );
    if (!updated) throw new NotFoundError('The user account');
  }

  async resolveIdentity(id: UserAccountId): Promise<VerifiedIdentity | null> {
    return this.accounts.findIdentityById(id);
  }

  async deactivateAccount(id: UserAccountId): Promise<UserAccount> {
    const account = await this.accounts.setActive(id, false);
    if (!account) throw new NotFoundError('The user account');
    // NOTE: terminating this user's live sessions is the CALLER's responsibility (the auth
    // service owns SessionComponent). Deactivation alone would otherwise not lock anyone
    // out until their session happened to expire.
    return account;
  }

  async reactivateAccount(id: UserAccountId): Promise<UserAccount> {
    const account = await this.accounts.setActive(id, true);
    if (!account) throw new NotFoundError('The user account');
    return account;
  }

  /**
   * BR-AU-13: at most one user account per member, enforced in BOTH directions, and a
   * second attempt is REFUSED naming the existing link.
   *
   * Naming the conflict matters: "already linked" leaves an admin hunting, while "already
   * linked to jsmith" tells them what to unlink.
   *
   * Returning a LinkResult rather than throwing for the member-side conflict keeps the
   * "who holds it" information in a typed shape the UI can render.
   */
  async linkToMember(id: UserAccountId, memberId: MemberId): Promise<LinkResult> {
    const account = await this.accounts.findById(id);
    if (!account) throw new NotFoundError('The user account');

    const member = await this.members.findLocation(memberId);
    if (!member) {
      throw new ValidationError('The account could not be linked.', [
        { field: 'memberId', rule: 'NOT_FOUND', detail: 'That member does not exist.' },
      ]);
    }

    // Direction 1: this account already points at a different member.
    if (account.linkedMemberId !== null && account.linkedMemberId !== memberId) {
      throw new ConflictError(
        `This account is already linked to a different member. Unlink it first.`,
        { field: 'linkedMemberId', existingMemberId: account.linkedMemberId },
      );
    }

    if (account.linkedMemberId === memberId) {
      return { account, linked: true, conflictWith: null }; // idempotent
    }

    // Direction 2: another account already claims this member. The partial unique index
    // `user_linked_member_unique` is the real guarantee under concurrency; this check
    // exists to produce the NAME rather than a bare constraint error.
    const existing = (await this.accounts.findAll(true)).find(
      (candidate) => candidate.linkedMemberId === memberId && candidate.id !== id,
    );
    if (existing) {
      return {
        account,
        linked: false,
        conflictWith: { userAccountId: existing.id, username: existing.username },
      };
    }

    const updated = await this.accounts.updateRoleAndScope(
      id,
      account.role,
      account.homeOrgUnitId,
      memberId,
    );
    if (!updated) throw new NotFoundError('The user account');
    return { account: updated, linked: true, conflictWith: null };
  }

  /**
   * BR-AU-14: a member without a linked account is complete and usable. Unlinking is
   * therefore a normal operation, not a repair — it does not touch the member record.
   */
  async unlinkFromMember(id: UserAccountId): Promise<UserAccount> {
    const account = await this.accounts.findById(id);
    if (!account) throw new NotFoundError('The user account');

    const updated = await this.accounts.updateRoleAndScope(
      id,
      account.role,
      account.homeOrgUnitId,
      null,
    );
    if (!updated) throw new NotFoundError('The user account');
    return updated;
  }

  async updateRoleAndScope(
    id: UserAccountId,
    role: UserRole,
    homeOrgUnitId: OrgUnitId | null,
  ): Promise<UserAccount> {
    const account = await this.accounts.findById(id);
    if (!account) throw new NotFoundError('The user account');

    const updated = await this.accounts.updateRoleAndScope(
      id,
      role,
      homeOrgUnitId,
      account.linkedMemberId,
    );
    if (!updated) throw new NotFoundError('The user account');
    return updated;
  }

  async countAccounts(): Promise<number> {
    return this.accounts.countAll();
  }

  // --- validation ---------------------------------------------------------

  private validateUsername(username: string, violations: ViolationCollector): void {
    violations
      .addIf(username === '', 'username', 'REQUIRED', 'A username is required.')
      .addIf(
        username.length > MAX_USERNAME_LENGTH,
        'username',
        'TOO_LONG',
        `A username may be at most ${MAX_USERNAME_LENGTH} characters.`,
      )
      .addIf(
        username !== '' && /\s/.test(username),
        'username',
        'INVALID_FORMAT',
        'A username may not contain spaces.',
      );
  }

  /**
   * Length only, deliberately.
   *
   * Composition rules (an uppercase, a digit, a symbol) push users toward predictable
   * substitutions and are no longer recommended; length is the property that actually
   * costs an attacker work. A minimum of 12 with no upper-bound composition requirement is
   * the current NIST guidance, and the 256 ceiling exists only to bound hashing cost —
   * without it a multi-megabyte password becomes a cheap denial-of-service.
   */
  private validatePassword(plainPassword: string, violations: ViolationCollector): void {
    const length = plainPassword?.length ?? 0;
    violations
      .addIf(length === 0, 'password', 'REQUIRED', 'A password is required.')
      .addIf(
        length > 0 && length < MIN_PASSWORD_LENGTH,
        'password',
        'TOO_SHORT',
        `A password must be at least ${MIN_PASSWORD_LENGTH} characters. Length matters more than mixing character types.`,
      )
      .addIf(
        length > MAX_PASSWORD_LENGTH,
        'password',
        'TOO_LONG',
        `A password may be at most ${MAX_PASSWORD_LENGTH} characters.`,
      );
  }
}
