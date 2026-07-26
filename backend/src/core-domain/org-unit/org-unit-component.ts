/**
 * C-05 OrgUnitComponent — the two-level organisational hierarchy.
 *
 * BR-O-06: org units are ADMIN-MANAGED DATA. Nothing here hardcodes a department or team
 * name, and adding one requires no code change and no redeployment. The same applies to
 * the vocabulary: per BR-C-08 the names here are "department" and "team", which are
 * team-type-agnostic — an IT org and a Sales org both have them.
 *
 * Business rules live in this layer, never in a route handler and never in the database
 * beyond the constraints that backstop them (US-ENB-04).
 */

import {
  ConflictError,
  NotFoundError,
  ValidationError,
  ViolationCollector,
} from '../../shared/errors';
import type { OrgUnitRepository } from '../../shared/repository';
import type { OrgUnitId, UserRole } from '../../shared/types/domain';
import type { OrgUnit } from '../../shared/types/domain';

export interface OrgUnitInput {
  name: string;
  /** null for a department (level 1); set for a team (level 2). */
  parentOrgUnitId: OrgUnitId | null;
}

export interface OrgUnitNode {
  orgUnit: OrgUnit;
  children: OrgUnitNode[];
}

export interface ReferenceCount {
  memberCount: number;
  projectCount: number;
  childOrgUnitCount: number;
}

export interface RemoveResult {
  removed: boolean;
  /** Populated when removal was refused, so the caller can say WHAT blocked it. */
  blockedBy: ReferenceCount | null;
}

const MAX_NAME_LENGTH = 120;

export class OrgUnitComponent {
  constructor(private readonly repository: OrgUnitRepository) {}

  async getById(id: OrgUnitId): Promise<OrgUnit | null> {
    return this.repository.findById(id);
  }

  async listAll(includeInactive = false): Promise<OrgUnit[]> {
    return this.repository.findAll(includeInactive);
  }

  /**
   * The hierarchy as a tree. Built from ONE flat fetch rather than a query per
   * department (the N+1 prohibition), which matters because this feeds the org-unit
   * picker on every member and project form.
   *
   * Exactly two levels means a single grouping pass suffices; no recursion is needed,
   * and a unit whose parent is missing or inactive is surfaced as a root rather than
   * silently dropped — losing a unit from the picker would make its members unassignable
   * with no visible cause.
   */
  async listHierarchy(includeInactive = false): Promise<OrgUnitNode[]> {
    const units = await this.repository.findAll(includeInactive);

    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const childrenByParent = new Map<OrgUnitId, OrgUnit[]>();
    const roots: OrgUnit[] = [];

    for (const unit of units) {
      const parentId = unit.parentOrgUnitId;
      if (parentId === null || !byId.has(parentId)) {
        roots.push(unit);
        continue;
      }
      const siblings = childrenByParent.get(parentId);
      if (siblings) siblings.push(unit);
      else childrenByParent.set(parentId, [unit]);
    }

    const byName = (a: OrgUnit, b: OrgUnit): number => a.name.localeCompare(b.name);

    return roots.sort(byName).map((root) => ({
      orgUnit: root,
      children: (childrenByParent.get(root.id) ?? []).sort(byName).map((child) => ({
        orgUnit: child,
        children: [], // BR-O-01: a team cannot parent another unit, so depth stops here.
      })),
    }));
  }

  /**
   * BR-O-01 is enforced HERE as well as by the database trigger, because the trigger can
   * only say "no" — this can say why, and name the offending parent.
   */
  async create(input: OrgUnitInput): Promise<OrgUnit> {
    const violations = new ViolationCollector();
    const name = input.name?.trim() ?? '';

    this.validateName(name, violations);
    await this.validateParent(input.parentOrgUnitId, violations);
    violations.throwIfAny('The organisational unit could not be created.');

    // BR-O-02 (unique among siblings, case-insensitive) is enforced by two partial unique
    // indexes. We do NOT pre-check here: a read-then-write check is a race, and the
    // constraint already produces a ConflictError naming the field.
    return this.repository.create({ name, parentOrgUnitId: input.parentOrgUnitId });
  }

  /**
   * Rename only. Reparenting is deliberately NOT supported: moving a team between
   * departments would silently change who can see its members, and every historical
   * allocation figure computed under the old scope. That is a data-migration decision,
   * not an edit — so it is refused rather than quietly allowed.
   */
  async update(id: OrgUnitId, input: Partial<OrgUnitInput>): Promise<OrgUnit> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError('The organisational unit');

    if (
      input.parentOrgUnitId !== undefined &&
      input.parentOrgUnitId !== existing.parentOrgUnitId
    ) {
      throw new ValidationError('An organisational unit cannot be moved.', [
        {
          field: 'parentOrgUnitId',
          rule: 'IMMUTABLE',
          detail:
            'Reparenting is not supported: it would change who can see this unit’s ' +
            'members and alter historical allocation scope. Create the unit in the ' +
            'correct place and move members individually.',
        },
      ]);
    }

