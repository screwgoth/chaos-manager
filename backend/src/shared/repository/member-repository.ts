/**
 * Member persistence.
 *
 * FR-R-08 / R2-1 rule 1: the scope filter is applied INSIDE every query. Fetching rows
 * and trimming them afterwards would mean out-of-scope personal data had already been
 * read into the process, where it could leak through a total count, a log line, or a
 * later refactor that forgets the trim.
 *
 * Scope and filters are expressed as predicate factories rather than by threading a
 * query builder through helper methods — that keeps everything fully typed (no `any`
 * escape hatches) and puts scope enforcement in exactly one readable place.
 */

import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import type { DbOrTx } from './db';
import { permittedOrgUnitIds } from './db';
import type { Database } from './schema';
import type { ScopeFilter } from '../types/authorization';
import type {
  EmploymentType,
  IsoDate,
  Member,
  MemberId,
  MemberStatus,
  MemberSummary,
  OrgUnitId,
  Page,
  ReferenceId,
} from '../types/domain';
import { isUuid, keepUuids } from '../util/ids';
import { toMember, toMemberSummary } from './mappers';
import { withPgErrors } from './pg-errors';

type MemberEb = ExpressionBuilder<Database, 'member'>;
type MemberPredicate = (eb: MemberEb) => Expression<SqlBool>;

export interface MemberWrite {
  externalRef: string | null;
  fullName: string;
  email: string;
  orgUnitId: OrgUnitId;
  employmentType: EmploymentType;
  roleId: ReferenceId;
  vendorName: string | null;
  contractStartDate: IsoDate | null;
  contractEndDate: IsoDate | null;
  contractStatus: string | null;
}

export interface MemberQuery {
  search: string | null;
  orgUnitIds: OrgUnitId[] | null;
  employmentType: EmploymentType | null;
  status: MemberStatus | null;
  skillIds: ReferenceId[] | null;
  roleId: ReferenceId | null;
  offset: number;
  limit: number;
}

/**
 * The single definition of member scope enforcement.
 *
 * `restrictToMemberId` is applied IN ADDITION to the org filter, never instead of it —
 * narrowing must not be able to widen. An empty permitted-org list yields an impossible
 * predicate rather than no predicate at all, because "no filter" is precisely the
 * failure mode that would expose every row in the table.
 */
function scopePredicates(scope: ScopeFilter): MemberPredicate[] {
  const predicates: MemberPredicate[] = [];

  const orgIds = permittedOrgUnitIds(scope);
  if (orgIds !== null) {
    predicates.push(
      orgIds.length === 0
        ? (eb) => eb.lit(false)
        : (eb) => eb('member.org_unit_id', 'in', orgIds),
    );
  }

  const ownMemberId = scope.restrictToMemberId;
  if (ownMemberId !== null) {
    predicates.push((eb) => eb('member.id', '=', ownMemberId));
  }

  return predicates;
}

function filterPredicates(filters: MemberQuery): MemberPredicate[] {
  const predicates: MemberPredicate[] = [];

  const search = filters.search?.trim();
  if (search !== undefined && search !== '') {
    // Bound as a parameter — the % wrapping is inside the bound VALUE, never
    // concatenated into SQL text (U1-NFR-SE-06).
    const pattern = `%${search}%`;
    predicates.push((eb) =>
      eb.or([eb('member.full_name', 'ilike', pattern), eb('member.email', 'ilike', pattern)]),
    );
  }

  const orgUnitIds = filters.orgUnitIds;
  if (orgUnitIds !== null && orgUnitIds.length > 0) {
    predicates.push((eb) => eb('member.org_unit_id', 'in', orgUnitIds));
  }

  const employmentType = filters.employmentType;
  if (employmentType !== null) {
    predicates.push((eb) => eb('member.employment_type', '=', employmentType));
  }

  const status = filters.status;
  if (status !== null) {
    predicates.push((eb) => eb('member.status', '=', status));
  }

  const roleId = filters.roleId;
  if (roleId !== null) {
    predicates.push((eb) => eb('member.role_id', '=', roleId));
  }

  const skillIds = filters.skillIds;
  if (skillIds !== null && skillIds.length > 0) {
    // Members having ANY of the requested skills. EXISTS keeps this one query and
    // avoids the row multiplication a join would produce.
    predicates.push((eb) =>
      eb.exists(
        eb
          .selectFrom('member_skill')
          .select('member_skill.member_id')
          .whereRef('member_skill.member_id', '=', 'member.id')
          .where('member_skill.skill_id', 'in', skillIds),
      ),
    );
  }

  return predicates;
}

function combine(predicates: MemberPredicate[]): MemberPredicate {
  // An empty list must mean "no restriction", so `and([])` -> TRUE is the correct
  // identity here. Callers that need a restriction always contribute a predicate.
  return (eb) => eb.and(predicates.map((predicate) => predicate(eb)));
}

export class MemberRepository {
  constructor(private readonly db: DbOrTx) {}

  async findById(id: MemberId, scope: ScopeFilter): Promise<Member | null> {
    if (!isUuid(id)) return null;
    const row = await this.db
      .selectFrom('member')
      .selectAll()
      .where('member.id', '=', id)
      .where(combine(scopePredicates(scope)))
      .executeTakeFirst();
    if (!row) return null;
    const skills = await this.findSkillIds([row.id]);
    return toMember(row, skills.get(row.id) ?? []);
  }

