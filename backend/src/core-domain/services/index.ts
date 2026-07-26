/**
 * THE COMPOSITION ROOT.
 *
 * Everything is wired here and nowhere else: no component constructs its own dependencies,
 * and no route reaches past its service. That is what makes the X-1 replacement a one-line
 * change — see `AUTHORIZATION` below.
 */

import type { AppConfig } from '../../shared/config';
import type { Db } from '../../shared/repository';
import {
  AssignmentHistoryRepository,
  AssignmentRepository,
  MemberRepository,
  OrgUnitRepository,
  ProjectRepository,
  ReferenceDataRepository,
  SessionRepository,
  UserAccountRepository,
} from '../../shared/repository';
import type { IAuthorizationComponent } from '../../shared/types/authorization';
import { AllocationComponent } from '../allocation/allocation-component';
import { AssignmentComponent } from '../assignment/assignment-component';
import { PermissiveAuthorizationStandIn } from '../authorization-standin/authorization-standin';
import { IdentityComponent } from '../identity/identity-component';
import { MemberComponent } from '../member/member-component';
import { OrgUnitComponent } from '../org-unit/org-unit-component';
import { ProjectComponent } from '../project/project-component';
import { ReferenceDataComponent } from '../reference-data/reference-data-component';
import { SessionComponent } from '../session/session-component';
import { AccessControlService } from './access-control-service';
import { AllocationQueryService } from './allocation-query-service';
import { AssignmentService } from './assignment-service';
import { AuthService } from './auth-service';
import { MemberService } from './member-service';
import { ProjectService } from './project-service';
import { OrgUnitService, ReferenceDataService } from './reference-data-service';

export { AccessControlService } from './access-control-service';
export { AllocationQueryService } from './allocation-query-service';
export { AssignmentService } from './assignment-service';
export { AuthService } from './auth-service';
export { MemberService } from './member-service';
export { ProjectService } from './project-service';
export { OrgUnitService, ReferenceDataService } from './reference-data-service';
export type { AllocationViewCriteria, AvailabilityQuery } from './allocation-query-service';

export interface Services {
  auth: AuthService;
  accessControl: AccessControlService;
  members: MemberService;
  projects: ProjectService;
  assignments: AssignmentService;
  allocations: AllocationQueryService;
  referenceData: ReferenceDataService;
  orgUnits: OrgUnitService;
  /** Exposed for the bootstrap admin account, not for routes. */
  identity: IdentityComponent;
  sessions: SessionComponent;
}

export function createServices(db: Db, config: AppConfig): Services {
  // --- repositories ------------------------------------------------------
  const memberRepository = new MemberRepository(db);
  const projectRepository = new ProjectRepository(db);
  const assignmentRepository = new AssignmentRepository(db);
  const historyRepository = new AssignmentHistoryRepository(db);
  const orgUnitRepository = new OrgUnitRepository(db);
  const referenceRepository = new ReferenceDataRepository(db);
  const accountRepository = new UserAccountRepository(db);
  const sessionRepository = new SessionRepository(db);

  // --- components --------------------------------------------------------
  const allocation = new AllocationComponent();
  const referenceData = new ReferenceDataComponent(referenceRepository);
  const orgUnits = new OrgUnitComponent(orgUnitRepository);

  const assignments = new AssignmentComponent(
    db,
    assignmentRepository,
    historyRepository,
    memberRepository,
    projectRepository,
    allocation,
  );

  // Member and Project depend on Assignment for the auto-end cascades (BR-M-13, BR-P-07),
  // because each ending must write a history revision in the same transaction (BR-A-16) and
  // only C-03 owns that invariant.
  const members = new MemberComponent(
    memberRepository,
    orgUnitRepository,
    referenceData,
    assignments,
  );

  const projects = new ProjectComponent(
    projectRepository,
    assignmentRepository,
    orgUnitRepository,
    referenceData,
    assignments,
  );

  // Argon2 parameters come from configuration, NOT from a constant in the component.
  // Step 12 found them hardcoded, which made ARGON2_MEMORY_KIB a silent no-op.
  const identity = new IdentityComponent(accountRepository, memberRepository, {
    memoryCost: config.argon2.memoryKiB,
    timeCost: config.argon2.iterations,
    parallelism: config.argon2.parallelism,
  });

  const sessions = new SessionComponent(
    sessionRepository,
    accountRepository,
    config.session.idleMinutes,
  );

  /**
   * ⚠️ X-1 — THE ONE LINE UNIT 2 CHANGES.
   *
   * Replace with the real C-09 from `supporting-platform/authorization/`, then DELETE
   * `core-domain/authorization-standin/` entirely. If any other line in this file or any
   * service has to change, the interface was incomplete — a Unit 1 design defect.
   *
   * While this stand-in is wired, TEAM_LEAD and RESOURCE_MANAGER see all org units
   * (BR-R-05 not enforced).
   */
  const AUTHORIZATION: IAuthorizationComponent = new PermissiveAuthorizationStandIn();

  // --- services ----------------------------------------------------------
  const accessControl = new AccessControlService(AUTHORIZATION);

  return {
    auth: new AuthService(identity, sessions, accessControl),
    accessControl,
    members: new MemberService(members, accessControl),
    projects: new ProjectService(projects, accessControl),
    assignments: new AssignmentService(assignments, accessControl),
    allocations: new AllocationQueryService(
      allocation,
      memberRepository,
      assignmentRepository,
      accessControl,
    ),
    referenceData: new ReferenceDataService(referenceData, accessControl),
    orgUnits: new OrgUnitService(orgUnits, accessControl),
    identity,
    sessions,
  };
}
