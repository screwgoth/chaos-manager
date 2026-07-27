/**
 * C-02 ProjectComponent tests.
 *
 * The two rules worth the most care:
 *
 *   BR-P-06 — the unconfirmed close is a PREVIEW. It must return the affected assignments
 *   and write nothing, because a close that silently ended other people's work would be
 *   indistinguishable from data loss.
 *
 *   BR-P-10 — staffing splits current from past by DATE. An assignment ended early still
 *   staffed the project while it ran, so a status check would erase that history.
 */

import { ProjectComponent, type ProjectInput } from '../../src/core-domain/project/project-component';
import { ReferenceDataComponent } from '../../src/core-domain/reference-data/reference-data-component';
import { NotFoundError, ValidationError } from '../../src/shared/errors';
import type {
  AssignmentRepository,
  OrgUnitRepository,
  ProjectRepository,
} from '../../src/shared/repository';
import type { ScopeFilter } from '../../src/shared/types/authorization';
import type {
  Assignment,
  OrgUnit,
  Project,
  ReferenceDataEntry,
} from '../../src/shared/types/domain';

const ALL: ScopeFilter = { orgUnitIds: 'ALL', restrictToMemberId: null };

const DEPT: OrgUnit = { id: 'ou-1', name: 'Engineering', parentOrgUnitId: null, isActive: true };
const INACTIVE_DEPT: OrgUnit = { id: 'ou-2', name: 'Gone', parentOrgUnitId: null, isActive: false };
const TYPE: ReferenceDataEntry = {
  id: 'ref-type',
  referenceType: 'PROJECT_TYPE',
  name: 'Internal',
  isActive: true,
};
const RETIRED_TYPE: ReferenceDataEntry = {
  id: 'ref-type-old',
  referenceType: 'PROJECT_TYPE',
  name: 'Legacy',
  isActive: false,
};

const PROJECT: Project = {
  id: 'p-1',
  code: 'PRJ-1',
  name: 'Platform',
  description: null,
  owningOrgUnitId: DEPT.id,
  projectTypeId: TYPE.id,
  startDate: '2026-01-01',
  plannedEndDate: '2026-06-30',
  status: 'ACTIVE',
  closedOn: null,
};

let assignmentCounter = 0;
function makeAssignment(
  memberId: string,
  startDate: string,
  endDate: string,
  tenths: number,
  status: Assignment['status'] = 'ACTIVE',
): Assignment {
  assignmentCounter += 1;
  return {
    id: `a-${assignmentCounter}`,
    memberId,
    projectId: PROJECT.id,
    allocationTenths: tenths,
    startDate,
    endDate,
    projectRoleId: null,
    savedAsOverride: false,
    status,
    endedEarlyOn: null,
  };
}

interface Harness {
  component: ProjectComponent;
  projects: Project[];
  autoEndCalls: { projectId: string; date: string }[];
}

