/**
 * C-04 AllocationComponent tests — the segmentation algorithm.
 *
 * This is the highest-risk logic in the unit, and it is pure, so it deserves the most
 * thorough test in the codebase. The cases below are chosen for where a subtle error would
 * be least visible: the inclusive end boundary, adjacent vs overlapping periods, the
 * exact 100.0% threshold, and identifying WHICH sub-period offends rather than merely
 * that one does.
 */

import { AllocationComponent, type AllocatableAssignment } from '../../src/core-domain/allocation/allocation-component';

const component = new AllocationComponent();

let counter = 0;
function assignment(
  startDate: string,
  endDate: string,
  tenths: number,
  options: { savedAsOverride?: boolean; id?: string; projectId?: string } = {},
): AllocatableAssignment {
  counter += 1;
  return {
    id: options.id ?? `a-${counter}`,
    memberId: 'm-1',
    projectId: options.projectId ?? `p-${counter}`,
    allocationTenths: tenths,
    startDate,
    endDate,
    savedAsOverride: options.savedAsOverride ?? false,
  };
}

const Q1 = { start: '2026-01-01', end: '2026-03-31' };

describe('segmentAllocation — coverage and contiguity', () => {
  it('returns one zero segment covering the window when there are no assignments', () => {
    const segments = component.segmentAllocation([], Q1);

    // A gap would be indistinguishable from a period the caller forgot to handle, so an
    // empty stretch is stated explicitly as 0%.
    expect(segments).toHaveLength(1);
    expect(segments[0]?.period).toEqual(Q1);
    expect(segments[0]?.totalTenths).toBe(0);
    expect(segments[0]?.availableTenths).toBe(1000);
    expect(segments[0]?.isOverAllocated).toBe(false);
  });

  it('covers the window contiguously with no overlaps and no gaps', () => {
    const segments = component.segmentAllocation(
      [assignment('2026-01-15', '2026-02-14', 500), assignment('2026-02-01', '2026-03-15', 300)],
      Q1,
    );

    expect(segments[0]?.period.start).toBe(Q1.start);
    expect(segments[segments.length - 1]?.period.end).toBe(Q1.end);

    for (let i = 0; i < segments.length - 1; i += 1) {
      const end = segments[i]?.period.end as string;
      const nextStart = segments[i + 1]?.period.start as string;
      // Next segment starts the day after the previous ends: contiguous, not overlapping.
      const dayAfter = new Date(`${end}T00:00:00.000Z`);
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
      expect(nextStart).toBe(dayAfter.toISOString().slice(0, 10));
    }
  });

  it('clips assignments extending beyond the window', () => {
    const segments = component.segmentAllocation(
      [assignment('2025-06-01', '2027-06-01', 400)],
      Q1,
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]?.period).toEqual(Q1);
    expect(segments[0]?.totalTenths).toBe(400);
  });

  it('ignores assignments entirely outside the window', () => {
    const segments = component.segmentAllocation(
      [assignment('2025-01-01', '2025-12-31', 900)],
      Q1,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]?.totalTenths).toBe(0);
  });

  it('returns nothing for an invalid window rather than guessing', () => {
    expect(component.segmentAllocation([], { start: '2026-03-31', end: '2026-01-01' })).toEqual([]);
  });
});

/**
 * The inclusive end boundary. Getting this wrong under-counts by exactly one day, which is
 * almost impossible to notice in a UI but wrong in every total.
 */
