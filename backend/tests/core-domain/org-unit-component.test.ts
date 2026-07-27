/**
 * C-05 OrgUnitComponent tests.
 *
 * These use a hand-written fake repository rather than a database: the rules under test
 * are decisions this component makes (two-level depth, scope resolution, refusal to
 * reparent), and a fake keeps them readable. The repository's own SQL behaviour is
 * covered by repository-integration.test.ts.
 *
 * `resolveScope` is the security-relevant one — it decides what a user can see.
 */

import { ConflictError, NotFoundError, ValidationError } from '../../src/shared/errors';
import { OrgUnitComponent } from '../../src/core-domain/org-unit/org-unit-component';
import type { OrgUnitRepository } from '../../src/shared/repository';
import type { OrgUnit } from '../../src/shared/types/domain';

interface FakeState {
  units: OrgUnit[];
  references: Record<
    string,
    { childOrgUnits: number; members: number; projects: number; userAccounts: number }
  >;
  deleted: string[];
}

function makeRepository(state: FakeState): OrgUnitRepository {
  const noRefs = { childOrgUnits: 0, members: 0, projects: 0, userAccounts: 0 };

  const fake = {
    findById: async (id: string) => state.units.find((u) => u.id === id) ?? null,
    findAll: async (includeInactive: boolean) =>
      state.units.filter((u) => includeInactive || u.isActive),
    findByIds: async (ids: readonly string[]) =>
      state.units.filter((u) => ids.includes(u.id)),
    findSubtreeIds: async (rootIds: readonly string[]) => {
      const ids = state.units
        .filter((u) => rootIds.includes(u.id) || (u.parentOrgUnitId !== null && rootIds.includes(u.parentOrgUnitId)))
        .map((u) => u.id);
      return ids;
    },
    create: async (input: { name: string; parentOrgUnitId: string | null }) => {
      const created: OrgUnit = {
        id: `ou-${state.units.length + 1}`,
        name: input.name,
        parentOrgUnitId: input.parentOrgUnitId,
        isActive: true,
      };
      state.units.push(created);
      return created;
    },
    rename: async (id: string, name: string) => {
      const unit = state.units.find((u) => u.id === id);
      if (!unit) return null;
      unit.name = name;
      return unit;
    },
    setActive: async (id: string, isActive: boolean) => {
      const unit = state.units.find((u) => u.id === id);
      if (!unit) return null;
      unit.isActive = isActive;
      return unit;
    },
    countReferences: async (id: string) => state.references[id] ?? noRefs,
    delete: async (id: string) => {
      const index = state.units.findIndex((u) => u.id === id);
      if (index < 0) return false;
      state.units.splice(index, 1);
      state.deleted.push(id);
      return true;
    },
  };

  return fake as unknown as OrgUnitRepository;
}

const DEPT: OrgUnit = { id: 'ou-dept', name: 'Engineering', parentOrgUnitId: null, isActive: true };
const TEAM: OrgUnit = { id: 'ou-team', name: 'Platform', parentOrgUnitId: 'ou-dept', isActive: true };

function setup(units: OrgUnit[] = [DEPT, TEAM]): {
  component: OrgUnitComponent;
  state: FakeState;
} {
  const state: FakeState = {
    units: units.map((u) => ({ ...u })),
    references: {},
    deleted: [],
  };
  return { component: new OrgUnitComponent(makeRepository(state)), state };
}

describe('two-level hierarchy (BR-O-01)', () => {
  it('creates a department when parentOrgUnitId is null', async () => {
    const { component } = setup([]);
    const created = await component.create({ name: 'Sales', parentOrgUnitId: null });
    expect(created.parentOrgUnitId).toBeNull();
  });

  it('creates a team under a department', async () => {
    const { component } = setup([DEPT]);
    const created = await component.create({ name: 'Field', parentOrgUnitId: DEPT.id });
    expect(created.parentOrgUnitId).toBe(DEPT.id);
  });

  it('REFUSES a third level, naming the offending parent', async () => {
    const { component } = setup();
    // TEAM already has a parent, so it cannot be a parent itself.
    const attempt = component.create({ name: 'Sub-squad', parentOrgUnitId: TEAM.id });

    await expect(attempt).rejects.toThrow(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      violations: [
        {
          field: 'parentOrgUnitId',
          rule: 'DEPTH_EXCEEDED',
          detail: expect.stringContaining('Platform'),
        },
      ],
    });
  });

  it('rejects a parent that does not exist', async () => {
    const { component } = setup();
    await expect(
      component.create({ name: 'Orphan', parentOrgUnitId: 'ou-nope' }),
    ).rejects.toMatchObject({
      violations: [{ field: 'parentOrgUnitId', rule: 'NOT_FOUND' }],
    });
  });

  it('reports ALL violations at once, not just the first', async () => {
    const { component } = setup();
    // Empty name AND an invalid parent.
    const attempt = component.create({ name: '   ', parentOrgUnitId: TEAM.id });
    await expect(attempt).rejects.toMatchObject({
      violations: [
        { field: 'name', rule: 'REQUIRED' },
        { field: 'parentOrgUnitId', rule: 'DEPTH_EXCEEDED' },
      ],
    });
  });
});