    if (input.name === undefined) return existing;

    const violations = new ViolationCollector();
    const name = input.name.trim();
    this.validateName(name, violations);
    violations.throwIfAny('The organisational unit could not be updated.');

    const updated = await this.repository.rename(id, name);
    if (!updated) throw new NotFoundError('The organisational unit');
    return updated;
  }

  async countReferences(id: OrgUnitId): Promise<ReferenceCount> {
    const counts = await this.repository.countReferences(id);
    return {
      memberCount: counts.members,
      projectCount: counts.projects,
      childOrgUnitCount: counts.childOrgUnits,
    };
  }

  /**
   * BR-O-05: refuse removal while anything references the unit, and report WHAT
   * references it.
   *
   * Returning a RemoveResult rather than throwing is deliberate — "blocked, and here is
   * why" is a normal, expected answer the UI renders as guidance, not an error. Note
   * `userAccounts` is counted by the repository but is NOT part of the designed
   * ReferenceCount shape; it still blocks removal, and is reported through the thrown
   * ConflictError below so it cannot be silently ignored.
   */
  async remove(id: OrgUnitId): Promise<RemoveResult> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError('The organisational unit');

    const raw = await this.repository.countReferences(id);
    const blocking: ReferenceCount = {
      memberCount: raw.members,
      projectCount: raw.projects,
      childOrgUnitCount: raw.childOrgUnits,
    };

    if (raw.members > 0 || raw.projects > 0 || raw.childOrgUnits > 0) {
      return { removed: false, blockedBy: blocking };
    }

    if (raw.userAccounts > 0) {
      // Outside the designed ReferenceCount shape, so it cannot be reported through
      // blockedBy without widening a published interface. Throwing keeps it visible.
      throw new ConflictError(
        `This unit cannot be removed: ${raw.userAccounts} user account(s) still use it as their home unit.`,
        { field: 'homeOrgUnitId', userAccounts: raw.userAccounts },
      );
    }

    const removed = await this.repository.delete(id);
    return { removed, blockedBy: null };
  }

  /** BR-O-05 also covers deactivation, which is the softer alternative to removal. */
  async deactivate(id: OrgUnitId): Promise<OrgUnit> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError('The organisational unit');

    const children = await this.repository.countReferences(id);
    if (children.childOrgUnits > 0) {
      throw new ConflictError(
        `This department cannot be deactivated while it still has ${children.childOrgUnits} team(s). Deactivate the teams first.`,
        { field: 'isActive', childOrgUnits: children.childOrgUnits },
      );
    }

    const updated = await this.repository.setActive(id, false);
    if (!updated) throw new NotFoundError('The organisational unit');
    return updated;
  }

  async reactivate(id: OrgUnitId): Promise<OrgUnit> {
    const updated = await this.repository.setActive(id, true);
    if (!updated) throw new NotFoundError('The organisational unit');
    return updated;
  }

  /**
   * Which org units a role may see. Feeds `ScopeFilter`, so it is security-relevant.
   *
   * A department-scoped user reaches their department AND its teams, resolved through the
   * subtree query — otherwise a department head could not see the members of their own
   * teams, which is the common case rather than an edge case.
   *
   * A role that should be scoped but has NO home org unit resolves to the EMPTY list,
   * never to 'ALL'. Failing closed matters: a misconfigured account seeing nothing is a
   * support ticket, whereas one seeing everything is a data breach. The repository turns
   * an empty list into an impossible predicate rather than an absent filter.
   */
  async resolveScope(
    role: UserRole,
    homeOrgUnitId: OrgUnitId | null,
  ): Promise<OrgUnitId[] | 'ALL'> {
    if (role === 'ADMIN' || role === 'EXECUTIVE') return 'ALL';

    if (homeOrgUnitId === null) return [];

    const subtree = await this.repository.findSubtreeIds([homeOrgUnitId]);
    // A home unit that no longer exists yields an empty subtree, which correctly denies
    // access rather than defaulting to unrestricted.
    return subtree;
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

  /** BR-O-01: a team may not parent another unit, and the parent must exist. */
  private async validateParent(
    parentOrgUnitId: OrgUnitId | null,
    violations: ViolationCollector,
  ): Promise<void> {
    if (parentOrgUnitId === null) return;

    const parent = await this.repository.findById(parentOrgUnitId);
    if (!parent) {
      violations.add(
        'parentOrgUnitId',
        'NOT_FOUND',
        'The selected parent unit does not exist.',
      );
      return;
    }

    if (parent.parentOrgUnitId !== null) {
      violations.add(
        'parentOrgUnitId',
        'DEPTH_EXCEEDED',
        `"${parent.name}" is a team, and teams cannot contain other units. ` +
          'The hierarchy is exactly two levels: departments contain teams.',
      );
    }
  }
}
