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
import { isUuid, keepUuids } from '../util/ids';
import { toReferenceDataEntry } from './mappers';
import { withPgErrors } from './pg-errors';

export class ReferenceDataRepository {
  constructor(private readonly db: DbOrTx) {}

  async findById(id: ReferenceId): Promise<ReferenceDataEntry | null> {
    if (!isUuid(id)) return null;
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
    const valid = keepUuids(ids);
    if (valid.length === 0) return [];
    const rows = await this.db
      .selectFrom('reference_data_entry')
      .selectAll()
      .where('id', 'in', valid)
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
    const valid = keepUuids(ids);
    if (valid.length === 0) return new Set();
    const rows = await this.db
      .selectFrom('reference_data_entry')
      .select('id')
      .where('id', 'in', valid)
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

  /**
   * Hard delete. Permitted ONLY when nothing references the entry — BR-C-06 refuses
   * removal of a referenced entry and offers deactivation instead. The caller checks
   * references first; the foreign keys are the backstop if it does not, and a violation
   * surfaces as a ConflictError rather than orphaning rows.
   *
   * BR-C-05 (deactivate rather than delete) is the normal path; this exists for the
   * genuinely-unused entry an admin created by mistake.
   */
  async delete(id: ReferenceId): Promise<boolean> {
    return withPgErrors(async () => {
      if (!isUuid(id)) return false;
      const result = await this.db
        .deleteFrom('reference_data_entry')
        .where('id', '=', id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    });
  }

  /** BR-C-05: deactivation is the normal path; see `delete` for the narrow exception. */
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