describe('segmentAllocation — the inclusive end boundary (AS-03)', () => {
  it('counts the assignment ON its end date', () => {
    const segments = component.segmentAllocation(
      [assignment('2026-01-01', '2026-01-31', 500)],
      { start: '2026-01-01', end: '2026-02-28' },
    );

    const january = segments.find((s) => s.period.start === '2026-01-01');
    expect(january?.period.end).toBe('2026-01-31'); // includes the 31st
    expect(january?.totalTenths).toBe(500);

    const february = segments.find((s) => s.period.start === '2026-02-01');
    expect(february?.totalTenths).toBe(0);
  });

  it('treats ADJACENT assignments as never overlapping', () => {
    // 500 in January, 500 in February. Neither period reaches 1000.
    const segments = component.segmentAllocation(
      [assignment('2026-01-01', '2026-01-31', 500), assignment('2026-02-01', '2026-02-28', 500)],
      { start: '2026-01-01', end: '2026-02-28' },
    );

    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.totalTenths === 500)).toBe(true);
    expect(segments.some((s) => s.isOverAllocated)).toBe(false);
  });

  it('sums assignments sharing EXACTLY ONE day on that day only', () => {
    // 600 to 31 Jan, 600 from 31 Jan. They collide on the 31st: 1200 for one day.
    const segments = component.segmentAllocation(
      [assignment('2026-01-01', '2026-01-31', 600), assignment('2026-01-31', '2026-02-28', 600)],
      { start: '2026-01-01', end: '2026-02-28' },
    );

    const collision = segments.find((s) => s.totalTenths === 1200);
    expect(collision).toBeDefined();
    expect(collision?.period).toEqual({ start: '2026-01-31', end: '2026-01-31' });
    expect(collision?.isOverAllocated).toBe(true);

    // And the surrounding periods are NOT over-allocated.
    expect(segments.filter((s) => s.isOverAllocated)).toHaveLength(1);
  });

  it('handles a single-day assignment', () => {
    const segments = component.segmentAllocation(
      [assignment('2026-02-15', '2026-02-15', 1000)],
      { start: '2026-02-01', end: '2026-02-28' },
    );

    const day = segments.find((s) => s.totalTenths === 1000);
    expect(day?.period).toEqual({ start: '2026-02-15', end: '2026-02-15' });
  });
});

describe('segmentAllocation — exact integer summation (BR-A-03, BR-A-07)', () => {
  it('sums three one-decimal allocations to exactly capacity', () => {
    const segments = component.segmentAllocation(
      [
        assignment(Q1.start, Q1.end, 333),
        assignment(Q1.start, Q1.end, 333),
        assignment(Q1.start, Q1.end, 334),
      ],
      Q1,
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]?.totalTenths).toBe(1000);
    expect(segments[0]?.availableTenths).toBe(0);
    // Exactly 100.0% is NOT over-allocated (BR-A-08).
    expect(segments[0]?.isOverAllocated).toBe(false);
  });

  it('is order-independent', () => {
    const parts = [
      assignment(Q1.start, Q1.end, 334, { id: 'x' }),
      assignment(Q1.start, Q1.end, 333, { id: 'y' }),
      assignment(Q1.start, Q1.end, 333, { id: 'z' }),
    ];
    const forward = component.segmentAllocation(parts, Q1);
    const reversed = component.segmentAllocation([...parts].reverse(), Q1);

    expect(forward[0]?.totalTenths).toBe(reversed[0]?.totalTenths);
    expect(forward[0]?.totalTenths).toBe(1000);
  });

  it('flags 100.1% as over-allocated — the boundary is strict', () => {
    const segments = component.segmentAllocation(
      [assignment(Q1.start, Q1.end, 1000), assignment(Q1.start, Q1.end, 1)],
      Q1,
    );
    expect(segments[0]?.totalTenths).toBe(1001);
    expect(segments[0]?.isOverAllocated).toBe(true);
    expect(segments[0]?.availableTenths).toBe(-1); // negative, not clamped (BR-V-03)
  });

  it('sums MULTIPLE concurrent assignments to the SAME project (BR-A-06, Q4:B)', () => {
    const segments = component.segmentAllocation(
      [
        assignment(Q1.start, Q1.end, 300, { projectId: 'p-same' }),
        assignment(Q1.start, Q1.end, 400, { projectId: 'p-same' }),
      ],
      Q1,
    );
    expect(segments[0]?.totalTenths).toBe(700);
    expect(segments[0]?.contributions).toHaveLength(2);
  });
});

describe('segmentAllocation — merging', () => {
  it('merges adjacent segments with the same total and contributions', () => {
    // One assignment spanning the window produces one boundary pair, hence one segment.
    const segments = component.segmentAllocation([assignment(Q1.start, Q1.end, 500)], Q1);
    expect(segments).toHaveLength(1);
  });

  it('does NOT merge equal totals produced by DIFFERENT assignments', () => {
    // 500 in January and 500 in February total the same, but they are different
    // assignments — merging them would report one continuous booking that does not exist,
    // and the contributions list would be wrong.
    const segments = component.segmentAllocation(
      [assignment('2026-01-01', '2026-01-31', 500), assignment('2026-02-01', '2026-02-28', 500)],
      { start: '2026-01-01', end: '2026-02-28' },
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]?.contributions[0]?.assignmentId).not.toBe(
      segments[1]?.contributions[0]?.assignmentId,
    );
  });

  it('produces the minimal description for two assignments with the same start', () => {
    const segments = component.segmentAllocation(
      [assignment(Q1.start, Q1.end, 200), assignment(Q1.start, Q1.end, 300)],
      Q1,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]?.totalTenths).toBe(500);
  });
});

