/**
 * Repository layer public surface.
 *
 * Everything above this layer imports from here, never from an individual file, so the
 * set of persistence entry points is visible in one place. Note what is NOT exported:
 * `schema.ts` table interfaces and the Kysely builder types stay internal, which is what
 * keeps the persistence shape from leaking upward (R2-1 rule 4).
 */

export type { Db, DbOrTx } from './db';
export {
  checkDatabase,
  createDb,
  createPool,
  isUnrestricted,
  lockMemberForUpdate,
  permittedOrgUnitIds,
} from './db';

export { runMigrations } from './migrate';
export { seedReferenceData, type SeedResult } from './seed';

export { translatePgError, withPgErrors } from './pg-errors';

export { AssignmentRepository } from './assignment-repository';
export type { AssignmentWithProject, AssignmentWrite } from './assignment-repository';

export { AssignmentHistoryRepository } from './assignment-history-repository';
export type { RevisionWrite } from './assignment-history-repository';

export { MemberRepository } from './member-repository';
export type { MemberQuery, MemberWrite } from './member-repository';

export { OrgUnitRepository } from './org-unit-repository';
export type { OrgUnitInsert, OrgUnitReferenceCounts } from './org-unit-repository';

export { ProjectRepository } from './project-repository';
export type { ProjectQuery, ProjectWrite } from './project-repository';

export { ReferenceDataRepository } from './reference-data-repository';

export { SessionRepository } from './session-repository';
export type { ActiveSession, SessionCreate } from './session-repository';

export { UserAccountRepository } from './user-account-repository';
export type { StoredCredential, UserAccountWrite } from './user-account-repository';

/**
 * All repositories over one connection or transaction.
 *
 * Services take this rather than eight constructor parameters, and a service that needs a
 * transaction constructs a second bundle over the Kysely transaction object — which is
 * how transaction boundaries stay in the service layer where they belong (R2-1 rule 3)
 * instead of being decided inside individual repositories.
 */
export interface Repositories {
  orgUnits: OrgUnitRepository;
  referenceData: ReferenceDataRepository;
  members: MemberRepository;
  projects: ProjectRepository;
  assignments: AssignmentRepository;
  assignmentHistory: AssignmentHistoryRepository;
  userAccounts: UserAccountRepository;
  sessions: SessionRepository;
}

import { AssignmentHistoryRepository } from './assignment-history-repository';
import { AssignmentRepository } from './assignment-repository';
import type { DbOrTx } from './db';
import { MemberRepository } from './member-repository';
import { OrgUnitRepository } from './org-unit-repository';
import { ProjectRepository } from './project-repository';
import { ReferenceDataRepository } from './reference-data-repository';
import { SessionRepository } from './session-repository';
import { UserAccountRepository } from './user-account-repository';

export function createRepositories(db: DbOrTx): Repositories {
  return {
    orgUnits: new OrgUnitRepository(db),
    referenceData: new ReferenceDataRepository(db),
    members: new MemberRepository(db),
    projects: new ProjectRepository(db),
    assignments: new AssignmentRepository(db),
    assignmentHistory: new AssignmentHistoryRepository(db),
    userAccounts: new UserAccountRepository(db),
    sessions: new SessionRepository(db),
  };
}
