/**
 * C-01 MemberComponent tests.
 *
 * Fakes, because the rules here are decisions this component makes. The two most
 * consequential:
 *
 *   BR-M-10 — converting OFF_ROLL -> ON_ROLL RETAINS the contract. Clearing it would
 *   destroy the record of who the person was engaged through, which the contract-window
 *   warnings (BR-A-13) depend on.
 *
 *   BR-M-13/BR-M-15 — deactivation auto-ends assignments and REPORTS the count;
 *   reactivation does NOT restore them.
 */

import { MemberComponent, type MemberInput } from '../../src/core-domain/member/member-component';
import { ReferenceDataComponent } from '../../src/core-domain/reference-data/reference-data-component';
import { NotFoundError, ValidationError } from '../../src/shared/errors';
import type { MemberRepository, OrgUnitRepository } from '../../src/shared/repository';
import type { ScopeFilter } from '../../src/shared/types/authorization';
import type { Member, OrgUnit, ReferenceDataEntry } from '../../src/shared/types/domain';

const ALL: ScopeFilter = { orgUnitIds: 'ALL', restrictToMemberId: null };

const DEPT: OrgUnit = { id: 'ou-1', name: 'Engineering', parentOrgUnitId: null, isActive: true };
const INACTIVE_DEPT: OrgUnit = { id: 'ou-2', name: 'Closed Unit', parentOrgUnitId: null, isActive: false };

const ROLE: ReferenceDataEntry = { id: 'ref-role', referenceType: 'ROLE', name: 'Engineer', isActive: true };
const SKILL: ReferenceDataEntry = { id: 'ref-skill', referenceType: 'SKILL', name: 'TypeScript', isActive: true };
const RETIRED_SKILL: ReferenceDataEntry = {
  id: 'ref-skill-old',
  referenceType: 'SKILL',
  name: 'Flash',
  isActive: false,
};

interface Harness {
  component: MemberComponent;
  members: Member[];
  autoEnded: { memberId: string; date: string }[];
  autoEndCount: number;
  skillWrites: { id: string; skillIds: string[] }[];
}

function setup(seed: Member[] = [], autoEndCount = 0): Harness {
  const members: Member[] = seed.map((m) => ({ ...m }));
  const autoEnded: { memberId: string; date: string }[] = [];
  const skillWrites: { id: string; skillIds: string[] }[] = [];
  const harness = { autoEndCount };

  const memberRepo = {
    findById: async (id: string) => members.find((m) => m.id === id) ?? null,
    findLocation: async (id: string) => {
      const member = members.find((m) => m.id === id);
      return member ? { id, orgUnitId: member.orgUnitId, status: member.status } : null;
    },
    search: async (criteria: { status: string | null; employmentType: string | null }) => {
      const items = members.filter(
        (m) =>
          (criteria.status === null || m.status === criteria.status) &&
          (criteria.employmentType === null || m.employmentType === criteria.employmentType),
      );
      return { items, total: items.length, offset: 0, limit: 50 };
    },
    create: async (input: Record<string, unknown>) => {
      const created: Member = {
        id: `m-${members.length + 1}`,
        externalRef: (input.externalRef as string | null) ?? null,
        fullName: input.fullName as string,
        email: input.email as string,
        orgUnitId: input.orgUnitId as string,
        employmentType: input.employmentType as Member['employmentType'],
        roleId: input.roleId as string,
        status: 'ACTIVE',
        deactivatedOn: null,
        contract:
          input.vendorName && input.contractStartDate && input.contractEndDate
            ? {
                vendorName: input.vendorName as string,
                startDate: input.contractStartDate as string,
                endDate: input.contractEndDate as string,
                status: (input.contractStatus as string) ?? 'UNKNOWN',
              }
            : null,
        skillIds: [],
      };
      members.push(created);
      return created;
    },
    update: async (id: string, input: Record<string, unknown>) => {
      const member = members.find((m) => m.id === id);
      if (!member) return null;
      member.fullName = input.fullName as string;
      member.email = input.email as string;
      member.orgUnitId = input.orgUnitId as string;
      member.employmentType = input.employmentType as Member['employmentType'];
      member.roleId = input.roleId as string;
      member.contract =
        input.vendorName && input.contractStartDate && input.contractEndDate
          ? {
              vendorName: input.vendorName as string,
              startDate: input.contractStartDate as string,
              endDate: input.contractEndDate as string,
              status: (input.contractStatus as string) ?? 'UNKNOWN',
            }
          : null;
      return member;
    },
    replaceSkills: async (id: string, skillIds: readonly string[]) => {
      const member = members.find((m) => m.id === id);
      if (member) member.skillIds = [...skillIds];
      skillWrites.push({ id, skillIds: [...skillIds] });
    },
    deactivate: async (id: string, deactivatedOn: string) => {
      const member = members.find((m) => m.id === id);
      if (!member) return null;
      member.status = 'INACTIVE';
      member.deactivatedOn = deactivatedOn;
      return member;
    },
    reactivate: async (id: string) => {
      const member = members.find((m) => m.id === id);
      if (!member) return null;
      member.status = 'ACTIVE';
      member.deactivatedOn = null;
      return member;
    },
    findContractWindows: async (ids: readonly string[]) => {
      const map = new Map<string, { startDate: string; endDate: string } | null>();
      for (const id of ids) {
        const member = members.find((m) => m.id === id);
        map.set(
          id,
          member?.contract
            ? { startDate: member.contract.startDate, endDate: member.contract.endDate }
            : null,
        );
      }
      return map;
    },
  } as unknown as MemberRepository;

  const orgUnitRepo = {
    findById: async (id: string) => [DEPT, INACTIVE_DEPT].find((u) => u.id === id) ?? null,
  } as unknown as OrgUnitRepository;

  const referenceRepo = {
    findByIds: async (ids: readonly string[]) =>
      [ROLE, SKILL, RETIRED_SKILL].filter((e) => ids.includes(e.id)),
  } as unknown as never;

  const autoEnder = {
    autoEndForMember: async (memberId: string, date: string) => {
      autoEnded.push({ memberId, date });
      return harness.autoEndCount;
    },
  };

  const component = new MemberComponent(
    memberRepo,
    orgUnitRepo,
    new ReferenceDataComponent(referenceRepo),
    autoEnder,
  );

  return { component, members, autoEnded, autoEndCount, skillWrites };
}

