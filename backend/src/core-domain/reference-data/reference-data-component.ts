/**
 * C-06 ReferenceDataComponent — roles, skills and project types.
 *
 * BR-C-01: these are ADMIN-MANAGED RECORDS, never hardcoded enumerations. There is no
 * enum of role names anywhere in this file; the only closed set is `ReferenceType`
 * itself, which names the three KINDS of list rather than their contents.
 *
 * BR-C-08 (no team-type-specific vocabulary) is why one generic component serves all
 * three types instead of `EngineerRoleComponent` or similar: the same code runs for an IT
 * org and a Sales org, and adding a type later needs no new component.
 */

import { NotFoundError, ViolationCollector } from '../../shared/errors';
import type { ReferenceDataRepository } from '../../shared/repository';
import type {
  ReferenceDataEntry,
  ReferenceId,
  ReferenceType,
} from '../../shared/types/domain';

export interface RemoveResult {
  removed: boolean;
  /** Total references blocking removal; null when the entry was removed. */
  blockedBy: number | null;
}

/**
 * Three-way split rather than a boolean.
 *
 * `unknown` and `inactive` are genuinely different failures and must not be conflated:
 * an unknown skill in an import is a typo the admin should fix in the source file, while
 * an inactive one is a real skill that was retired — the admin either reactivates it or
 * maps the row elsewhere. Reporting both as "invalid" would leave them guessing.
 */
export interface ValidateIdsResult {
  valid: ReferenceId[];
  unknown: ReferenceId[];
  inactive: ReferenceId[];
}

const MAX_NAME_LENGTH = 120;

export class ReferenceDataComponent {
  constructor(private readonly repository: ReferenceDataRepository) {}

  /** BR-C-02: a new entry is immediately selectable — nothing is cached here. */
  async list(type: ReferenceType, includeInactive: boolean): Promise<ReferenceDataEntry[]> {
    return this.repository.findByType(type, includeInactive);
  }

  async getById(id: ReferenceId): Promise<ReferenceDataEntry | null> {
    return this.repository.findById(id);
  }

  async create(type: ReferenceType, name: string): Promise<ReferenceDataEntry> {
    const violations = new ViolationCollector();
    const trimmed = name?.trim() ?? '';
    this.validateName(trimmed, violations);
    violations.throwIfAny('The entry could not be created.');

    // BR-C-03 (unique per type, case-insensitive) is enforced by the
    // `reference_data_type_name_unique` index. Not pre-checked: a read-then-write check
    // is a race under concurrent creates, and the constraint already yields a
    // ConflictError naming the field.
    return this.repository.create(type, trimmed);
  }

  /**
   * BR-C-04: renaming propagates automatically because every reference is by identifier,
   * never by name. There is deliberately no cascade here — if this method needed to
   * update other tables, that would prove something stored the name instead of the id.
   */
  async rename(id: ReferenceId, name: string): Promise<ReferenceDataEntry> {
    const violations = new ViolationCollector();
    const trimmed = name?.trim() ?? '';
    this.validateName(trimmed, violations);
    violations.throwIfAny('The entry could not be renamed.');

    const updated = await this.repository.rename(id, trimmed);
    if (!updated) throw new NotFoundError('The reference data entry');
    return updated;
  }

  /**
   * BR-C-05: deactivation removes the entry from NEW selections while existing
   * references stay intact and readable.
   *
   * Note what this method does NOT do: it does not touch the members or projects that
   * reference the entry. A member whose role was just deactivated keeps that role and
   * still displays it. Cascading would silently rewrite historical records, which is the
   * opposite of the intent.
   */
  async deactivate(id: ReferenceId): Promise<ReferenceDataEntry> {
    const updated = await this.repository.setActive(id, false);
    if (!updated) throw new NotFoundError('The reference data entry');
    return updated;
  }

  /** BR-C-07: deactivated entries can be reactivated. */
  async reactivate(id: ReferenceId): Promise<ReferenceDataEntry> {
    const updated = await this.repository.setActive(id, true);
    if (!updated) throw new NotFoundError('The reference data entry');
    return updated;
  }

  async countReferences(id: ReferenceId): Promise<number> {
    const counts = await this.repository.countReferences(id);
    return (
      counts.membersByRole +
      counts.membersBySkill +
      counts.projectsByType +
      counts.assignmentsByProjectRole
    );
  }

  /**
   * BR-C-06: hard deletion of a REFERENCED entry is refused, reporting the reference
   * count so the caller can offer deactivation instead.
   *
   * Unreferenced entries are genuinely deleted — an admin who created "Enginer" by
   * mistake should be able to remove it, not be forced to leave a deactivated typo in
   * the list forever.
   *
   * The check-then-delete window is closed by the foreign keys: if a reference appears
   * between the count and the delete, the database refuses and `withPgErrors` raises a
   * ConflictError rather than orphaning a row.
   */
  async remove(id: ReferenceId): Promise<RemoveResult> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError('The reference data entry');

    const references = await this.countReferences(id);
    if (references > 0) {
      return { removed: false, blockedBy: references };
    }

    const removed = await this.repository.delete(id);
    return { removed, blockedBy: null };
  }

  /**
   * Validates a submitted id set in ONE round trip, classifying every id.
   *
   * Exists for ImportComponent (Unit 2), which must report unmatched reference values
   * rather than silently creating them — an import that invents a "Sr. Enginer" role
   * because of a typo corrupts the reference list permanently.
   *
   * Ids that are not well-formed uuids are reported as `unknown` rather than raising:
   * a malformed value in an imported file is bad data to be reported, not a server
   * error. Duplicates in the input collapse, and the classification is total — every
   * input id lands in exactly one bucket.
   */
  async validateIds(
    type: ReferenceType,
    ids: readonly ReferenceId[],
  ): Promise<ValidateIdsResult> {
    const requested = [...new Set(ids)];
    if (requested.length === 0) return { valid: [], unknown: [], inactive: [] };

    const found = await this.repository.findByIds(requested);
    const byId = new Map(found.map((entry) => [entry.id, entry]));

    const result: ValidateIdsResult = { valid: [], unknown: [], inactive: [] };

    for (const id of requested) {
      const entry = byId.get(id);
      // A wrong-type match is `unknown`, not `inactive`: a SKILL id submitted where a
      // ROLE was expected does not identify a valid role, and saying "inactive" would
      // send the admin looking for something to reactivate.
      if (!entry || entry.referenceType !== type) {
        result.unknown.push(id);
      } else if (!entry.isActive) {
        result.inactive.push(id);
      } else {
        result.valid.push(id);
      }
    }

    return result;
  }

  private validateName(name: string, violations: ViolationCollector): void {
    violations
      .addIf(name === '', 'name', 'REQUIRED', 'A name is required.')
      .addIf(
        name.length > MAX_NAME_LENGTH,
        'name',
        'TOO_LONG',
        `A name may be at most ${MAX_NAME_LENGTH} characters.`,
      );
  }
}
