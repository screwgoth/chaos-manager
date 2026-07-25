/**
 * OrgUnit persistence. Supports the two-level hierarchy (BR-O-01) and the reference
 * counting that makes deactivation safe (BR-O-05).
 */

import type { DbOrTx } from './db';
import type { OrgUnit, OrgUnitId } from '../types/domain';
import { toOrgUnit } from './mappers';
import { withPgErrors } from './pg-errors';

export interface OrgUnitInsert {
  name: string;
  parentOrgUnitId: OrgUnitId | null;
}

export interface OrgUnitReferenceCounts {
  childOrgUnits: number;
  members: number;
  projects: number;
  userAccounts: number;
}

export class OrgUnitRepository {
  constructor(private readonly db: DbOrTx) {}

  async findById(id: OrgUnitId): Promise<OrgUnit | null> {
    const row = await this.db
      .selectFrom('org_unit')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toOrgUnit(row) : null;
  }

  async findAll(includeInactive: boolean): Promise<OrgUnit[]> {
    let query = this.db.selectFrom('org_unit').selectAll();
    if (!includeInactive) query = query.where('is_active', '=', true);
    const rows = await query.orderBy('name', 'asc').execute();
    return rows.map(toOrgUnit);
  }

  async findByIds(ids: readonly OrgUnitId[]): Promise<OrgUnit[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('org_unit')
      .selectAll()
      .where('id', 'in', [...ids])
      .execute();
    return rows.map(toOrgUnit);
  }

  /**
   * The unit plus all its descendants — one query, not a recursive walk.
   * This is how a department-scoped user reaches the members of its teams
   * (scope resolution, US-ADM-03). Exactly two levels means one self-join suffices.
   */
  async findSubtreeIds(rootIds: readonly OrgUnitId[]): Promise<OrgUnitId[]> {
    if (rootIds.length === 0) return [];
    const ids = [...rootIds];
    const rows = await this.db
      .selectFrom('org_unit')
      .select('id')
      .where((eb) => eb.or([eb('id', 'in', ids), eb('parent_org_unit_id', 'in', ids)]))
      .execute();
    return rows.map((r) => r.id);
  }

  async create(input: OrgUnitInsert): Promise<OrgUnit> {
    return withPgErrors(async () => {
      const row = await this.db
        .insertInto('org_unit')
        .values({ name: input.name, parent_org_unit_id: input.parentOrgUnitId })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toOrgUnit(row);
    });
  }

  async rename(id: OrgUnitId, name: string): Promise<OrgUnit | null> {
    return withPgErrors(async () => {
      const row = await this.db
        .updateTable('org_unit')
        .set({ name, updated_at: new Date() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? toOrgUnit(row) : null;
    });
  }

  async setActive(id: OrgUnitId, isActive: boolean): Promise<OrgUnit | null> {
    const row = await this.db
      .updateTable('org_unit')
      .set({ is_active: isActive, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toOrgUnit(row) : null;
  }

  /**
   * BR-O-05: an org unit that is still referenced cannot be deactivated. Counting in
   * SQL rather than fetching the rows keeps this O(1) in transferred data — these counts
   * are the only thing the caller needs, and the row contents are personal data.
   */
  async countReferences(id: OrgUnitId): Promise<OrgUnitReferenceCounts> {
    const [children, members, projects, users] = await Promise.all([
      this.countWhere('org_unit', 'parent_org_unit_id', id),
      this.countWhere('member', 'org_unit_id', id),
      this.countWhere('project', 'owning_org_unit_id', id),
      this.countWhere('user_account', 'home_org_unit_id', id),
    ]);
    return {
      childOrgUnits: children,
      members,
      projects,
      userAccounts: users,
    };
  }

  private async countWhere(
    table: 'org_unit' | 'member' | 'project' | 'user_account',
    column: 'parent_org_unit_id' | 'org_unit_id' | 'owning_org_unit_id' | 'home_org_unit_id',
    value: string,
  ): Promise<number> {
    // Cast is confined to this one private helper: Kysely cannot express a
    // (table, column) pair generically, and the alternative is four near-identical
    // public methods. The union types above keep the call sites checked.
    const result = await (this.db as DbOrTx)
      .selectFrom(table as never)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where(column as never, '=', value as never)
      .executeTakeFirstOrThrow();
    return Number((result as { count: number }).count);
  }
}