const VALID_ON_ROLL: MemberInput = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  orgUnitId: DEPT.id,
  employmentType: 'ON_ROLL',
  roleId: ROLE.id,
  externalRef: 'E-1',
  skillIds: [],
  contract: null,
};

const OFF_ROLL_MEMBER: Member = {
  id: 'm-off',
  externalRef: 'E-9',
  fullName: 'Contractor Person',
  email: 'contractor@example.com',
  orgUnitId: DEPT.id,
  employmentType: 'OFF_ROLL',
  roleId: ROLE.id,
  status: 'ACTIVE',
  deactivatedOn: null,
  contract: {
    vendorName: 'Vendor Ltd',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    status: 'ACTIVE',
  },
  skillIds: [],
};

describe('required fields (BR-M-01), all reported together', () => {
  it('reports every missing field at once', async () => {
    const { component } = setup();
    const attempt = component.create(
      { ...VALID_ON_ROLL, fullName: '  ', email: '', roleId: '' },
      ALL,
    );

    await expect(attempt).rejects.toThrow(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.objectContaining({ field: 'fullName', rule: 'REQUIRED' }),
        expect.objectContaining({ field: 'email', rule: 'REQUIRED' }),
        expect.objectContaining({ field: 'roleId', rule: 'REQUIRED' }),
      ]),
    });
  });

  it('rejects an obviously malformed email', async () => {
    const { component } = setup();
    await expect(
      component.create({ ...VALID_ON_ROLL, email: 'not-an-email' }, ALL),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'email', rule: 'INVALID_FORMAT' })],
    });
  });

  it('creates a valid on-roll member with no contract (BR-M-07)', async () => {
    const { component } = setup();
    const created = await component.create(VALID_ON_ROLL, ALL);
    expect(created.employmentType).toBe('ON_ROLL');
    expect(created.contract).toBeNull();
  });
});