  /**
   * Existence, location and status only — no personal fields. Used by authorization and
   * assignment validation, which need to know WHERE a member sits, not who they are.
   * Deliberately unscoped: callers pass the result to an authorization decision.
   */
  async findLocation(
    id: MemberId,
  ): Promise<{ id: MemberId; orgUnitId: OrgUnitId; status: MemberStatus } | null> {
    if (!isUuid(id)) return null;
    const row = await this.db
      .selectFrom('member')
      .select(['id', 'org_unit_id', 'status'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? { id: row.id, orgUnitId: row.org_unit_id, status: row.status } : null;
  }

  async search(query: MemberQuery, scope: ScopeFilter): Promise<Page<MemberSummary>> {
    const predicate = combine([...scopePredicates(scope), ...filterPredicates(query)]);
    const base = this.db.selectFrom('member').where(predicate);

    // The total must reflect the SAME predicate as the page, so both derive from one
    // builder. A count computed from different filters produces pagination that
    // disagrees with its own contents.
    const [countRow, rows] = await Promise.all([
      base.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow(),
      base
        .selectAll('member')
        .orderBy('member.full_name', 'asc')
        // Tie-break on id so paging is stable when two members share a name; without it
        // a row can appear on two consecutive pages, or on neither.
        .orderBy('member.id', 'asc')
        .offset(query.offset)
        .limit(query.limit)
        .execute(),
    ]);

    return {
      items: rows.map(toMemberSummary),
      total: Number(countRow.count),
      offset: query.offset,
      limit: query.limit,
    };
  }

  /**
   * Skills for many members in ONE query (the N+1 prohibition, R2-1 rule 2).
   * A 200-row member list must not become 201 queries.
   */
  async findSkillIds(memberIds: readonly MemberId[]): Promise<Map<MemberId, ReferenceId[]>> {
    const result = new Map<MemberId, ReferenceId[]>();
    const valid = keepUuids(memberIds);
    if (valid.length === 0) return result;

    const rows = await this.db
      .selectFrom('member_skill')
      .select(['member_id', 'skill_id'])
      .where('member_id', 'in', valid)
      .execute();

    for (const row of rows) {
      const existing = result.get(row.member_id);
      if (existing) existing.push(row.skill_id);
      else result.set(row.member_id, [row.skill_id]);
    }
    return result;
  }

  async create(input: MemberWrite): Promise<Member> {
    return withPgErrors(async () => {
      const row = await this.db
        .insertInto('member')
        .values({
          external_ref: input.externalRef,
          full_name: input.fullName,
          email: input.email,
          org_unit_id: input.orgUnitId,
          employment_type: input.employmentType,
          role_id: input.roleId,
          vendor_name: input.vendorName,
          contract_start_date: input.contractStartDate,
          contract_end_date: input.contractEndDate,
          contract_status: input.contractStatus,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toMember(row, []);
    });
  }

  async update(id: MemberId, input: MemberWrite): Promise<Member | null> {
    return withPgErrors(async () => {
      const row = await this.db
        .updateTable('member')
        .set({
          external_ref: input.externalRef,
          full_name: input.fullName,
          email: input.email,
          org_unit_id: input.orgUnitId,
          employment_type: input.employmentType,
          role_id: input.roleId,
          vendor_name: input.vendorName,
          contract_start_date: input.contractStartDate,
          contract_end_date: input.contractEndDate,
          contract_status: input.contractStatus,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      if (!row) return null;
      const skills = await this.findSkillIds([id]);
      return toMember(row, skills.get(id) ?? []);
    });
  }

  /** Replaces the whole skill set. Runs inside the caller's transaction. */
  async replaceSkills(id: MemberId, skillIds: readonly ReferenceId[]): Promise<void> {
    await withPgErrors(async () => {
      await this.db.deleteFrom('member_skill').where('member_id', '=', id).execute();
      const distinct = [...new Set(skillIds)];
      if (distinct.length > 0) {
        await this.db
          .insertInto('member_skill')
          .values(distinct.map((skillId) => ({ member_id: id, skill_id: skillId })))
          .execute();
      }
    });
  }

  /** BR-M-08: deactivation records the date. Members are never deleted. */
  async deactivate(id: MemberId, deactivatedOn: IsoDate): Promise<Member | null> {
    return this.setStatus(id, 'INACTIVE', deactivatedOn);
  }

  async reactivate(id: MemberId): Promise<Member | null> {
    return this.setStatus(id, 'ACTIVE', null);
  }

  private async setStatus(
    id: MemberId,
    status: MemberStatus,
    deactivatedOn: IsoDate | null,
  ): Promise<Member | null> {
    const row = await this.db
      .updateTable('member')
      .set({ status, deactivated_on: deactivatedOn, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    if (!row) return null;
    const skills = await this.findSkillIds([id]);
    return toMember(row, skills.get(id) ?? []);
  }

  /**
   * Contract windows for many members at once — required for BR-A-13 conflict detection
   * without a per-member query. Members with no contract map to null explicitly, so a
   * caller can distinguish "no contract" from "member not found" (absent from the map).
   */
  async findContractWindows(
    memberIds: readonly MemberId[],
  ): Promise<Map<MemberId, { startDate: IsoDate; endDate: IsoDate } | null>> {
    const result = new Map<MemberId, { startDate: IsoDate; endDate: IsoDate } | null>();
    const valid = keepUuids(memberIds);
    if (valid.length === 0) return result;

    const rows = await this.db
      .selectFrom('member')
      .select(['id', 'contract_start_date', 'contract_end_date'])
      .where('id', 'in', valid)
      .execute();

    for (const row of rows) {
      const { contract_start_date: start, contract_end_date: end } = row;
      result.set(row.id, start !== null && end !== null ? { startDate: start, endDate: end } : null);
    }
    return result;
  }
}
