/**
 * C-06 ReferenceDataComponent tests.
 *
 * The behaviour worth protecting here is `validateIds`, which ImportComponent (Unit 2)
 * depends on to report unmatched values rather than silently inventing reference entries.
 * Its three-way classification must be total and must not conflate unknown with inactive.
 */

import { NotFoundError, ValidationError } from '../../src/shared/errors';
import { ReferenceDataComponent } from '../../src/core-domain/reference-data/reference-data-component';
import type { ReferenceDataRepository } from '../../src/shared/repository';
import type { ReferenceDataEntry, ReferenceType } from '../../src/shared/types/domain';

interface FakeState {
  entries: ReferenceDataEntry[];
  counts: Record<
    string,
    {
      membersByRole: number;
      membersBySkill: number;
      projectsByType: number;
      assignmentsByProjectRole: number;
    }
  >;
  deleted: string[];
}

function makeRepository(state: FakeState): ReferenceDataRepository {
  const zero = {
    membersByRole: 0,
    membersBySkill: 0,
    projectsByType: 0,
    assignmentsByProjectRole: 0,
  };

  const fake = {
    findById: async (id: string) => state.entries.find((e) => e.id === id) ?? null,
    findByType: async (type: ReferenceType, includeInactive: boolean) =>
      state.entries.filter((e) => e.referenceType === type && (includeInactive || e.isActive)),
    findByIds: async (ids: readonly string[]) => state.entries.filter((e) => ids.includes(e.id)),
    findActiveIdsOfType: async (ids: readonly string[], type: ReferenceType) =>
      new Set(
        state.entries
          .filter((e) => ids.includes(e.id) && e.referenceType === type && e.isActive)
          .map((e) => e.id),
      ),
    create: async (type: ReferenceType, name: string) => {
      const created: ReferenceDataEntry = {
        id: `ref-${state.entries.length + 1}`,
        referenceType: type,
        name,
        isActive: true,
      };
      state.entries.push(created);
      return created;
    },
    rename: async (id: string, name: string) => {
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return null;
      entry.name = name;
      return entry;
    },
    setActive: async (id: string, isActive: boolean) => {
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return null;
      entry.isActive = isActive;
      return entry;
    },
    countReferences: async (id: string) => state.counts[id] ?? zero,
    delete: async (id: string) => {
      const index = state.entries.findIndex((e) => e.id === id);
      if (index < 0) return false;
      state.entries.splice(index, 1);
      state.deleted.push(id);
      return true;
    },
  };

  return fake as unknown as ReferenceDataRepository;
}

const ACTIVE_ROLE: ReferenceDataEntry = {
  id: 'ref-role-active',
  referenceType: 'ROLE',
  name: 'Engineer',
  isActive: true,
};
const INACTIVE_ROLE: ReferenceDataEntry = {
  id: 'ref-role-inactive',
  referenceType: 'ROLE',
  name: 'Retired Role',
  isActive: false,
};
const ACTIVE_SKILL: ReferenceDataEntry = {
  id: 'ref-skill-active',
  referenceType: 'SKILL',
  name: 'TypeScript',
  isActive: true,
};

function setup(
  entries: ReferenceDataEntry[] = [ACTIVE_ROLE, INACTIVE_ROLE, ACTIVE_SKILL],
): { component: ReferenceDataComponent; state: FakeState } {
  const state: FakeState = {
    entries: entries.map((e) => ({ ...e })),
    counts: {},
    deleted: [],
  };
  return { component: new ReferenceDataComponent(makeRepository(state)), state };
}

describe('one component serves all three types (BR-C-01, BR-C-08)', () => {
  it('lists each type independently', async () => {
    const { component } = setup();
    expect((await component.list('ROLE', false)).map((e) => e.name)).toEqual(['Engineer']);
    expect((await component.list('SKILL', false)).map((e) => e.name)).toEqual(['TypeScript']);
    expect(await component.list('PROJECT_TYPE', false)).toEqual([]);
  });

  it('includes inactive entries only when asked', async () => {
    const { component } = setup();
    expect(await component.list('ROLE', false)).toHaveLength(1);
    expect(await component.list('ROLE', true)).toHaveLength(2);
  });

  it('creates entries of any type without type-specific code', async () => {
    const { component } = setup([]);
    for (const type of ['ROLE', 'SKILL', 'PROJECT_TYPE'] as const) {
      const created = await component.create(type, `Anything ${type}`);
      expect(created.referenceType).toBe(type);
      expect(created.isActive).toBe(true);
    }
  });
});

describe('validation', () => {
  it('rejects an empty or whitespace-only name', async () => {
    const { component } = setup();
    await expect(component.create('ROLE', '   ')).rejects.toThrow(ValidationError);
    await expect(component.create('ROLE', '')).rejects.toMatchObject({
      violations: [{ field: 'name', rule: 'REQUIRED' }],
    });
  });

  it('trims surrounding whitespace rather than storing it', async () => {
    const { component } = setup([]);
    const created = await component.create('ROLE', '  Analyst  ');
    expect(created.name).toBe('Analyst');
  });

  it('rejects an over-long name', async () => {
    const { component } = setup();
    await expect(component.create('ROLE', 'x'.repeat(121))).rejects.toMatchObject({
      violations: [{ field: 'name', rule: 'TOO_LONG' }],
    });
  });

  it('throws NotFoundError when renaming something absent', async () => {
    const { component } = setup();
    await expect(component.rename('ref-nope', 'New')).rejects.toThrow(NotFoundError);
  });
});

