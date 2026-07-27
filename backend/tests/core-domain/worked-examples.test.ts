/**
 * The worked examples from `business-logic-model.md`, as executable tests.
 *
 * WHY THIS FILE EXISTS SEPARATELY. The design document states two worked examples with
 * exact expected numbers, and those numbers are the specification's own account of what
 * correct behaviour looks like. Encoding them verbatim means the document and the code can
 * be checked against each other mechanically — if someone changes the algorithm, this file
 * says which document paragraph they also need to change.
 *
 * The tables below are transcribed from the document, NOT derived from the implementation.
 * That direction matters: a test written by reading the code proves only that the code does
 * what it does.
 */

import { AllocationComponent, type AllocatableAssignment } from '../../src/core-domain/allocation/allocation-component';
import { CAPACITY_TENTHS, percentageToTenths, tenthsToPercentage } from '../../src/shared/util/tenths';

const allocation = new AllocationComponent();

function assignment(
  id: string,
  start: string,
  end: string,
  percentage: number,
): AllocatableAssignment {
  return {
    id,
    memberId: 'm-1',
    projectId: `p-${id}`,
    allocationTenths: percentageToTenths(percentage),
    startDate: start,
    endDate: end,
    savedAsOverride: false,
  };
}

/**
 * business-logic-model.md §1, "Worked example".
 *
 *   | Assignment | Period          | Percentage |
 *   | A          | 1 Feb – 31 Mar  | 50.0%      |
 *   | B          | 15 Mar – 30 Apr | 30.0%      |
 *   | C          | 1 Apr – 15 Apr  | 40.0%      |
 *
 * Query range 1 Mar – 30 Apr. Boundaries: 1 Mar · 15 Mar · 1 Apr · 16 Apr · 1 May.
 */
describe('business-logic-model.md §1 — the segmentation worked example', () => {
  const ASSIGNMENTS = [
    assignment('A', '2026-02-01', '2026-03-31', 50),
    assignment('B', '2026-03-15', '2026-04-30', 30),
    assignment('C', '2026-04-01', '2026-04-15', 40),
  ];
  const RANGE = { start: '2026-03-01', end: '2026-04-30' };

  /** Transcribed directly from the document's expected-results table. */
  const EXPECTED = [
    { period: { start: '2026-03-01', end: '2026-03-14' }, covering: ['A'], total: 50, available: 50, over: false },
    { period: { start: '2026-03-15', end: '2026-03-31' }, covering: ['A', 'B'], total: 80, available: 20, over: false },
    { period: { start: '2026-04-01', end: '2026-04-15' }, covering: ['B', 'C'], total: 70, available: 30, over: false },
    { period: { start: '2026-04-16', end: '2026-04-30' }, covering: ['B'], total: 30, available: 70, over: false },
  ];

  it('produces exactly the four documented segments', () => {
    const segments = allocation.segmentAllocation(ASSIGNMENTS, RANGE);
    expect(segments).toHaveLength(EXPECTED.length);
  });

  it.each(EXPECTED)(
    'segment $period.start to $period.end totals $total% covering $covering',
    ({ period, covering, total, available, over }) => {
      const segments = allocation.segmentAllocation(ASSIGNMENTS, RANGE);
      const segment = segments.find((s) => s.period.start === period.start);

      expect(segment).toBeDefined();
      expect(segment?.period).toEqual(period);
      expect(tenthsToPercentage(segment?.totalTenths ?? -1)).toBe(total);
      expect(tenthsToPercentage(segment?.availableTenths ?? -1)).toBe(available);
      expect(segment?.isOverAllocated).toBe(over);

      // The contributing assignments are named, in the document's terms.
      expect(segment?.contributions.map((c) => c.assignmentId).sort()).toEqual(covering);
    },
  );

  it('cuts at exactly the documented boundaries and nowhere else', () => {
    const segments = allocation.segmentAllocation(ASSIGNMENTS, RANGE);
    // The document lists 1 Mar · 15 Mar · 1 Apr · 16 Apr as segment starts (1 May is the
    // exclusive closing bound and starts no segment).
    expect(segments.map((s) => s.period.start)).toEqual([
      '2026-03-01',
      '2026-03-15',
      '2026-04-01',
      '2026-04-16',
    ]);
  });

  it('excludes the part of A that lies before the query range', () => {
    // A starts 1 Feb, but the range starts 1 Mar. The first segment must begin at the range
    // start, not at the assignment start.
    const segments = allocation.segmentAllocation(ASSIGNMENTS, RANGE);
    expect(segments[0]?.period.start).toBe('2026-03-01');
  });

  it('never reports over-allocation for this example', () => {
    // The document's table says "no" in every row; a spurious flag here would mean the
    // capacity threshold is being applied wrongly.
    expect(allocation.detectOverAllocation('m-1', ASSIGNMENTS, RANGE)).toEqual([]);
  });

  it('agrees with totalOnDate on a day inside each segment', () => {
    const probes = [
      { date: '2026-03-05', total: 50 },
      { date: '2026-03-20', total: 80 },
      { date: '2026-04-10', total: 70 },
      { date: '2026-04-20', total: 30 },
    ];

    for (const { date, total } of probes) {
      const onDate = allocation.totalOnDate('m-1', date, ASSIGNMENTS);
      expect(tenthsToPercentage(onDate.totalTenths)).toBe(total);
    }
  });

  it('honours the documented boundary semantics at the A/C changeover', () => {
    // A ends 31 Mar, C starts 1 Apr: per the document they "do not overlap. Their totals
    // never sum." So no segment contains both.
    const segments = allocation.segmentAllocation(ASSIGNMENTS, RANGE);
    const both = segments.filter((s) => {
      const ids = s.contributions.map((c) => c.assignmentId);
      return ids.includes('A') && ids.includes('C');
    });
    expect(both).toEqual([]);
  });
});

