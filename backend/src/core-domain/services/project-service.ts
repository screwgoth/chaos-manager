/**
 * S-04 ProjectService.
 */

import { NotFoundError } from '../../shared/errors';
import type {
  CloseProjectResult,
  ProjectInput,
  ProjectSearchCriteria,
  ProjectStaffing,
} from '../project/project-component';
import type { ProjectComponent } from '../project/project-component';
import type {
  IsoDate,
  Page,
  Project,
  ProjectId,
  ProjectSummary,
  VerifiedIdentity,
} from '../../shared/types/domain';
import type { AccessControlService } from './access-control-service';

export class ProjectService {
  constructor(
    private readonly projects: ProjectComponent,
    private readonly accessControl: AccessControlService,
  ) {}

  async search(
    criteria: ProjectSearchCriteria,
    identity: VerifiedIdentity,
  ): Promise<Page<ProjectSummary>> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'PROJECT');
    return this.projects.search(criteria, this.accessControl.filterFor(scope));
  }

  async getById(id: ProjectId, identity: VerifiedIdentity): Promise<Project> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'PROJECT', { orgUnitId: null, memberId: null });

    const project = await this.projects.getById(id, this.accessControl.filterFor(scope));
    if (!project) throw new NotFoundError('The project');
    return project;
  }

  async listOpen(onDate: IsoDate, identity: VerifiedIdentity): Promise<ProjectSummary[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'PROJECT');
    return this.projects.listOpen(onDate, this.accessControl.filterFor(scope));
  }

  async getStaffing(
    id: ProjectId,
    asOf: IsoDate,
    identity: VerifiedIdentity,
  ): Promise<ProjectStaffing> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'PROJECT');
    return this.projects.getStaffing(id, asOf, this.accessControl.filterFor(scope));
  }

  async create(input: ProjectInput, identity: VerifiedIdentity): Promise<Project> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'PROJECT', {
      orgUnitId: input.owningOrgUnitId,
      memberId: null,
    });
    return this.projects.create(input, this.accessControl.filterFor(scope));
  }

  async update(
    id: ProjectId,
    input: Partial<ProjectInput>,
    identity: VerifiedIdentity,
  ): Promise<Project> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'PROJECT');
    return this.projects.update(id, input, this.accessControl.filterFor(scope));
  }

  /**
   * BR-P-06: two-phase. With `confirmOpenAssignments` false and assignments extending past
   * the closure date, this returns a PREVIEW and writes nothing.
   */
  async close(
    id: ProjectId,
    confirmOpenAssignments: boolean,
    identity: VerifiedIdentity,
  ): Promise<CloseProjectResult> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'PROJECT');
    return this.projects.close(
      id,
      confirmOpenAssignments,
      this.accessControl.filterFor(scope),
      identity.userAccountId,
    );
  }

  async reopen(id: ProjectId, identity: VerifiedIdentity): Promise<Project> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'PROJECT');
    return this.projects.reopen(id, this.accessControl.filterFor(scope));
  }
}