function setup(
  seedProjects: Project[] = [PROJECT],
  seedAssignments: Assignment[] = [],
  autoEndCount = 0,
): Harness {
  const projects = seedProjects.map((p) => ({ ...p }));
  const assignments = seedAssignments.map((a) => ({ ...a }));
  const autoEndCalls: { projectId: string; date: string }[] = [];

  const projectRepo = {
    findById: async (id: string) => projects.find((p) => p.id === id) ?? null,
    findLocation: async (id: string) => {
      const project = projects.find((p) => p.id === id);
      return project
        ? {
            id,
            owningOrgUnitId: project.owningOrgUnitId,
            status: project.status,
            startDate: project.startDate,
            plannedEndDate: project.plannedEndDate,
            closedOn: project.closedOn,
          }
        : null;
    },
    search: async () => ({
      items: projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        owningOrgUnitId: p.owningOrgUnitId,
        status: p.status,
      })),
      total: projects.length,
      offset: 0,
      limit: 50,
    }),
    findOpenOn: async (onDate: string) =>
      projects
        .filter(
          (p) => p.status === 'ACTIVE' && p.startDate <= onDate && p.plannedEndDate >= onDate,
        )
        .map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          owningOrgUnitId: p.owningOrgUnitId,
          status: p.status,
        })),
    create: async (input: ProjectInput) => {
      const created: Project = {
        id: `p-${projects.length + 1}`,
        ...input,
        status: 'ACTIVE',
        closedOn: null,
      };
      projects.push(created);
      return created;
    },
    update: async (id: string, input: ProjectInput) => {
      const project = projects.find((p) => p.id === id);
      if (!project) return null;
      Object.assign(project, input);
      return project;
    },
    close: async (id: string, closedOn: string) => {
      const project = projects.find((p) => p.id === id);
      if (!project) return null;
      project.status = 'CLOSED';
      project.closedOn = closedOn;
      return project;
    },
    reopen: async (id: string) => {
      const project = projects.find((p) => p.id === id);
      if (!project) return null;
      project.status = 'ACTIVE';
      project.closedOn = null;
      return project;
    },
  } as unknown as ProjectRepository;

  const assignmentRepo = {
    findByProject: async () => assignments,
  } as unknown as AssignmentRepository;

  const orgUnitRepo = {
    findById: async (id: string) => [DEPT, INACTIVE_DEPT].find((u) => u.id === id) ?? null,
  } as unknown as OrgUnitRepository;

  const referenceRepo = {
    findByIds: async (ids: readonly string[]) =>
      [TYPE, RETIRED_TYPE].filter((e) => ids.includes(e.id)),
  } as unknown as never;

  const component = new ProjectComponent(
    projectRepo,
    assignmentRepo,
    orgUnitRepo,
    new ReferenceDataComponent(referenceRepo),
    {
      autoEndForProject: async (projectId: string, date: string) => {
        autoEndCalls.push({ projectId, date });
        return autoEndCount;
      },
    },
  );

  return { component, projects, autoEndCalls };
}

const VALID_INPUT: ProjectInput = {
  code: 'PRJ-2',
  name: 'New Thing',
  description: null,
  owningOrgUnitId: DEPT.id,
  projectTypeId: TYPE.id,
  startDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
};

describe('validation (BR-P-01, BR-P-03)', () => {
  it('reports every missing field at once', async () => {
    const { component } = setup();
    const attempt = component.create(
      { ...VALID_INPUT, code: '', name: '  ', projectTypeId: '' },
      ALL,
    );

    await expect(attempt).rejects.toThrow(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.objectContaining({ field: 'code', rule: 'REQUIRED' }),
        expect.objectContaining({ field: 'name', rule: 'REQUIRED' }),
        expect.objectContaining({ field: 'projectTypeId', rule: 'REQUIRED' }),
      ]),
    });
  });

  it('rejects a planned end date before the start date (BR-P-03)', async () => {
    const { component } = setup();
    await expect(
      component.create({ ...VALID_INPUT, startDate: '2026-12-31', plannedEndDate: '2026-01-01' }, ALL),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'plannedEndDate', rule: 'DATE_ORDER' })],
    });
  });

  it('accepts a same-day project', async () => {
    const { component } = setup();
    const created = await component.create(
      { ...VALID_INPUT, startDate: '2026-03-01', plannedEndDate: '2026-03-01' },
      ALL,
    );
    expect(created.startDate).toBe(created.plannedEndDate);
  });
});

describe('reference validation (BR-P-04, BR-P-05)', () => {
  it('rejects an inactive project type', async () => {
    const { component } = setup();
    await expect(
      component.create({ ...VALID_INPUT, projectTypeId: RETIRED_TYPE.id }, ALL),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'projectTypeId', rule: 'INACTIVE' })],
    });
  });

  it('rejects an inactive owning org unit', async () => {
    const { component } = setup();
    await expect(
      component.create({ ...VALID_INPUT, owningOrgUnitId: INACTIVE_DEPT.id }, ALL),
    ).rejects.toMatchObject({
      violations: [expect.objectContaining({ field: 'owningOrgUnitId', rule: 'INACTIVE' })],
    });
  });

  it('does not re-check an UNCHANGED reference on update', async () => {
    // Deactivating a project type must not make existing projects un-editable.
    const legacy: Project = { ...PROJECT, projectTypeId: RETIRED_TYPE.id };
    const { component } = setup([legacy]);

    const renamed = await component.update(legacy.id, { name: 'Renamed' }, ALL);
    expect(renamed.name).toBe('Renamed');
  });
});

