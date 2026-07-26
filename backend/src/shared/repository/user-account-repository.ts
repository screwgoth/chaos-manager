/**
 * User account persistence.
 *
 * SECURITY (NFR-SE-02, BR-AU-01): the Argon2id hash leaves this repository through
 * exactly ONE method — `findCredentialByUsername` — which exists solely so the
 * credential verifier can compare it. Every other read maps through `toUserAccount` /
 * `toVerifiedIdentity`, neither of which carries the hash. Keeping the hash on a single
 * narrow path is what makes "the hash is never returned or logged" checkable by reading
 * this file rather than auditing every call site.
 *
 * There is no method that returns a password in any form other than the stored hash,
 * and no method that accepts one for storage un-hashed — hashing happens in the identity
 * component before it reaches here.
 */

import type { DbOrTx } from './db';
import type {
  MemberId,
  OrgUnitId,
  UserAccount,
  UserAccountId,
  UserRole,
  VerifiedIdentity,
} from '../types/domain';
import { isUuid } from '../util/ids';
import { toUserAccount, toVerifiedIdentity } from './mappers';
import { withPgErrors } from './pg-errors';

export interface UserAccountWrite {
  username: string;
  /** Already an Argon2id encoded hash. NEVER a plaintext password. */
  passwordHash: string;
  passwordAlgorithm: string;
  role: UserRole;
  homeOrgUnitId: OrgUnitId | null;
  linkedMemberId: MemberId | null;
}

/** The ONLY shape in the codebase that carries a password hash out of the database. */
export interface StoredCredential {
  userAccountId: UserAccountId;
  username: string;
  passwordHash: string;
  passwordAlgorithm: string;
  role: UserRole;
  homeOrgUnitId: OrgUnitId | null;
  linkedMemberId: MemberId | null;
  isActive: boolean;
}

export class UserAccountRepository {
  constructor(private readonly db: DbOrTx) {}

  /**
   * Credential lookup for authentication ONLY.
   *
   * Returns the stored hash so the caller can verify a submitted password against it.
   * The result must never be logged, serialised into a response, or attached to a
   * request context — the caller converts it to a VerifiedIdentity and discards it.
   *
   * Username comparison is case-insensitive to match the `user_username_unique` index on
   * lower(username); a case-sensitive lookup here would let "Admin" fail to find the
   * account that "admin" created, while the unique index still forbade creating it.
   */
  async findCredentialByUsername(username: string): Promise<StoredCredential | null> {
    const row = await this.db
      .selectFrom('user_account')
      .selectAll()
      .where((eb) => eb(eb.fn('lower', ['username']), '=', username.toLowerCase()))
      .executeTakeFirst();
    if (!row) return null;
    return {
      userAccountId: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      passwordAlgorithm: row.password_algorithm,
      role: row.role,
      homeOrgUnitId: row.home_org_unit_id,
      linkedMemberId: row.linked_member_id,
      isActive: row.is_active,
    };
  }

  /** Identity for an established session. No hash (see the file header). */
  async findIdentityById(id: UserAccountId): Promise<VerifiedIdentity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db
      .selectFrom('user_account')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toVerifiedIdentity(row) : null;
  }

  async findById(id: UserAccountId): Promise<UserAccount | null> {
    if (!isUuid(id)) return null;
    const row = await this.db
      .selectFrom('user_account')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toUserAccount(row) : null;
  }

  async findAll(includeInactive: boolean): Promise<UserAccount[]> {
    let query = this.db.selectFrom('user_account').selectAll();
    if (!includeInactive) query = query.where('is_active', '=', true);
    const rows = await query.orderBy('username', 'asc').execute();
    return rows.map(toUserAccount);
  }

  async countAll(): Promise<number> {
    const row = await this.db
      .selectFrom('user_account')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async create(input: UserAccountWrite): Promise<UserAccount> {
    return withPgErrors(async () => {
      const row = await this.db
        .insertInto('user_account')
        .values({
          username: input.username,
          password_hash: input.passwordHash,
          password_algorithm: input.passwordAlgorithm,
          role: input.role,
          home_org_unit_id: input.homeOrgUnitId,
          linked_member_id: input.linkedMemberId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toUserAccount(row);
    });
  }

  /** Accepts a hash, never a password. */
  async updatePasswordHash(
    id: UserAccountId,
    passwordHash: string,
    passwordAlgorithm: string,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('user_account')
      .set({ password_hash: passwordHash, password_algorithm: passwordAlgorithm, updated_at: new Date() })
      .where('id', '=', id)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async updateRoleAndScope(
    id: UserAccountId,
    role: UserRole,
    homeOrgUnitId: OrgUnitId | null,
    linkedMemberId: MemberId | null,
  ): Promise<UserAccount | null> {
    return withPgErrors(async () => {
      const row = await this.db
        .updateTable('user_account')
        .set({
          role,
          home_org_unit_id: homeOrgUnitId,
          linked_member_id: linkedMemberId,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? toUserAccount(row) : null;
    });
  }

  /**
   * The account linked to a member, if any — US-ACC-04 / BR-L-03.
   *
   * Needed so a link refusal can NAME the account already holding the link. "Already linked"
   * without saying to what leaves an admin no next action (BR-L-02/03).
   */
  async findByLinkedMemberId(memberId: MemberId): Promise<UserAccount | null> {
    if (!isUuid(memberId)) return null;
    const row = await this.db
      .selectFrom('user_account')
      .selectAll()
      .where('linked_member_id', '=', memberId)
      .executeTakeFirst();
    return row ? toUserAccount(row) : null;
  }

  /**
   * Set or clear the member link — US-ACC-04.
   *
   * Deliberately separate from `updateRoleAndScope`: BR-L-05 requires that linking NOT alter
   * `home_org_unit_id`, and reusing that method would make it trivially easy to pass the
   * current role and org unit back in slightly wrong. Role scope and own-data scope are
   * independent axes.
   *
   * The partial unique index on `linked_member_id` is the real guarantee for BR-L-01; the
   * service's pre-check exists to produce a USEFUL message, not to be the enforcement. If the
   * two ever disagree the index wins and the caller gets a conflict — the correct direction.
   */
  async setLinkedMember(
    id: UserAccountId,
    linkedMemberId: MemberId | null,
  ): Promise<UserAccount | null> {
    return withPgErrors(async () => {
      const row = await this.db
        .updateTable('user_account')
        .set({ linked_member_id: linkedMemberId, updated_at: new Date() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? toUserAccount(row) : null;
    });
  }

  /** Accounts are deactivated, never deleted, so the audit trail keeps resolving. */
  async setActive(id: UserAccountId, isActive: boolean): Promise<UserAccount | null> {
    const row = await this.db
      .updateTable('user_account')
      .set({ is_active: isActive, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toUserAccount(row) : null;
  }
}
