/**
 * C-02 ProjectComponent — BR-P-01…11.
 *
 * The two rules worth reading the code for:
 *
 *   BR-P-06 — closing a project with assignments extending past the closure date REQUIRES
 *   explicit confirmation, and the first response returns the affected assignments. A
 *   close that silently ended other people's work would be indistinguishable from data
 *   loss, so the unconfirmed call is a preview, not an action.
 *
 *   BR-P-10 — staffing distinguishes CURRENT from PAST by DATE, never by status. An
 *   assignment ended early still staffed the project for its elapsed portion.
 */

import { NotFoundError, ViolationCollector } from '../../shared/errors';
import type { AssignmentRepository, OrgUnitRepository, ProjectRepository } from '../../shared/repository';
import type { ReferenceDataComponent } from '../reference-data/reference-data-component';
import type { ScopeFilter } from '../../shared/types/authorization';
import type {
  Assignment,
  IsoDate,
  MemberId,
  OrgUnitId,
  Page,
  Project,
  ProjectId,
  ProjectStatus,
  ProjectSummary,
  ReferenceId,
  Tenths,
} from '../../shared/types/domain';
import { isIsoDate, isValidRange, rangeContains, today } from '../../shared/util/dates';
import { sumTenths } from '../../shared/util/tenths';

export interface ProjectInput {
  code: string;
  name: string;
  description: string | null;
  owningOrgUnitId: OrgUnitId;
  projectTypeId: ReferenceId;
  startDate: IsoDate;
  plannedEndDate: IsoDate;
}

export interface ProjectSearchCriteria {
  search: string | null;
  orgUnitIds: OrgUnitId[] | null;
  projectTypeId: ReferenceId | null;
  status: ProjectStatus | null;
  offset: number;
  limit: number;
}

export interface AssignmentSummary {
  id: string;
  memberId: MemberId;
  allocationTenths: Tenths;
  startDate: IsoDate;
  endDate: IsoDate;
}

/**
 * `project` is null when confirmation is required — nothing was written.
 * BR-A-10's principle applied to closure: a preview persists nothing.
 */
export interface CloseProjectResult {
  project: Project | null;
  openAssignments: AssignmentSummary[];
  confirmationRequired: boolean;
  autoEndedAssignmentCount: number;
}

/** BR-P-11: several concurrent assignments to one project group under the member. */
export interface StaffedMember {
  memberId: MemberId;
  assignments: AssignmentSummary[];
  /** Exact integer-tenths subtotal across the grouped assignments (BR-A-03). */
  subtotalTenths: Tenths;
}

export interface ProjectStaffing {
  projectId: ProjectId;
  asOf: IsoDate;
  current: StaffedMember[];
  past: StaffedMember[];
  /** BR-P-09: an unstaffed project is stated explicitly, not implied by an empty list. */
  isUnstaffed: boolean;
}

/** See the equivalent note in MemberComponent — history must be written by C-03. */
export interface ProjectAssignmentAutoEnder {
  autoEndForProject(
    projectId: ProjectId,
    effectiveDate: IsoDate,
    actorUserId: string | null,
  ): Promise<number>;
}

const MAX_CODE_LENGTH = 40;
const MAX_NAME_LENGTH = 200;