/**
 * BR-P-06 / BR-P-07 — the two-phase close.
 */
describe('closing a project (BR-P-06, BR-P-07)', () => {
  it('PREVIEWS without writing when assignments extend past the closure date', async () => {
    const harness = setup(
      [PROJECT],
      [makeAssignment('m-1', '2026-01-01', '2026-05-31', 500)],
      1,
    );

    const result = await harness.component.close(PROJECT.id, false, ALL, null, '2026-03-01');

    expect(result.confirmationRequired).toBe(true);
    expect(result.project).toBeNull(); // nothing written
    expect(result.openAssignments).toHaveLength(1);
    expect(result.openAssignments[0]?.endDate).toBe('2026-05-31');
    expect(result.autoEndedAssignmentCount).toBe(0);

    // The project really is untouched.
    expect(harness.projects[0]?.status).toBe('ACTIVE');
    expect(harness.autoEndCalls).toEqual([]);
  });

  it('closes and reports the auto-ended count once confirmed', async () => {
    const harness = setup(
      [PROJECT],
      [makeAssignment('m-1', '2026-01-01', '2026-05-31', 500)],
      1,
    );

    const result = await harness.component.close(PROJECT.id, true, ALL, null, '2026-03-01');

    expect(result.confirmationRequired).toBe(false);
    expect(result.project?.status).toBe('CLOSED');
    expect(result.project?.closedOn).toBe('2026-03-01');
    expect(result.autoEndedAssignmentCount).toBe(1);
    expect(harness.autoEndCalls).toEqual([{ projectId: PROJECT.id, date: '2026-03-01' }]);
  });

  it('closes immediately when nothing extends past the date — no pointless confirmation', async () => {
    // Demanding confirmation for a no-op trains users to click through dialogues.
    const harness = setup(
      [PROJECT],
      [makeAssignment('m-1', '2026-01-01', '2026-02-01', 500)],
    );

    const result = await harness.component.close(PROJECT.id, false, ALL, null, '2026-03-01');

    expect(result.confirmationRequired).toBe(false);
    expect(result.project?.status).toBe('CLOSED');
    expect(result.autoEndedAssignmentCount).toBe(0);
    expect(harness.autoEndCalls).toEqual([]);
  });

  it('ignores already-ENDED assignments when deciding whether to warn', async () => {
    const harness = setup(
      [PROJECT],
      [makeAssignment('m-1', '2026-01-01', '2026-05-31', 500, 'ENDED')],
    );

    const result = await harness.component.close(PROJECT.id, false, ALL, null, '2026-03-01');
    expect(result.confirmationRequired).toBe(false);
    expect(result.project?.status).toBe('CLOSED');
  });

  it('is idempotent for an already-closed project', async () => {
    const closed: Project = { ...PROJECT, status: 'CLOSED', closedOn: '2026-02-01' };
    const harness = setup([closed]);

    const result = await harness.component.close(closed.id, false, ALL);
    expect(result.confirmationRequired).toBe(false);
    expect(result.autoEndedAssignmentCount).toBe(0);
    expect(harness.autoEndCalls).toEqual([]);
  });

  it('throws NotFoundError for a missing project', async () => {
    const { component } = setup();
    await expect(component.close('p-nope', true, ALL)).rejects.toThrow(NotFoundError);
  });

  it('reopening does NOT restore auto-ended assignments', async () => {
    const closed: Project = { ...PROJECT, status: 'CLOSED', closedOn: '2026-02-01' };
    const harness = setup([closed]);

    const reopened = await harness.component.reopen(closed.id, ALL);
    expect(reopened.status).toBe('ACTIVE');
    expect(reopened.closedOn).toBeNull();
    expect(harness.autoEndCalls).toEqual([]);
  });
});

/**
 * BR-P-08: closed projects are excluded from assignment TARGETS.
 */
