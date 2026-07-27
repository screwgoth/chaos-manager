/**
 * S-03 MemberService.
 *
 * Every method takes a `VerifiedIdentity` and derives the scope from it (BR-R-06). No method
 * accepts a role, an org-unit list, or a scope filter from the caller — that is the whole
 * point of the service layer sitting between the routes and the components.
 */

import { NotFoundError } from '../../shared/errors';
import type {
  DeactivateResult,
  ExpiringContract,
  MemberComponent,
  MemberInput,
  MemberSearchCriteria,
} from '../member/member-component';
import type {
  IsoDate,
  Member,
  MemberId,
  MemberSummary,
  Page,
  ReferenceId,
  VerifiedIdentity,
} from '../../shared/types/domain';
import type { AccessControlService } from './access-control-service';

export class MemberService {
  constructor(
    private readonly members: MemberComponent,
    private readonly accessControl: AccessControlService,
  ) {}

  async search(
    criteria: MemberSearchCriteria,
    identity: VerifiedIdentity,
  ): Promise<Page<MemberSummary>> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'MEMBER');
    return this.members.search(criteria, this.accessControl.filterFor(scope));
  }

  async getById(id: MemberId, identity: VerifiedIdentity): Promise<Member> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'MEMBER', { orgUnitId: null, memberId: id });

    const member = await this.members.getById(id, this.accessControl.filterFor(scope));
    // A member outside scope is reported as NOT FOUND, not FORBIDDEN. "Forbidden" would
    // confirm the record exists, which leaks the very thing the scope filter hides — and
    // this is the route a TEAM_MEMBER would use to probe for colleagues (US-VIS-04).
    if (!member) throw new NotFoundError('The member');
    return member;
  }

  /** US-VIS-04: a TEAM_MEMBER's own record, resolved through the scope, never a client id. */
  async getOwn(identity: VerifiedIdentity): Promise<Member> {
    const scope = this.accessControl.scopeFor(identity);
    if (scope.ownMemberId === null) {
      throw new NotFoundError('A linked member record for this account');
    }
    return this.getById(scope.ownMemberId, identity);
  }

  async listAssignable(onDate: IsoDate, identity: VerifiedIdentity): Promise<MemberSummary[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'MEMBER');
    return this.members.listAssignable(onDate, this.accessControl.filterFor(scope));
  }

  async findExpiringContracts(
    withinDays: number,
    identity: VerifiedIdentity,
  ): Promise<ExpiringContract[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'MEMBER');
    return this.members.findExpiringContracts(withinDays, this.accessControl.filterFor(scope));
  }

  async create(input: MemberInput, identity: VerifiedIdentity): Promise<Member> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'MEMBER', {
      orgUnitId: input.orgUnitId,
      memberId: null,
    });
    return this.members.create(input, this.accessControl.filterFor(scope));
  }

  async update(
    id: MemberId,
    input: Partial<MemberInput>,
    identity: VerifiedIdentity,
  ): Promise<Member> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'MEMBER', { orgUnitId: null, memberId: id });
    return this.members.update(id, input, this.accessControl.filterFor(scope));
  }

  /** BR-M-13: the auto-ended count is returned so the caller can report it to the user. */
  async deactivate(id: MemberId, identity: VerifiedIdentity): Promise<DeactivateResult> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'MEMBER', { orgUnitId: null, memberId: id });
    return this.members.deactivate(
      id,
      this.accessControl.filterFor(scope),
      identity.userAccountId,
    );
  }

  async reactivate(id: MemberId, identity: VerifiedIdentity): Promise<Member> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'MEMBER', { orgUnitId: null, memberId: id });
    return this.members.reactivate(id, this.accessControl.filterFor(scope));
  }

  async attachSkill(
    id: MemberId,
    skillId: ReferenceId,
    identity: VerifiedIdentity,
  ): Promise<Member> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'MEMBER', { orgUnitId: null, memberId: id });
    return this.members.attachSkill(id, skillId, this.accessControl.filterFor(scope));
  }

  async detachSkill(
    id: MemberId,
    skillId: ReferenceId,
    identity: VerifiedIdentity,
  ): Promise<Member> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'MEMBER', { orgUnitId: null, memberId: id });
    return this.members.detachSkill(id, skillId, this.accessControl.filterFor(scope));
  }
}
