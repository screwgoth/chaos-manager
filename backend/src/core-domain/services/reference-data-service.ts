/**
 * S-07 ReferenceDataService and S-08 OrgUnitService.
 *
 * Both are admin-facing. Reads are open to any authenticated user, because the role list and
 * skill list populate every member form — a TEAM_LEAD who cannot read reference data cannot
 * render a member page at all. Writes require ADMIN or RESOURCE_MANAGER (BR-R-01).
 */

import type {
  ReferenceDataComponent,
  RemoveResult as ReferenceRemoveResult,
  ValidateIdsResult,
} from '../reference-data/reference-data-component';
import type {
  OrgUnitComponent,
  OrgUnitInput,
  OrgUnitNode,
  ReferenceCount,
  RemoveResult as OrgUnitRemoveResult,
} from '../org-unit/org-unit-component';
import type {
  OrgUnit,
  OrgUnitId,
  ReferenceDataEntry,
  ReferenceId,
  ReferenceType,
  VerifiedIdentity,
} from '../../shared/types/domain';
import type { AccessControlService } from './access-control-service';

export class ReferenceDataService {
  constructor(
    private readonly referenceData: ReferenceDataComponent,
    private readonly accessControl: AccessControlService,
  ) {}

  async list(
    type: ReferenceType,
    includeInactive: boolean,
    identity: VerifiedIdentity,
  ): Promise<ReferenceDataEntry[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'REFERENCE_DATA');
    return this.referenceData.list(type, includeInactive);
  }

  async create(
    type: ReferenceType,
    name: string,
    identity: VerifiedIdentity,
  ): Promise<ReferenceDataEntry> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'REFERENCE_DATA');
    return this.referenceData.create(type, name);
  }

  async rename(
    id: ReferenceId,
    name: string,
    identity: VerifiedIdentity,
  ): Promise<ReferenceDataEntry> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'REFERENCE_DATA');
    return this.referenceData.rename(id, name);
  }

  async deactivate(id: ReferenceId, identity: VerifiedIdentity): Promise<ReferenceDataEntry> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'REFERENCE_DATA');
    return this.referenceData.deactivate(id);
  }

  async reactivate(id: ReferenceId, identity: VerifiedIdentity): Promise<ReferenceDataEntry> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'REFERENCE_DATA');
    return this.referenceData.reactivate(id);
  }

  /** BR-C-06: refused while referenced, and the count is reported so the caller can offer deactivation. */
  async remove(id: ReferenceId, identity: VerifiedIdentity): Promise<ReferenceRemoveResult> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'REFERENCE_DATA');
    return this.referenceData.remove(id);
  }

  async countReferences(id: ReferenceId, identity: VerifiedIdentity): Promise<number> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'REFERENCE_DATA');
    return this.referenceData.countReferences(id);
  }

  /** Exposed for Unit 2's import, which must report unmatched values rather than invent them. */
  async validateIds(
    type: ReferenceType,
    ids: ReferenceId[],
    identity: VerifiedIdentity,
  ): Promise<ValidateIdsResult> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'REFERENCE_DATA');
    return this.referenceData.validateIds(type, ids);
  }
}

export class OrgUnitService {
  constructor(
    private readonly orgUnits: OrgUnitComponent,
    private readonly accessControl: AccessControlService,
  ) {}

  async listAll(includeInactive: boolean, identity: VerifiedIdentity): Promise<OrgUnit[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ORG_UNIT');
    return this.orgUnits.listAll(includeInactive);
  }

  async listHierarchy(includeInactive: boolean, identity: VerifiedIdentity): Promise<OrgUnitNode[]> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ORG_UNIT');
    return this.orgUnits.listHierarchy(includeInactive);
  }

  async create(input: OrgUnitInput, identity: VerifiedIdentity): Promise<OrgUnit> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'ORG_UNIT', {
      orgUnitId: input.parentOrgUnitId,
      memberId: null,
    });
    return this.orgUnits.create(input);
  }

  async update(
    id: OrgUnitId,
    input: Partial<OrgUnitInput>,
    identity: VerifiedIdentity,
  ): Promise<OrgUnit> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'ORG_UNIT', { orgUnitId: id, memberId: null });
    return this.orgUnits.update(id, input);
  }

  /** BR-O-05: refused while referenced, reporting what references it. */
  async remove(id: OrgUnitId, identity: VerifiedIdentity): Promise<OrgUnitRemoveResult> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'ORG_UNIT', { orgUnitId: id, memberId: null });
    return this.orgUnits.remove(id);
  }

  async countReferences(id: OrgUnitId, identity: VerifiedIdentity): Promise<ReferenceCount> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireRead(scope, 'ORG_UNIT');
    return this.orgUnits.countReferences(id);
  }

  async deactivate(id: OrgUnitId, identity: VerifiedIdentity): Promise<OrgUnit> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'ORG_UNIT', { orgUnitId: id, memberId: null });
    return this.orgUnits.deactivate(id);
  }

  async reactivate(id: OrgUnitId, identity: VerifiedIdentity): Promise<OrgUnit> {
    const scope = this.accessControl.scopeFor(identity);
    this.accessControl.requireWrite(scope, 'ORG_UNIT', { orgUnitId: id, memberId: null });
    return this.orgUnits.reactivate(id);
  }
}