describe('listOpen (BR-P-08)', () => {
  it('excludes closed projects and those outside the date window', async () => {
    const { component } = setup([
      PROJECT, // 2026-01-01 .. 2026-06-30, ACTIVE
      { ...PROJECT, id: 'p-closed', code: 'PRJ-C', status: 'CLOSED', closedOn: '2026-02-01' },
      {
        ...PROJECT,
        id: 'p-future',
        code: 'PRJ-F',
        startDate: '2027-01-01',
        plannedEndDate: '2027-12-31',
      },
    ]);

    const open = await component.listOpen('2026-03-01', ALL);
    expect(open.map((p) => p.id)).toEqual([PROJECT.id]);
  });

  it('falls back to all active projects when the date is unusable', async () => {
    // Returning nothing would look like "no projects exist".
    const { component } = setup();
    const open = await component.listOpen('not-a-date', ALL);
    expect(open.length).toBeGreaterThan(0);
  });
});

/**
 * BR-P-09, BR-P-10, BR-P-11.
 */
describe('staffing (BR-P-09, BR-P-10, BR-P-11)', () => {
  it('states explicitly that a project is unstaffed', async () => {
    const { component } = setup([PROJECT], []);
    const staffing = await component.getStaffing(PROJECT.id, '2026-03-01', ALL);

    expect(staffing.isUnstaffed).toBe(true);
    expect(staffing.current).toEqual([]);
    expect(staffing.past).toEqual([]);
  });

  it('is NOT unstaffed when assignments exist but none are current', async () => {
    // "No assignments at all" and "none current" are different facts.
    const { component } = setup([PROJECT], [makeAssignment('m-1', '2026-01-01', '2026-01-31', 500)]);
    const staffing = await component.getStaffing(PROJECT.id, '2026-03-01', ALL);

    expect(staffing.isUnstaffed).toBe(false);
    expect(staffing.current).toEqual([]);
    expect(staffing.past).toHaveLength(1);
  });

  it('splits current from past by DATE, not status (BR-P-10)', async () => {
    const { component } = setup(
      [PROJECT],
      [
        makeAssignment('m-current', '2026-01-01', '2026-12-31', 500),
        // ENDED, but its range still contains the as-of date: it IS current.
        makeAssignment('m-ended-covering', '2026-01-01', '2026-12-31', 300, 'ENDED'),
        makeAssignment('m-past', '2026-01-01', '2026-01-31', 200),
      ],
    );

    const staffing = await component.getStaffing(PROJECT.id, '2026-03-01', ALL);

    expect(staffing.current.map((s) => s.memberId).sort()).toEqual([
      'm-current',
      'm-ended-covering',
    ]);
    expect(staffing.past.map((s) => s.memberId)).toEqual(['m-past']);
  });

  it('places a future assignment in NEITHER bucket', async () => {
    // Filing it under "past" would misreport the plan.
    const { component } = setup([PROJECT], [makeAssignment('m-future', '2026-06-01', '2026-06-30', 500)]);
    const staffing = await component.getStaffing(PROJECT.id, '2026-03-01', ALL);

    expect(staffing.current).toEqual([]);
    expect(staffing.past).toEqual([]);
    expect(staffing.isUnstaffed).toBe(false);
  });

  it('groups several concurrent assignments under the member with a subtotal (BR-P-11)', async () => {
    const { component } = setup(
      [PROJECT],
      [
        makeAssignment('m-1', '2026-01-01', '2026-12-31', 300),
        makeAssignment('m-1', '2026-01-01', '2026-12-31', 250),
        makeAssignment('m-2', '2026-01-01', '2026-12-31', 400),
      ],
    );

    const staffing = await component.getStaffing(PROJECT.id, '2026-03-01', ALL);

    expect(staffing.current).toHaveLength(2); // grouped, not three rows
    const first = staffing.current.find((s) => s.memberId === 'm-1');
    expect(first?.assignments).toHaveLength(2);
    // Exact integer-tenths subtotal (BR-A-03).
    expect(first?.subtotalTenths).toBe(550);
    expect(staffing.current.find((s) => s.memberId === 'm-2')?.subtotalTenths).toBe(400);
  });

  it('includes the as-of date in the result so the caller can label it', async () => {
    const { component } = setup();
    const staffing = await component.getStaffing(PROJECT.id, '2026-03-01', ALL);
    expect(staffing.asOf).toBe('2026-03-01');
    expect(staffing.projectId).toBe(PROJECT.id);
  });
});