describe('off-roll contract fields (BR-M-06, BR-M-08)', () => {
  it('requires all four contract fields for OFF_ROLL', async () => {
    const { component } = setup();
    await expect(
      component.create({ ...VALID_ON_ROLL, employmentType: 'OFF_ROLL', contract: null }, ALL),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'contract', rule: 'REQUIRED' })],
    });
  });

  it('reports each missing contract field individually', async () => {
    const { component } = setup();
    const attempt = component.create(
      {
        ...VALID_ON_ROLL,
        employmentType: 'OFF_ROLL',
        contract: { vendorName: '', startDate: 'nope', endDate: '2026-06-30', status: '' },
      },
      ALL,
    );

    await expect(attempt).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.objectContaining({ field: 'contract.vendorName', rule: 'REQUIRED' }),
        expect.objectContaining({ field: 'contract.status', rule: 'REQUIRED' }),
        expect.objectContaining({ field: 'contract.startDate', rule: 'INVALID_DATE' }),
      ]),
    });
  });

  it('rejects a contract ending before it starts (BR-M-08)', async () => {
    const { component } = setup();
    await expect(
      component.create(
        {
          ...VALID_ON_ROLL,
          employmentType: 'OFF_ROLL',
          contract: {
            vendorName: 'Vendor Ltd',
            startDate: '2026-06-30',
            endDate: '2026-01-01',
            status: 'ACTIVE',
          },
        },
        ALL,
      ),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'contract.endDate', rule: 'DATE_ORDER' })],
    });
  });

  it('accepts a valid off-roll member', async () => {
    const { component } = setup();
    const created = await component.create(
      {
        ...VALID_ON_ROLL,
        employmentType: 'OFF_ROLL',
        contract: {
          vendorName: 'Vendor Ltd',
          startDate: '2026-01-01',
          endDate: '2026-06-30',
          status: 'ACTIVE',
        },
      },
      ALL,
    );
    expect(created.contract?.vendorName).toBe('Vendor Ltd');
  });
});

/** BR-M-09 is enforced by ABSENCE — this test states the intent so a future addition is deliberate. */
describe('no commercial data (BR-M-09)', () => {
  it('exposes no rate, contract value, or purchase-order field', async () => {
    const { component } = setup();
    const created = await component.create(
      {
        ...VALID_ON_ROLL,
        employmentType: 'OFF_ROLL',
        contract: {
          vendorName: 'Vendor Ltd',
          startDate: '2026-01-01',
          endDate: '2026-06-30',
          status: 'ACTIVE',
        },
      },
      ALL,
    );

    const serialised = JSON.stringify(created).toLowerCase();
    for (const forbidden of ['rate', 'contractvalue', 'purchaseorder', 'ponumber', 'cost']) {
      expect(serialised).not.toContain(forbidden);
    }
    expect(Object.keys(created.contract ?? {})).toEqual([
      'vendorName',
      'startDate',
      'endDate',
      'status',
    ]);
  });
});

/**
 * The subtle one. Clearing the contract on conversion would destroy history the
 * contract-window warnings depend on.
 */
describe('OFF_ROLL -> ON_ROLL retains the contract (BR-M-10)', () => {
  it('keeps contract data after conversion', async () => {
    const { component } = setup([OFF_ROLL_MEMBER]);

    const converted = await component.update(
      OFF_ROLL_MEMBER.id,
      { employmentType: 'ON_ROLL' },
      ALL,
    );

    expect(converted.employmentType).toBe('ON_ROLL');
    expect(converted.contract).not.toBeNull();
    expect(converted.contract?.vendorName).toBe('Vendor Ltd');
    expect(converted.contract?.endDate).toBe('2026-06-30');
  });

  it('does not re-validate a retained contract on an unrelated edit', async () => {
    // An old contract with odd data must not block a name change.
    const odd: Member = {
      ...OFF_ROLL_MEMBER,
      employmentType: 'ON_ROLL',
      contract: { vendorName: '', startDate: '2026-01-01', endDate: '2026-06-30', status: '' },
    };
    const { component } = setup([odd]);

    const renamed = await component.update(odd.id, { fullName: 'New Name' }, ALL);
    expect(renamed.fullName).toBe('New Name');
  });
});