/**
 * business-logic-model.md §5, Path B worked example — "the case that motivates the whole
 * design".
 *
 *   An assignment runs 1 Jan – 30 Jun at 50%. On 1 May a manager edits it to 80%.
 *   Query: what was this member allocated on 15 March?
 *
 *   Path A (current rows) answers 80% — WRONG.
 *   Path B (history)      answers 50% — correct.
 *
 * The transaction-time filtering is exercised against the real database in
 * `assignment-component.test.ts`; this test verifies the ARITHMETIC half — that feeding the
 * historical revision through the same segmentation yields 50%, and feeding the current row
 * yields 80%, so the two paths are demonstrably different answers rather than accidentally
 * identical ones.
 */
describe('business-logic-model.md §5 — the as-of reconstruction worked example', () => {
  const VALID_PERIOD = { start: '2026-01-01', end: '2026-06-30' };
  const QUERY_DATE = '2026-03-15';

  /** Revision 1: recorded 1 Jan, superseded 1 May. What was true on 15 March. */
  const REVISION_1 = assignment('rev-1', VALID_PERIOD.start, VALID_PERIOD.end, 50);

  /** Revision 2: recorded 1 May. The current row. */
  const REVISION_2 = assignment('rev-1', VALID_PERIOD.start, VALID_PERIOD.end, 80);

  it('Path B answers 50% for 15 March — the correct answer', () => {
    const onDate = allocation.totalOnDate('m-1', QUERY_DATE, [REVISION_1]);
    expect(tenthsToPercentage(onDate.totalTenths)).toBe(50);
  });

  it('Path A would answer 80% for 15 March — the wrong answer the design avoids', () => {
    // Asserted deliberately: it demonstrates the two paths give DIFFERENT answers, which is
    // the entire justification for keeping AssignmentHistory. If this ever equalled 50, the
    // test above would be passing for the wrong reason.
    const onDate = allocation.totalOnDate('m-1', QUERY_DATE, [REVISION_2]);
    expect(tenthsToPercentage(onDate.totalTenths)).toBe(80);
  });

  it('Path A and Path B agree about the PRESENT, where there is no history to differ on', () => {
    // The as-of machinery must not disturb current answers: today's question has one
    // correct answer, 80%.
    const currentAnswer = allocation.totalOnDate('m-1', '2026-06-01', [REVISION_2]);
    expect(tenthsToPercentage(currentAnswer.totalTenths)).toBe(80);
  });

  it('the edit changed only the percentage, so the valid period is identical in both', () => {
    // Confirms the example is testing transaction time, not valid time. If the periods
    // differed, the 50-vs-80 difference could be explained by the dates instead.
    expect(REVISION_1.startDate).toBe(REVISION_2.startDate);
    expect(REVISION_1.endDate).toBe(REVISION_2.endDate);
  });
});

/**
 * AS-01 / BR-M-16: capacity is 100.0% for every member, expressed exactly once.
 */
describe('capacity is a single constant (AS-01)', () => {
  it('is 1000 tenths', () => {
    expect(CAPACITY_TENTHS).toBe(1000);
    expect(tenthsToPercentage(CAPACITY_TENTHS)).toBe(100);
  });

  it('is what availability is computed against', () => {
    const segments = allocation.segmentAllocation(
      [assignment('A', '2026-01-01', '2026-01-31', 40)],
      { start: '2026-01-01', end: '2026-01-31' },
    );
    expect((segments[0]?.totalTenths ?? 0) + (segments[0]?.availableTenths ?? 0)).toBe(
      CAPACITY_TENTHS,
    );
  });

  it('applies identically to every member — no per-member capacity exists in Phase 1', () => {
    // If a capacity attribute is ever added, this test should fail and force a deliberate
    // decision rather than silently accepting a second source of truth.
    const forTwoMembers = ['m-1', 'm-2'].map((memberId) =>
      allocation.segmentAllocation(
        [{ ...assignment('A', '2026-01-01', '2026-01-31', 60), memberId }],
        { start: '2026-01-01', end: '2026-01-31' },
      ),
    );

    expect(forTwoMembers[0]?.[0]?.availableTenths).toBe(forTwoMembers[1]?.[0]?.availableTenths);
    expect(forTwoMembers[0]?.[0]?.availableTenths).toBe(400);
  });
});