describe('segmentAllocation — contributions', () => {
  it('names the contributing assignments and carries project identity', () => {
    const withProject: AllocatableAssignment = {
      ...assignment(Q1.start, Q1.end, 600, { id: 'a-named' }),
      projectName: 'Platform',
      projectCode: 'PRJ-1',
    };

    const segments = component.segmentAllocation([withProject], Q1);
    const contribution = segments[0]?.contributions[0];

    expect(contribution?.assignmentId).toBe('a-named');
    expect(contribution?.projectName).toBe('Platform');
    expect(contribution?.projectCode).toBe('PRJ-1');
    expect(contribution?.allocationTenths).toBe(600);
  });

  it('lists a contribution in every segment the assignment covers', () => {
    const segments = component.segmentAllocation(
      [assignment('2026-01-01', '2026-03-31', 500), assignment('2026-02-01', '2026-02-28', 300)],
      Q1,
    );

    // The long assignment contributes to all three segments; the short one to only the middle.
    expect(segments).toHaveLength(3);
    expect(segments.every((s) => s.contributions.some((c) => c.allocationTenths === 500))).toBe(true);
    expect(segments.filter((s) => s.contributions.some((c) => c.allocationTenths === 300))).toHaveLength(1);
  });
});

/**
 * BR-A-08's core requirement: identify WHICH sub-period offends. "Over-allocated in Q1" is
 * unactionable; "120% from 15 to 28 February" can be fixed.
 */
describe('detectOverAllocation (BR-A-08)', () => {
  it('returns nothing when within capacity', () => {
    expect(
      component.detectOverAllocation('m-1', [assignment(Q1.start, Q1.end, 1000)], Q1),
    ).toEqual([]);
  });

  it('identifies the SPECIFIC offending sub-period, not the whole window', () => {
    const findings = component.detectOverAllocation(
      'm-1',
      [assignment('2026-01-01', '2026-03-31', 800), assignment('2026-02-15', '2026-02-28', 400)],
      Q1,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.period).toEqual({ start: '2026-02-15', end: '2026-02-28' });
    expect(findings[0]?.totalTenths).toBe(1200);
    expect(findings[0]?.memberId).toBe('m-1');
    // Both contributing assignments are named, so the user can see what to change.
    expect(findings[0]?.contributions).toHaveLength(2);
  });

  it('returns EACH offending sub-period when there are several', () => {
    const findings = component.detectOverAllocation(
      'm-1',
      [
        assignment('2026-01-01', '2026-03-31', 700),
        assignment('2026-01-05', '2026-01-10', 500), // spike 1
        assignment('2026-03-01', '2026-03-05', 600), // spike 2
      ],
      Q1,
    );

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.period.start)).toEqual(['2026-01-05', '2026-03-01']);
    expect(findings[0]?.totalTenths).toBe(1200);
    expect(findings[1]?.totalTenths).toBe(1300);
  });

  it('does not flag exactly 100.0%', () => {
    const findings = component.detectOverAllocation(
      'm-1',
      [assignment(Q1.start, Q1.end, 500), assignment(Q1.start, Q1.end, 500)],
      Q1,
    );
    expect(findings).toEqual([]);
  });

  it('marks a finding as pre-existing when EVERY contribution is already an override', () => {
    // BR-A-12: an accepted override stays visibly flagged, but it is not a NEW problem.
    const findings = component.detectOverAllocation(
      'm-1',
      [
        assignment(Q1.start, Q1.end, 700, { savedAsOverride: true }),
        assignment(Q1.start, Q1.end, 600, { savedAsOverride: true }),
      ],
      Q1,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.arisesFromOverride).toBe(true);
  });

  it('marks a finding as NEW when any contribution is not an override', () => {
    const findings = component.detectOverAllocation(
      'm-1',
      [
        assignment(Q1.start, Q1.end, 700, { savedAsOverride: true }),
        assignment(Q1.start, Q1.end, 600, { savedAsOverride: false }),
      ],
      Q1,
    );
    expect(findings[0]?.arisesFromOverride).toBe(false);
  });
});