describe('listHierarchy', () => {
  it('nests teams under their department and stops at depth two', async () => {
    const { component } = setup();
    const tree = await component.listHierarchy();

    expect(tree).toHaveLength(1);
    expect(tree[0]?.orgUnit.id).toBe(DEPT.id);
    expect(tree[0]?.children.map((c) => c.orgUnit.id)).toEqual([TEAM.id]);
    expect(tree[0]?.children[0]?.children).toEqual([]);
  });

  it('surfaces an orphan as a root rather than dropping it', async () => {
    // A team whose parent is excluded (inactive, filtered out) must still appear —
    // silently dropping it would make its members unassignable with no visible cause.
    const orphan: OrgUnit = {
      id: 'ou-orphan',
      name: 'Stranded',
      parentOrgUnitId: 'ou-missing',
      isActive: true,
    };
    const { component } = setup([orphan]);

    const tree = await component.listHierarchy();
    expect(tree.map((n) => n.orgUnit.id)).toContain('ou-orphan');
  });

  it('sorts departments and teams by name', async () => {
    const { component } = setup([
      { id: 'b', name: 'Beta', parentOrgUnitId: null, isActive: true },
      { id: 'a', name: 'Alpha', parentOrgUnitId: null, isActive: true },
      { id: 'z', name: 'Zeta', parentOrgUnitId: 'a', isActive: true },
      { id: 'm', name: 'Mid', parentOrgUnitId: 'a', isActive: true },
    ]);

    const tree = await component.listHierarchy();
    expect(tree.map((n) => n.orgUnit.name)).toEqual(['Alpha', 'Beta']);
    expect(tree[0]?.children.map((c) => c.orgUnit.name)).toEqual(['Mid', 'Zeta']);
  });
});

describe('update refuses reparenting', () => {
  it('rejects a parent change with an explanation', async () => {
    const { component } = setup();
    const attempt = component.update(TEAM.id, { parentOrgUnitId: null });

    await expect(attempt).rejects.toThrow(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      violations: [{ field: 'parentOrgUnitId', rule: 'IMMUTABLE' }],
    });
  });

  it('permits a rename', async () => {
    const { component } = setup();
    const renamed = await component.update(TEAM.id, { name: 'Platform Engineering' });
    expect(renamed.name).toBe('Platform Engineering');
  });

  it('treats an unchanged parent as a no-op rather than an error', async () => {
    const { component } = setup();
    const result = await component.update(TEAM.id, { parentOrgUnitId: DEPT.id });
    expect(result.id).toBe(TEAM.id);
  });

  it('throws NotFoundError for a missing unit', async () => {
    const { component } = setup();
    await expect(component.update('ou-nope', { name: 'X' })).rejects.toThrow(NotFoundError);
  });
});

describe('removal is refused while referenced (BR-O-05)', () => {
  it('reports what blocks it instead of throwing', async () => {
    const { component, state } = setup();
    state.references[DEPT.id] = {
      childOrgUnits: 1,
      members: 3,
      projects: 2,
      userAccounts: 0,
    };

    const result = await component.remove(DEPT.id);
    expect(result.removed).toBe(false);
    expect(result.blockedBy).toEqual({ memberCount: 3, projectCount: 2, childOrgUnitCount: 1 });
    expect(state.deleted).toEqual([]);
  });

  it('removes an unreferenced unit', async () => {
    const { component, state } = setup();
    const result = await component.remove(TEAM.id);
    expect(result.removed).toBe(true);
    expect(result.blockedBy).toBeNull();
    expect(state.deleted).toEqual([TEAM.id]);
  });

  it('blocks on a linked user account, which the designed shape cannot express', async () => {
    // userAccounts is outside ReferenceCount, so it surfaces as a ConflictError rather
    // than being silently ignored.
    const { component, state } = setup();
    state.references[TEAM.id] = {
      childOrgUnits: 0,
      members: 0,
      projects: 0,
      userAccounts: 2,
    };

    await expect(component.remove(TEAM.id)).rejects.toThrow(ConflictError);
    expect(state.deleted).toEqual([]);
  });
});

describe('deactivation', () => {
  it('refuses a department that still has teams', async () => {
    const { component, state } = setup();
    state.references[DEPT.id] = {
      childOrgUnits: 1,
      members: 0,
      projects: 0,
      userAccounts: 0,
    };
    await expect(component.deactivate(DEPT.id)).rejects.toThrow(ConflictError);
  });

  it('deactivates and reactivates a leaf unit', async () => {
    const { component } = setup();
    expect((await component.deactivate(TEAM.id)).isActive).toBe(false);
    expect((await component.reactivate(TEAM.id)).isActive).toBe(true);
  });
});

/**
 * The security-critical behaviour. A wrong answer here either hides data from someone
 * entitled to it, or exposes data to someone who is not.
 */
describe('resolveScope (feeds ScopeFilter — fails CLOSED)', () => {
  it('gives ADMIN and EXECUTIVE unrestricted access', async () => {
    const { component } = setup();
    expect(await component.resolveScope('ADMIN', null)).toBe('ALL');
    expect(await component.resolveScope('EXECUTIVE', null)).toBe('ALL');
  });

  it('resolves a department to itself AND its teams', async () => {
    const { component } = setup();
    const scope = await component.resolveScope('TEAM_LEAD', DEPT.id);

    // Without the subtree, a department head could not see their own teams' members.
    expect(scope).toEqual(expect.arrayContaining([DEPT.id, TEAM.id]));
  });

  it('resolves a team to just that team', async () => {
    const { component } = setup();
    expect(await component.resolveScope('TEAM_LEAD', TEAM.id)).toEqual([TEAM.id]);
  });

  it('returns the EMPTY list — never ALL — for a scoped role with no home unit', async () => {
    const { component } = setup();
    for (const role of ['TEAM_LEAD', 'RESOURCE_MANAGER', 'TEAM_MEMBER'] as const) {
      const scope = await component.resolveScope(role, null);
      expect(scope).toEqual([]);
      expect(scope).not.toBe('ALL');
    }
  });

  it('returns the EMPTY list when the home unit no longer exists', async () => {
    // Failing closed: seeing nothing is a support ticket, seeing everything is a breach.
    const { component } = setup();
    expect(await component.resolveScope('TEAM_LEAD', 'ou-deleted')).toEqual([]);
  });
});
