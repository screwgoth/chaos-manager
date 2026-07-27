/**
 * Account-to-member linkage — US-ACC-04, the BR-L series.
 *
 * WHY THIS IS A SERVICE AND NOT A COMPONENT. There is no new domain concept here: the link is a
 * column on an existing entity, and the rules are about which of two existing records may point
 * at which. A component would be a wrapper around one repository call.
 *
 * WHY IT LIVES IN UNIT 2 rather than beside Unit 1's identity component: the link only becomes
 * MEANINGFUL once org scope is enforced (US-VIS-04 depends on it, per `stories.md` §INVEST), and
 * `unit-of-work.md` assigns US-ACC-04 here.
 *
 * ADMIN ONLY (BR-L-06). Every method asserts write permission on `USER_ACCOUNT`, which the
 * permission matrix grants to ADMIN alone.
 */

import { ConflictError, NotFoundError } from '../../shared/errors';
import type { MemberRepository, UserAccountRepository } from '../../shared/repository';
import type { AccessControlService } from '../../core-domain/services';
import type {
  MemberId,
  UserAccount,
  UserAccountId,
  VerifiedIdentity,
} from '../../shared/types/domain';

/** An account row with the linked member's name resolved, for the admin screen. */
export interface AccountWithLink {
  id: UserAccountId;
  username: string;
  role: UserAccount['role'];
  homeOrgUnitId: UserAccount['homeOrgUnitId'];
  isActive: boolean;
  linkedMember: { id: MemberId; fullName: string } | null;
}

export class AccountLinkService {
  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly members: MemberRepository,
    private readonly accessControl: AccessControlService,
  ) {}

  /**
   * All accounts with their linked member resolved.
   *
   * BATCHED (R2-1 rule 2): one query for accounts, one for the member names. The obvious
   * implementation — look up each account's member in a loop — is the N+1 this project forbids,
   * and on an account list it would be invisible until the list grew.
   */
  async list(includeInactive: boolean, identity: VerifiedIdentity): Promise<AccountWithLink[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'USER_ACCOUNT');

    const accounts = await this.accounts.findAll(includeInactive);

    const linkedIds = accounts
      .map((account) => account.linkedMemberId)
      .filter((id): id is MemberId => id !== null);
    const names = await this.members.findNamesByIds(linkedIds);

    return accounts.map((account) => ({
      id: account.id,
      username: account.username,
      role: account.role,
      homeOrgUnitId: account.homeOrgUnitId,
      isActive: account.isActive,
      linkedMember:
        account.linkedMemberId === null
          ? null
          : {
              id: account.linkedMemberId,
              // A link pointing at a deleted member would render as the id. Members are
              // deactivated rather than deleted (BR-M-11), so this should not arise; falling
              // back to the id is still better than rendering "undefined".
              fullName: names.get(account.linkedMemberId) ?? account.linkedMemberId,
            },
    }));
  }

  /**
   * Link an account to a member — BR-L-01/02/03.
   *
   * The two refusals below are SEPARATE on purpose, and each names what already holds the link.
   * Collapsing them into one "already linked" message would leave the admin unable to tell
   * whether to unlink the account or unlink the other account.
   */
  async link(
    accountId: UserAccountId,
    memberId: MemberId,
    identity: VerifiedIdentity,
  ): Promise<UserAccount> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'USER_ACCOUNT');

    const account = await this.accounts.findById(accountId);
    if (account === null) throw new NotFoundError('That user account');

    // Admin is unrestricted, so an unrestricted filter is correct here rather than the caller's
    // — but it is still derived from the scope, never assumed (BR-R-06).
    const member = await this.members.findById(memberId, this.accessControl.filterFor(scope));
    if (member === null) throw new NotFoundError('That team member');

    // BR-L-02: this account already points somewhere.
    if (account.linkedMemberId !== null) {
      if (account.linkedMemberId === memberId) return account; // idempotent, not an error
      const names = await this.members.findNamesByIds([account.linkedMemberId]);
      throw new ConflictError(
        `${account.username} is already linked to ${names.get(account.linkedMemberId) ?? 'another member'}. ` +
          'Unlink it first.',
        { reason: 'ACCOUNT_ALREADY_LINKED', existingMemberId: account.linkedMemberId },
      );
    }

    // BR-L-03: some OTHER account already points at this member.
    const holder = await this.accounts.findByLinkedMemberId(memberId);
    if (holder !== null && holder.id !== accountId) {
      throw new ConflictError(
        `${member.fullName} is already linked to the account "${holder.username}". Unlink that first.`,
        { reason: 'MEMBER_ALREADY_LINKED', existingAccountId: holder.id },
      );
    }

    const updated = await this.accounts.setLinkedMember(accountId, memberId);
    if (updated === null) throw new NotFoundError('That user account');
    return updated;
  }

  /**
   * Unlink — BR-L-04.
   *
   * ⚠️ For a TEAM_MEMBER account this REVOKES ALL ACCESS: an unlinked team member has no
   * own-data to be scoped to and `canRead` refuses them entirely (BR-R-18). The confirmation
   * that says so belongs in the UI, but the consequence is recorded here because it is not
   * obvious from the word "unlink".
   */
  async unlink(accountId: UserAccountId, identity: VerifiedIdentity): Promise<UserAccount> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'USER_ACCOUNT');

    const account = await this.accounts.findById(accountId);
    if (account === null) throw new NotFoundError('That user account');

    const updated = await this.accounts.setLinkedMember(accountId, null);
    if (updated === null) throw new NotFoundError('That user account');
    return updated;
  }
}
