/**
 * Reference data persistence — generic over ROLE / SKILL / PROJECT_TYPE (BR-C-01).
 *
 * One table and one repository for all three types, because the behaviour is identical:
 * unique name within type (BR-C-03), deactivate rather than delete (BR-C-05), and
 * existing references survive deactivation (BR-C-06). Three near-identical tables would
 * have triplicated every rule.
 */

import type { DbOrTx } from './db';
import type { ReferenceDataEntry, ReferenceId, ReferenceType } from '../types/domain';
import { toReferenceDataEntry } from './mappers';
import { withPgErrors } from './pg-errors';

export class ReferenceDataRepository {
  constructor(private readonly db: DbOrTx) {}

  async findById(id: ReferenceId): Promise<ReferenceDataEntry | null> {
    const row = await this.db
      .selectFrom('reference_data_entry')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toReferenceDataEntry(row) : null;
  }

  async findByType(
    referenceType: ReferenceType,
    includeInactive: boolean,
  ): Promise<ReferenceDataEntry[]> {
    let query = this.db
      .selectFrom('reference_data_entry')
      .selectAll()
      .where('reference_type', '=', referenceType);
    if (!includeInactive) query = query.where('is_active', '=', true);
    const rows = await query.orderBy('name', 'asc').execute();
    return rows.map(toReferenceDataEntry);
  }

  /** Batched by design: forms need ROLE, SKILL and PROJECT_TYPE at once (the N+1 rule). */
  async findByIds(ids: readonly ReferenceId[]): Promise<ReferenceDataEntry[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('reference_data_entry')
      .selectAll()
      .where('id', 'in', [...ids])
      .execute();
    return rows.map(toReferenceDataEntry);
  }

  /**
   * Which of `ids` exist AND are of the expected type AND are active.
   * Used to validate a submitted role or skill set in ONE round trip rather than one
   * query per id. Returns the ids found, so the caller can report every missing one
   * (US-MEM-07: all violations, not the first).
   */
  async findActiveIdsOfType(
    ids: readonly ReferenceId[],
    referenceType: ReferenceType,
  ): Promise<Set<ReferenceId>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .selectFrom('reference_data_entry')
      .select('id')
      .where('id', 'in', [...ids])
      .where('reference_type', '=', referenceType)
      .where('is_active', '=', true)
      .execute();
    return new Set(rows.map((r) => r.id));
  }

  async create(referenceType: ReferenceType, name: string): Promise<ReferenceDataEntry> {
    return withPgErrors(async () => {
      const row = await this.db
        .insertInto('reference_data_entry')
        .values({ reference_type: referenceType, name })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toReferenceDataEntry(row);
    });
  }

  async rename(id: ReferenceId, name: string): Promise<ReferenceDataEntry | null> {
    return withPgErrors(async () => {
      const row = await this.db
        .updateTable('reference_data_entry')
        .set({ name, updated_at: new Date() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? toReferenceDataEntry(row) : null;
    });
  }

  /** BR-C-05: deactivate, never delete. There is no delete method on purpose. */
  async setActive(id: ReferenceId, isActive: boolean): Promise<ReferenceDataEntry | null> {
    const row = await this.db
      .updateTable('reference_data_entry')
      .set({ is_active: isActive, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toReferenceDataEntry(row) : null;
  }

  /**
   * How many records still point at this entry. BR-C-06 keeps those references valid
   * after deactivation, so this is reported to the admin as information — it does NOT
   * block the deactivation.
   */
  async countReferences(id: ReferenceId): Promise<{
    membersByRole: number;
    membersBySkill: number;
    projectsByType: number;
    assignmentsByProjectRole: number;
  }> {
    const [role, skill, projectType, projectRole] = await Promise.all([
      this.db
        .selectFrom('member')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('role_id', '=', id)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('member_skill')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('skill_id', '=', id)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('project')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('project_type_id', '=', id)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('assignment')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('project_role_id', '=', id)
        .executeTakeFirstOrThrow(),
    ]);
    return {
      membersByRole: Number(role.count),
      membersBySkill: Number(skill.count),
      projectsByType: Number(projectType.count),
      assignmentsByProjectRole: Number(projectRole.count),
    };
  }
}