describe('minimumAvailableTenths', () => {
  it('reports the LOWEST availability, not an average', () => {
    // Free in January, fully booked in February. There is no spare February capacity, and
    // an average would wrongly suggest ~50% is available.
    const available = component.minimumAvailableTenths(
      [assignment('2026-02-01', '2026-02-28', 1000)],
      { start: '2026-01-01', end: '2026-02-28' },
    );
    expect(available).toBe(0);
  });

  it('is negative when over-allocated somewhere in the window', () => {
    const available = component.minimumAvailableTenths(
      [assignment('2026-02-01', '2026-02-28', 1200)],
      { start: '2026-01-01', end: '2026-02-28' },
    );
    expect(available).toBe(-200);
  });

  it('is full capacity with no assignments', () => {
    expect(component.minimumAvailableTenths([], Q1)).toBe(1000);
  });
});

describe('purity (U1-NFR-M-03)', () => {
  it('does not mutate its input', () => {
    const input = [assignment(Q1.start, Q1.end, 500)];
    const snapshot = JSON.stringify(input);

    component.segmentAllocation(input, Q1);
    component.detectOverAllocation('m-1', input, Q1);

    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('is deterministic across repeated calls', () => {
    const input = [
      assignment('2026-01-01', '2026-02-15', 600),
      assignment('2026-02-01', '2026-03-31', 500),
    ];
    const first = component.segmentAllocation(input, Q1);
    const second = component.segmentAllocation(input, Q1);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

// --- Step 10 view functions -------------------------------------------------

import type { MemberSummary } from '../../src/shared/types/domain';

function member(id: string, fullName: string): MemberSummary {
  return {
    id,
    fullName,
    email: `${id}@example.com`,
    orgUnitId: 'ou-1',
    employmentType: 'ON_ROLL',
    roleId: 'ref-role',
    status: 'ACTIVE',
  };
}

function forMember(
  memberId: string,
  startDate: string,
  endDate: string,
  tenths: number,
  options: { savedAsOverride?: boolean } = {},
): AllocatableAssignment {
  return { ...assignment(startDate, endDate, tenths, options), memberId };
}

describe('totalOnDate', () => {
  it('sums the assignments covering that single day', () => {
    const result = component.totalOnDate(
      'm-1',
      '2026-02-15',
      [assignment('2026-01-01', '2026-03-31', 400), assignment('2026-02-01', '2026-02-28', 300)],
    );

    expect(result.totalTenths).toBe(700);
    expect(result.availableTenths).toBe(300);
    expect(result.contributions).toHaveLength(2);
    expect(result.onDate).toBe('2026-02-15');
  });

  it('reports full availability on a day with nothing booked', () => {
    const result = component.totalOnDate('m-1', '2026-05-01', [
      assignment('2026-01-01', '2026-03-31', 900),
    ]);
    expect(result.totalTenths).toBe(0);
    expect(result.availableTenths).toBe(1000);
  });

  it('agrees with segmentAllocation for the same day (no duplicate arithmetic)', () => {
    const rows = [assignment('2026-01-01', '2026-02-15', 600), assignment('2026-02-01', '2026-03-31', 500)];
    const day = '2026-02-10';

    const viaDate = component.totalOnDate('m-1', day, rows);
    const viaRange = component.segmentAllocation(rows, Q1).find(
      (s) => s.period.start <= day && s.period.end >= day,
    );

    expect(viaDate.totalTenths).toBe(viaRange?.totalTenths);
  });

  it('counts an assignment ON its end date', () => {
    const result = component.totalOnDate('m-1', '2026-01-31', [
      assignment('2026-01-01', '2026-01-31', 500),
    ]);
    expect(result.totalTenths).toBe(500);
  });
});

describe('currentAllocationView (US-VIS-01)', () => {
  const members = [member('m-1', 'Ada'), member('m-2', 'Grace'), member('m-3', 'Idle Person')];

  it('returns one row per member, including members with NO assignments', () => {
    // Omitting idle members would turn the allocation view into a list of only busy
    // people — hiding exactly who a manager is looking for.
    const rows = component.currentAllocationView('2026-02-15', members, [
      forMember('m-1', '2026-01-01', '2026-03-31', 800),
      forMember('m-2', '2026-01-01', '2026-03-31', 1200),
    ]);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.member.id)).toEqual(['m-1', 'm-2', 'm-3']);

    const idle = rows.find((r) => r.member.id === 'm-3');
    expect(idle?.totalTenths).toBe(0);
    expect(idle?.availableTenths).toBe(1000);
    expect(idle?.isOverAllocated).toBe(false);
  });

  it('flags the over-allocated member and reports negative availability', () => {
    const rows = component.currentAllocationView('2026-02-15', members, [
      forMember('m-2', '2026-01-01', '2026-03-31', 1200),
    ]);

    const over = rows.find((r) => r.member.id === 'm-2');
    expect(over?.isOverAllocated).toBe(true);
    expect(over?.availableTenths).toBe(-200);
  });

  it('does not attribute one member assignments to another', () => {
    const rows = component.currentAllocationView('2026-02-15', members, [
      forMember('m-1', '2026-01-01', '2026-03-31', 500),
    ]);

    expect(rows.find((r) => r.member.id === 'm-1')?.totalTenths).toBe(500);
    expect(rows.find((r) => r.member.id === 'm-2')?.totalTenths).toBe(0);
  });

  it('reflects the asOf date, not the whole range', () => {
    const rows = component.currentAllocationView('2026-03-15', members, [
      forMember('m-1', '2026-01-01', '2026-01-31', 900),
    ]);
    // The January booking does not touch 15 March.
    expect(rows.find((r) => r.member.id === 'm-1')?.totalTenths).toBe(0);
  });
});

describe('unallocatedMembers (US-VIS-06)', () => {
  const members = [member('m-free', 'Free'), member('m-partial', 'Partial'), member('m-busy', 'Busy')];

  it('returns only members with NO allocation anywhere in the range', () => {
    // m-partial is booked for February only. They are NOT on the bench for Q1 — sending a
    // manager to them would waste the manager's time.
    const unallocated = component.unallocatedMembers(Q1, members, [
      forMember('m-partial', '2026-02-01', '2026-02-28', 500),
      forMember('m-busy', '2026-01-01', '2026-03-31', 1000),
    ]);

    expect(unallocated.map((m) => m.id)).toEqual(['m-free']);
  });

  it('returns everyone when there are no assignments at all', () => {
    expect(component.unallocatedMembers(Q1, members, []).map((m) => m.id)).toEqual([
      'm-free',
      'm-partial',
      'm-busy',
    ]);
  });

  it('ignores assignments outside the range', () => {
    const unallocated = component.unallocatedMembers(Q1, [member('m-1', 'Ada')], [
      forMember('m-1', '2025-01-01', '2025-12-31', 1000),
    ]);
    expect(unallocated.map((m) => m.id)).toEqual(['m-1']);
  });

  it('excludes a member booked for even a single day', () => {
    const unallocated = component.unallocatedMembers(Q1, [member('m-1', 'Ada')], [
      forMember('m-1', '2026-02-15', '2026-02-15', 1),
    ]);
    expect(unallocated).toEqual([]);
  });
});

describe('overAllocatedMembers (US-VIS-03)', () => {
  it('returns one finding per offending sub-period per member, not one per member', () => {
    // Two separate spikes are two distinct problems; collapsing them would hide one.
    const findings = component.overAllocatedMembers(Q1, [
      forMember('m-1', '2026-01-01', '2026-03-31', 700),
      forMember('m-1', '2026-01-05', '2026-01-10', 500),
      forMember('m-1', '2026-03-01', '2026-03-05', 600),
      forMember('m-2', '2026-02-01', '2026-02-28', 1500),
    ]);

    const forM1 = findings.filter((f) => f.memberId === 'm-1');
    expect(forM1).toHaveLength(2);
    expect(forM1.map((f) => f.period.start)).toEqual(['2026-01-05', '2026-03-01']);

    const forM2 = findings.filter((f) => f.memberId === 'm-2');
    expect(forM2).toHaveLength(1);
    expect(forM2[0]?.totalTenths).toBe(1500);
  });

  it('returns nothing when everyone is within capacity', () => {
    expect(
      component.overAllocatedMembers(Q1, [
        forMember('m-1', '2026-01-01', '2026-03-31', 1000),
        forMember('m-2', '2026-01-01', '2026-03-31', 500),
      ]),
    ).toEqual([]);
  });

  it('produces a stable member order', () => {
    const input = [
      forMember('m-z', '2026-01-01', '2026-03-31', 1200),
      forMember('m-a', '2026-01-01', '2026-03-31', 1200),
    ];
    const first = component.overAllocatedMembers(Q1, input);
    const second = component.overAllocatedMembers(Q1, [...input].reverse());

    expect(first.map((f) => f.memberId)).toEqual(['m-a', 'm-z']);
    expect(second.map((f) => f.memberId)).toEqual(['m-a', 'm-z']);
  });
});

describe('availabilityFor (US-VIS-02, US-VIS-03)', () => {
  it('reports min AND max, which answer different questions', () => {
    // Free in January, fully booked in February. Minimum says "cannot take a full-range
    // assignment"; maximum says "there is a January window worth negotiating".
    const [result] = component.availabilityFor(
      [member('m-1', 'Ada')],
      { start: '2026-01-01', end: '2026-02-28' },
      [forMember('m-1', '2026-02-01', '2026-02-28', 1000)],
    );

    expect(result?.minAvailableTenths).toBe(0);
    expect(result?.maxAvailableTenths).toBe(1000);
    expect(result?.isFullyAllocated).toBe(false); // there IS spare capacity somewhere
    expect(result?.isOverAllocated).toBe(false);
  });

  it('marks a member fully allocated only when there is no spare capacity anywhere', () => {
    const [result] = component.availabilityFor([member('m-1', 'Ada')], Q1, [
      forMember('m-1', '2026-01-01', '2026-03-31', 1000),
    ]);

    expect(result?.isFullyAllocated).toBe(true);
    expect(result?.maxAvailableTenths).toBe(0);
  });

  it('flags over-allocation anywhere in the range', () => {
    const [result] = component.availabilityFor([member('m-1', 'Ada')], Q1, [
      forMember('m-1', '2026-02-01', '2026-02-05', 1300),
    ]);

    expect(result?.isOverAllocated).toBe(true);
    expect(result?.minAvailableTenths).toBe(-300);
  });

  it('gives a member with no assignments full availability', () => {
    const [result] = component.availabilityFor([member('m-1', 'Ada')], Q1, []);
    expect(result?.minAvailableTenths).toBe(1000);
    expect(result?.maxAvailableTenths).toBe(1000);
    expect(result?.isFullyAllocated).toBe(false);
  });

  it('carries the segments so a caller can show WHEN capacity exists', () => {
    const [result] = component.availabilityFor([member('m-1', 'Ada')], Q1, [
      forMember('m-1', '2026-02-01', '2026-02-28', 600),
    ]);
    expect((result?.segments.length ?? 0)).toBeGreaterThan(1);
  });
});

describe('memberTimeline', () => {
  it('marks stretches with nothing booked as gaps', () => {
    // A gap and a partially-booked stretch are different facts; a UI rendering them the
    // same way would make an idle month look busy.
    const timeline = component.memberTimeline('m-1', Q1, [
      forMember('m-1', '2026-02-01', '2026-02-28', 400),
    ]);

    const gaps = timeline.filter((s) => s.isGap);
    const booked = timeline.filter((s) => !s.isGap);

    expect(gaps.length).toBe(2); // January and March
    expect(gaps.every((s) => s.totalTenths === 0)).toBe(true);
    expect(booked).toHaveLength(1);
    expect(booked[0]?.period).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(booked[0]?.totalTenths).toBe(400);
  });

  it('does NOT mark a partially-allocated stretch as a gap', () => {
    const timeline = component.memberTimeline('m-1', Q1, [
      forMember('m-1', '2026-01-01', '2026-03-31', 100),
    ]);
    expect(timeline.every((s) => s.isGap === false)).toBe(true);
  });

  it('includes only the requested member assignments', () => {
    const timeline = component.memberTimeline('m-1', Q1, [
      forMember('m-1', '2026-01-01', '2026-03-31', 300),
      forMember('m-2', '2026-01-01', '2026-03-31', 900),
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.totalTenths).toBe(300);
  });

  it('is one whole gap for a member with no assignments', () => {
    const timeline = component.memberTimeline('m-1', Q1, []);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.isGap).toBe(true);
    expect(timeline[0]?.period).toEqual(Q1);
  });

  it('carries the contributing assignments for each segment', () => {
    const timeline = component.memberTimeline('m-1', Q1, [
      forMember('m-1', '2026-01-01', '2026-03-31', 300),
      forMember('m-1', '2026-02-01', '2026-02-28', 200),
    ]);

    const overlap = timeline.find((s) => s.totalTenths === 500);
    expect(overlap?.assignments).toHaveLength(2);
  });
});