describe('skills must be managed reference data (BR-M-11, BR-M-12)', () => {
  it('rejects an unrecognised skill and directs the user to reference data', async () => {
    const { component } = setup([{ ...OFF_ROLL_MEMBER, skillIds: [] }]);
    const attempt = component.attachSkill(OFF_ROLL_MEMBER.id, 'ref-nonexistent', ALL);

    await expect(attempt).rejects.toThrow(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      violations: [
        expect.objectContaining({
          rule: 'NOT_FOUND',
          detail: expect.stringContaining('reference data'),
        }),
      ],
    });
  });

  it('rejects attaching a DEACTIVATED skill', async () => {
    const { component } = setup([{ ...OFF_ROLL_MEMBER, skillIds: [] }]);
    await expect(
      component.attachSkill(OFF_ROLL_MEMBER.id, RETIRED_SKILL.id, ALL),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ rule: 'INACTIVE' })],
    });
  });

  it('attaches a valid skill', async () => {
    const { component } = setup([{ ...OFF_ROLL_MEMBER, skillIds: [] }]);
    const updated = await component.attachSkill(OFF_ROLL_MEMBER.id, SKILL.id, ALL);
    expect(updated.skillIds).toEqual([SKILL.id]);
  });

  it('attaching an already-present skill is a no-op, not a duplicate', async () => {
    const { component } = setup([{ ...OFF_ROLL_MEMBER, skillIds: [SKILL.id] }]);
    const updated = await component.attachSkill(OFF_ROLL_MEMBER.id, SKILL.id, ALL);
    expect(updated.skillIds).toEqual([SKILL.id]);
  });

  it('detaching one skill leaves the others (BR-M-12)', async () => {
    const { component } = setup([
      { ...OFF_ROLL_MEMBER, skillIds: [SKILL.id, RETIRED_SKILL.id] },
    ]);
    const updated = await component.detachSkill(OFF_ROLL_MEMBER.id, SKILL.id, ALL);
    expect(updated.skillIds).toEqual([RETIRED_SKILL.id]);
  });

  it('permits detaching a DEACTIVATED skill', async () => {
    // A retired skill must still be removable, so no active check on detach.
    const { component } = setup([{ ...OFF_ROLL_MEMBER, skillIds: [RETIRED_SKILL.id] }]);
    const updated = await component.detachSkill(OFF_ROLL_MEMBER.id, RETIRED_SKILL.id, ALL);
    expect(updated.skillIds).toEqual([]);
  });
});

describe('reference validation (BR-M-04, BR-M-05)', () => {
  it('rejects an inactive org unit for a new member', async () => {
    const { component } = setup();
    await expect(
      component.create({ ...VALID_ON_ROLL, orgUnitId: INACTIVE_DEPT.id }, ALL),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'orgUnitId', rule: 'INACTIVE' })],
    });
  });

  it('rejects a non-existent org unit', async () => {
    const { component } = setup();
    await expect(
      component.create({ ...VALID_ON_ROLL, orgUnitId: 'ou-nope' }, ALL),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'orgUnitId', rule: 'NOT_FOUND' })],
    });
  });

  it('rejects a skill id used as a role', async () => {
    const { component } = setup();
    await expect(
      component.create({ ...VALID_ON_ROLL, roleId: SKILL.id }, ALL),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'roleId', rule: 'NOT_FOUND' })],
    });
  });
});

/**
 * BR-M-13 and BR-M-15 — the cascade, and what reactivation deliberately does not undo.
 */