describe('deactivation leaves existing references intact (BR-C-05, BR-C-07)', () => {
  it('deactivates without touching referencing records', async () => {
    const { component, state } = setup();
    state.counts[ACTIVE_ROLE.id] = {
      membersByRole: 5,
      membersBySkill: 0,
      projectsByType: 0,
      assignmentsByProjectRole: 0,
    };

    const deactivated = await component.deactivate(ACTIVE_ROLE.id);
    expect(deactivated.isActive).toBe(false);
    // The five members keep their role — the count is unchanged, nothing cascaded.
    expect(await component.countReferences(ACTIVE_ROLE.id)).toBe(5);
  });

  it('reactivates a deactivated entry', async () => {
    const { component } = setup();
    expect((await component.reactivate(INACTIVE_ROLE.id)).isActive).toBe(true);
  });

  it('removes a deactivated entry from new selections but keeps it readable', async () => {
    const { component } = setup();
    const selectable = await component.list('ROLE', false);
    expect(selectable.map((e) => e.id)).not.toContain(INACTIVE_ROLE.id);

    // Still readable by id, so an existing reference can still render its name.
    expect(await component.getById(INACTIVE_ROLE.id)).not.toBeNull();
  });
});

describe('removal is refused while referenced (BR-C-06)', () => {
  it('reports the reference count instead of deleting', async () => {
    const { component, state } = setup();
    state.counts[ACTIVE_ROLE.id] = {
      membersByRole: 2,
      membersBySkill: 0,
      projectsByType: 0,
      assignmentsByProjectRole: 1,
    };

    const result = await component.remove(ACTIVE_ROLE.id);
    expect(result.removed).toBe(false);
    expect(result.blockedBy).toBe(3); // summed across all referencing kinds
    expect(state.deleted).toEqual([]);
  });

  it('deletes an unreferenced entry — the mistyped-entry case', async () => {
    const { component, state } = setup();
    const typo = await component.create('ROLE', 'Enginer');

    const result = await component.remove(typo.id);
    expect(result.removed).toBe(true);
    expect(result.blockedBy).toBeNull();
    expect(state.deleted).toContain(typo.id);
  });

  it('throws NotFoundError for an absent entry', async () => {
    const { component } = setup();
    await expect(component.remove('ref-nope')).rejects.toThrow(NotFoundError);
  });
});

/**
 * The contract Unit 2's import depends on. Conflating these buckets would leave an admin
 * unable to tell a typo from a retired entry.
 */
describe('validateIds classification is total and three-way', () => {
  it('splits valid, unknown and inactive', async () => {
    const { component } = setup();
    const result = await component.validateIds('ROLE', [
      ACTIVE_ROLE.id,
      INACTIVE_ROLE.id,
      'ref-does-not-exist',
    ]);

    expect(result.valid).toEqual([ACTIVE_ROLE.id]);
    expect(result.inactive).toEqual([INACTIVE_ROLE.id]);
    expect(result.unknown).toEqual(['ref-does-not-exist']);
  });

  it('classifies a WRONG-TYPE id as unknown, not inactive', async () => {
    // A SKILL id submitted where a ROLE was expected identifies no valid role. Calling
    // it "inactive" would send the admin looking for something to reactivate.
    const { component } = setup();
    const result = await component.validateIds('ROLE', [ACTIVE_SKILL.id]);

    expect(result.unknown).toEqual([ACTIVE_SKILL.id]);
    expect(result.inactive).toEqual([]);
    expect(result.valid).toEqual([]);
  });

  it('every input id lands in exactly one bucket', async () => {
    const { component } = setup();
    const input = [ACTIVE_ROLE.id, INACTIVE_ROLE.id, ACTIVE_SKILL.id, 'nope'];
    const result = await component.validateIds('ROLE', input);

    const total = [...result.valid, ...result.unknown, ...result.inactive];
    expect(total).toHaveLength(input.length);
    expect(new Set(total)).toEqual(new Set(input));
  });

  it('collapses duplicate input ids', async () => {
    const { component } = setup();
    const result = await component.validateIds('ROLE', [
      ACTIVE_ROLE.id,
      ACTIVE_ROLE.id,
      ACTIVE_ROLE.id,
    ]);
    expect(result.valid).toEqual([ACTIVE_ROLE.id]);
  });

  it('handles an empty input without querying', async () => {
    const { component } = setup();
    expect(await component.validateIds('ROLE', [])).toEqual({
      valid: [],
      unknown: [],
      inactive: [],
    });
  });

  it('reports a malformed id as unknown rather than raising', async () => {
    // Bad data in an imported file is something to report, not a server error.
    const { component } = setup();
    const result = await component.validateIds('ROLE', ['not-a-uuid']);
    expect(result.unknown).toEqual(['not-a-uuid']);
  });
});

describe('renaming propagates by identifier (BR-C-04)', () => {
  it('changes the name in place with no cascade', async () => {
    const { component, state } = setup();
    state.counts[ACTIVE_ROLE.id] = {
      membersByRole: 4,
      membersBySkill: 0,
      projectsByType: 0,
      assignmentsByProjectRole: 0,
    };

    const renamed = await component.rename(ACTIVE_ROLE.id, 'Software Engineer');

    expect(renamed.name).toBe('Software Engineer');
    expect(renamed.id).toBe(ACTIVE_ROLE.id); // the id never changes, so references hold
    // Nothing was deleted or recreated; the four members follow automatically.
    expect(state.deleted).toEqual([]);
    expect(await component.countReferences(ACTIVE_ROLE.id)).toBe(4);
  });
});