export class ProjectComponent {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly assignments: AssignmentRepository,
    private readonly orgUnits: OrgUnitRepository,
    private readonly referenceData: ReferenceDataComponent,
    private readonly autoEnder: ProjectAssignmentAutoEnder,
  ) {}

  async getById(id: ProjectId, scope: ScopeFilter): Promise<Project | null> {
    return this.projects.findById(id, scope);
  }

  async search(
    criteria: ProjectSearchCriteria,
    scope: ScopeFilter,
  ): Promise<Page<ProjectSummary>> {
    return this.projects.search(criteria, scope);
  }

  /**
   * BR-P-08: closed projects are excluded from assignment TARGETS while remaining in
   * historical views. This is the target list, so it excludes them.
   *
   * `onDate` filters to projects whose planned window contains the date — assigning
   * someone to a project that ended last year is almost always a mistake, and the
   * assignment-side conflict warnings cover the deliberate cases.
   */
  async listOpen(onDate: IsoDate, scope: ScopeFilter): Promise<ProjectSummary[]> {
    if (!isIsoDate(onDate)) {
      // No usable date: fall back to every active project rather than silently
      // returning nothing, which would look like "no projects exist".
      const page = await this.projects.search(
        {
          search: null,
          orgUnitIds: null,
          projectTypeId: null,
          status: 'ACTIVE',
          offset: 0,
          limit: 1000,
        },
        scope,
      );
      return page.items;
    }
    return this.projects.findOpenOn(onDate, scope);
  }

  async create(input: ProjectInput, _scope: ScopeFilter): Promise<Project> {
    const violations = new ViolationCollector();
    const normalised = this.normalise(input);

    this.validateFields(normalised, violations);
    await this.validateReferences(normalised, violations);
    violations.throwIfAny('The project could not be created.');

    // BR-P-02 (unique code, case-insensitive) is enforced by the database index and
    // surfaces as a ConflictError naming the field.
    return this.projects.create(normalised);
  }

  async update(
    id: ProjectId,
    input: Partial<ProjectInput>,
    scope: ScopeFilter,
  ): Promise<Project> {
    const existing = await this.projects.findById(id, scope);
    if (!existing) throw new NotFoundError('The project');

    const merged = this.normalise({
      code: input.code ?? existing.code,
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      owningOrgUnitId: input.owningOrgUnitId ?? existing.owningOrgUnitId,
      projectTypeId: input.projectTypeId ?? existing.projectTypeId,
      startDate: input.startDate ?? existing.startDate,
      plannedEndDate: input.plannedEndDate ?? existing.plannedEndDate,
    });

    const violations = new ViolationCollector();
    this.validateFields(merged, violations);
    await this.validateReferences(merged, violations, existing);
    violations.throwIfAny('The project could not be updated.');

    const updated = await this.projects.update(id, merged);
    if (!updated) throw new NotFoundError('The project');
    return updated;
  }

  /**
   * BR-P-06 / BR-P-07: two-phase closure.
   *
   * Phase 1 (`confirmOpenAssignments = false`) — if any assignment extends past the
   * closure date, return them with `confirmationRequired: true` and write NOTHING. The
   * caller shows the user exactly whose work is about to be ended.
   *
   * Phase 2 (`confirmOpenAssignments = true`) — auto-end those assignments at `closedOn`
   * and report the count (BR-P-07).
   *
   * A project with nothing extending past the date closes immediately: there is nothing to
   * warn about, and demanding confirmation for a no-op trains users to click through
   * dialogues without reading them.
   */
  async close(
    id: ProjectId,
    confirmOpenAssignments: boolean,
    scope: ScopeFilter,
    actorUserId: string | null = null,
    closedOn: IsoDate = today(),
  ): Promise<CloseProjectResult> {
    const existing = await this.projects.findById(id, scope);
    if (!existing) throw new NotFoundError('The project');

    if (existing.status === 'CLOSED') {
      return {
        project: existing,
        openAssignments: [],
        confirmationRequired: false,
        autoEndedAssignmentCount: 0,
      };
    }

    const extending = await this.findAssignmentsExtendingBeyond(id, closedOn, scope);

    if (extending.length > 0 && !confirmOpenAssignments) {
      return {
        project: null, // nothing written — this is a preview
        openAssignments: extending,
        confirmationRequired: true,
        autoEndedAssignmentCount: 0,
      };
    }

    // End assignments BEFORE closing, so a failure leaves the project open and retryable
    // rather than closed with dangling open assignments.
    const autoEndedAssignmentCount =
      extending.length > 0
        ? await this.autoEnder.autoEndForProject(id, closedOn, actorUserId)
        : 0;

    const project = await this.projects.close(id, closedOn);
    if (!project) throw new NotFoundError('The project');

    return {
      project,
      openAssignments: extending,
      confirmationRequired: false,
      autoEndedAssignmentCount,
    };
  }

  async reopen(id: ProjectId, scope: ScopeFilter): Promise<Project> {
    const existing = await this.projects.findById(id, scope);
    if (!existing) throw new NotFoundError('The project');

    const project = await this.projects.reopen(id);
    if (!project) throw new NotFoundError('The project');
    // BR-P-07's auto-ended assignments are NOT restored, for the same reason as
    // BR-M-15: re-booking people onto a plan that has moved on must be a deliberate act.
    return project;
  }

  /**
   * BR-P-09, BR-P-10, BR-P-11 together.
   *
   * Current vs past is decided by DATE against `asOf` (BR-P-10) — an assignment ended
   * early still staffed the project while it ran, and a status check would erase that.
   *
   * Assignments are grouped by member with an exact integer-tenths subtotal (BR-P-11),
   * because Q4:B permits several concurrent assignments of the same member to one
   * project and a flat list would show the same person three times with no total.
   */
  async getStaffing(
    id: ProjectId,
    asOf: IsoDate,
    scope: ScopeFilter,
  ): Promise<ProjectStaffing> {
    const project = await this.projects.findById(id, scope);
    if (!project) throw new NotFoundError('The project');

    const all = await this.assignments.findByProject(id, scope, null);

    const currentRows: Assignment[] = [];
    const pastRows: Assignment[] = [];
    for (const assignment of all) {
      const isCurrent = rangeContains(
        { start: assignment.startDate, end: assignment.endDate },
        asOf,
      );
      if (isCurrent) currentRows.push(assignment);
      // Only genuinely past assignments go in `past`; future ones belong to neither
      // bucket, and silently filing them under "past" would misreport the plan.
      else if (assignment.endDate < asOf) pastRows.push(assignment);
    }

    return {
      projectId: id,
      asOf,
      current: this.groupByMember(currentRows),
      past: this.groupByMember(pastRows),
      // BR-P-09: "no assignments at all", not "none current".
      isUnstaffed: all.length === 0,
    };
  }

  // --- internals ----------------------------------------------------------

  private async findAssignmentsExtendingBeyond(
    projectId: ProjectId,
    date: IsoDate,
    scope: ScopeFilter,
  ): Promise<AssignmentSummary[]> {
    const all = await this.assignments.findByProject(projectId, scope, null);
    return all
      .filter((assignment) => assignment.status === 'ACTIVE' && assignment.endDate > date)
      .map((assignment) => ({
        id: assignment.id,
        memberId: assignment.memberId,
        allocationTenths: assignment.allocationTenths,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
      }));
  }

  private groupByMember(assignments: readonly Assignment[]): StaffedMember[] {
    const byMember = new Map<MemberId, AssignmentSummary[]>();

    for (const assignment of assignments) {
      const summary: AssignmentSummary = {
        id: assignment.id,
        memberId: assignment.memberId,
        allocationTenths: assignment.allocationTenths,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
      };
      const existing = byMember.get(assignment.memberId);
      if (existing) existing.push(summary);
      else byMember.set(assignment.memberId, [summary]);
    }

    return [...byMember.entries()]
      .map(([memberId, rows]) => ({
        memberId,
        assignments: rows,
        // Integer tenths, so the subtotal is exact regardless of order (BR-A-03).
        subtotalTenths: sumTenths(rows.map((r) => r.allocationTenths)),
      }))
      .sort((a, b) => a.memberId.localeCompare(b.memberId));
  }

  private normalise(input: ProjectInput): ProjectInput {
    return {
      code: input.code?.trim() ?? '',
      name: input.name?.trim() ?? '',
      description: input.description?.trim() || null,
      owningOrgUnitId: input.owningOrgUnitId,
      projectTypeId: input.projectTypeId,
      startDate: input.startDate,
      plannedEndDate: input.plannedEndDate,
    };
  }

  /** BR-P-01 and BR-P-03, all violations reported together (US-PRJ-05). */
  private validateFields(input: ProjectInput, violations: ViolationCollector): void {
    violations
      .addIf(input.code === '', 'code', 'REQUIRED', 'A project code is required.')
      .addIf(
        input.code.length > MAX_CODE_LENGTH,
        'code',
        'TOO_LONG',
        `A project code may be at most ${MAX_CODE_LENGTH} characters.`,
      )
      .addIf(input.name === '', 'name', 'REQUIRED', 'A project name is required.')
      .addIf(
        input.name.length > MAX_NAME_LENGTH,
        'name',
        'TOO_LONG',
        `A project name may be at most ${MAX_NAME_LENGTH} characters.`,
      )
      .addIf(
        !input.owningOrgUnitId,
        'owningOrgUnitId',
        'REQUIRED',
        'An owning organisational unit is required.',
      )
      .addIf(!input.projectTypeId, 'projectTypeId', 'REQUIRED', 'A project type is required.')
      .addIf(
        !isIsoDate(input.startDate),
        'startDate',
        'INVALID_DATE',
        'A valid start date (YYYY-MM-DD) is required.',
      )
      .addIf(
        !isIsoDate(input.plannedEndDate),
        'plannedEndDate',
        'INVALID_DATE',
        'A valid planned end date (YYYY-MM-DD) is required.',
      );

    if (isIsoDate(input.startDate) && isIsoDate(input.plannedEndDate)) {
      // BR-P-03
      violations.addIf(
        !isValidRange({ start: input.startDate, end: input.plannedEndDate }),
        'plannedEndDate',
        'DATE_ORDER',
        'The planned end date cannot be before the start date.',
      );
    }
  }

  /**
   * BR-P-04: projectTypeId must be active PROJECT_TYPE reference data — never a
   * hardcoded list. BR-P-05: owning org unit must exist and be active.
   *
   * As in MemberComponent, an UNCHANGED reference is not re-checked for active status, so
   * deactivating a project type does not make every existing project un-editable.
   */
  private async validateReferences(
    input: ProjectInput,
    violations: ViolationCollector,
    existing?: Project,
  ): Promise<void> {
    if (input.owningOrgUnitId && input.owningOrgUnitId !== existing?.owningOrgUnitId) {
      const orgUnit = await this.orgUnits.findById(input.owningOrgUnitId);
      if (!orgUnit) {
        violations.add(
          'owningOrgUnitId',
          'NOT_FOUND',
          'The selected organisational unit does not exist.',
        );
      } else if (!orgUnit.isActive) {
        violations.add(
          'owningOrgUnitId',
          'INACTIVE',
          `"${orgUnit.name}" is deactivated and cannot own new projects.`,
        );
      }
    }

    if (input.projectTypeId && input.projectTypeId !== existing?.projectTypeId) {
      const check = await this.referenceData.validateIds('PROJECT_TYPE', [input.projectTypeId]);
      if (check.unknown.length > 0) {
        violations.add('projectTypeId', 'NOT_FOUND', 'The selected project type does not exist.');
      } else if (check.inactive.length > 0) {
        violations.add(
          'projectTypeId',
          'INACTIVE',
          'That project type is deactivated. Reactivate it, or choose another.',
        );
      }
    }
  }
}