describe('deactivation cascade (BR-M-13, BR-M-14, BR-M-15)', () => {
  it('auto-ends assignments and REPORTS the count', async () => {
    const harness = setup([{ ...OFF_ROLL_MEMBER }], 3);

    const result = await harness.component.deactivate(
      OFF_ROLL_MEMBER.id,
      ALL,
      null,
      '2026-02-01',
    );

    expect(result.member.status).toBe('INACTIVE');
    expect(result.member.deactivatedOn).toBe('2026-02-01');
    // The count is the difference between an informed action and a silent side effect.
    expect(result.autoEndedAssignmentCount).toBe(3);
    expect(harness.autoEnded).toEqual([{ memberId: OFF_ROLL_MEMBER.id, date: '2026-02-01' }]);
  });

  it('ends assignments BEFORE marking the member inactive', async () => {
    // Ordering matters: if the cascade fails, the member must still be ACTIVE so the
    // operation can be retried. The reverse order would leave an inactive member with
    // dangling open assignments.
    const harness = setup([{ ...OFF_ROLL_MEMBER }]);
    const member = harness.members[0] as Member;

    let statusObservedByCascade: string | null = null;
    Object.assign(harness.component, {
      autoEnder: {
        autoEndForMember: async () => {
          statusObservedByCascade = member.status;
          return 1;
        },
      },
    });

    await harness.component.deactivate(OFF_ROLL_MEMBER.id, ALL, null, '2026-02-01');

    // Asserted against an explicit null start, so a cascade that never ran fails here
    // rather than passing on a default.
    expect(statusObservedByCascade).toBe('ACTIVE');
    expect(member.status).toBe('INACTIVE');
  });

  it('leaves the member ACTIVE when the cascade fails', async () => {
    const harness = setup([{ ...OFF_ROLL_MEMBER }]);
    const member = harness.members[0] as Member;

    Object.assign(harness.component, {
      autoEnder: {
        autoEndForMember: async () => {
          throw new Error('assignment service unavailable');
        },
      },
    });

    await expect(
      harness.component.deactivate(OFF_ROLL_MEMBER.id, ALL, null, '2026-02-01'),
    ).rejects.toThrow('assignment service unavailable');

    expect(member.status).toBe('ACTIVE');
    expect(member.deactivatedOn).toBeNull();
  });

  it('is idempotent for an already-inactive member', async () => {
    const harness = setup([{ ...OFF_ROLL_MEMBER, status: 'INACTIVE' }], 5);
    const result = await harness.component.deactivate(OFF_ROLL_MEMBER.id, ALL);

    expect(result.autoEndedAssignmentCount).toBe(0);
    expect(harness.autoEnded).toEqual([]); // no cascade re-run
  });

  it('reactivation restores assignability but does NOT restore assignments (BR-M-15)', async () => {
    const harness = setup([{ ...OFF_ROLL_MEMBER, status: 'INACTIVE', deactivatedOn: '2026-02-01' }]);

    const reactivated = await harness.component.reactivate(OFF_ROLL_MEMBER.id, ALL);

    expect(reactivated.status).toBe('ACTIVE');
    expect(reactivated.deactivatedOn).toBeNull();
    // Nothing was un-ended: re-booking someone onto a moved-on plan must be deliberate.
    expect(harness.autoEnded).toEqual([]);
  });

  it('excludes deactivated members from the assignable list (BR-M-14)', async () => {
    const harness = setup([
      { ...OFF_ROLL_MEMBER, id: 'm-active', status: 'ACTIVE' },
      { ...OFF_ROLL_MEMBER, id: 'm-inactive', status: 'INACTIVE' },
    ]);

    const assignable = await harness.component.listAssignable('2026-02-01', ALL);
    expect(assignable.map((m) => m.id)).toEqual(['m-active']);
  });

  it('throws NotFoundError for a missing member', async () => {
    const { component } = setup();
    await expect(component.deactivate('m-nope', ALL)).rejects.toThrow(NotFoundError);
  });
});

describe('expiring contracts (US-MEM-06)', () => {
  it('returns off-roll members whose contract ends inside the window', async () => {
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 10);
    const soonIso = soon.toISOString().slice(0, 10);

    const far = new Date();
    far.setUTCDate(far.getUTCDate() + 200);
    const farIso = far.toISOString().slice(0, 10);

    const harness = setup([
      {
        ...OFF_ROLL_MEMBER,
        id: 'm-soon',
        contract: { vendorName: 'V', startDate: '2026-01-01', endDate: soonIso, status: 'ACTIVE' },
      },
      {
        ...OFF_ROLL_MEMBER,
        id: 'm-far',
        contract: { vendorName: 'V', startDate: '2026-01-01', endDate: farIso, status: 'ACTIVE' },
      },
    ]);

    const expiring = await harness.component.findExpiringContracts(30, ALL);
    expect(expiring.map((row) => row.member.id)).toEqual(['m-soon']);

    /**
     * Shape widened at Unit 2. This previously returned `MemberSummary[]`, which omitted the
     * contract end date — so US-MEM-06's screen ("see contracts expiring soon") had no date to
     * show and no way to compute days remaining without an N+1. The window was already being
     * fetched and then discarded.
     */
    expect(expiring[0]?.contractEndDate).toBe(soonIso);
    // Computed from the SERVER's date, so a browser behind UTC cannot render a stale count.
    expect(expiring[0]?.daysRemaining).toBeGreaterThanOrEqual(0);
    expect(expiring[0]?.daysRemaining).toBeLessThanOrEqual(30);
  });

  it('excludes members with no contract', async () => {
    const harness = setup([{ ...OFF_ROLL_MEMBER, contract: null }]);
    expect(await harness.component.findExpiringContracts(30, ALL)).toEqual([]);
  });
});
