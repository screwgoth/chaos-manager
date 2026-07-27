# Component Methods — C.H.A.O.S

**Project**: chaos-manager
**Stage**: INCEPTION → Application Design
**Detail level**: Names, parameters, and return types (Q9:B)

> **Detailed business rules are NOT defined here.** Validation logic, error semantics, edge-case
> behavior, and persistence detail are designed in **Functional Design** (per unit, CONSTRUCTION phase).
> Signatures below establish contracts so mismatches surface now rather than during code generation.

Signatures are expressed in TypeScript syntax, consistent with the selected backend language
(NFR-T-02). The API framework and ORM remain open (**OD-03**, **OD-01** — resolved at NFR Requirements).

---

## Shared Types

```typescript
type MemberId       = string
type ProjectId      = string
type AssignmentId   = string
type OrgUnitId      = string
type ReferenceId    = string
type UserAccountId  = string
type SessionId      = string

type ISODate        = string          // YYYY-MM-DD
type Percentage     = number          // integer or simple decimal, 0..100

type EmploymentType = 'ON_ROLL' | 'OFF_ROLL'
type MemberStatus   = 'ACTIVE' | 'INACTIVE'
type ProjectStatus  = 'ACTIVE' | 'CLOSED'
type ReferenceType  = 'ROLE' | 'SKILL' | 'PROJECT_TYPE'
type UserRole       = 'ADMIN' | 'RESOURCE_MANAGER' | 'TEAM_LEAD' | 'TEAM_MEMBER' | 'EXECUTIVE'

interface DateRange { start: ISODate; end: ISODate }

interface AccessScope {
  role: UserRole
  orgUnitIds: OrgUnitId[] | 'ALL'
  ownMemberId: MemberId | null
}

interface ScopeFilter { orgUnitIds: OrgUnitId[] | 'ALL'; restrictToMemberId: MemberId | null }

interface Page<T> { items: T[]; total: number; offset: number; limit: number }
```

---

## C-01 — IMemberComponent

```typescript
interface IMemberComponent {
  create(input: MemberInput, scope: ScopeFilter): Member
  update(id: MemberId, input: Partial<MemberInput>, scope: ScopeFilter): Member
  getById(id: MemberId, scope: ScopeFilter): Member | null
  deactivate(id: MemberId, scope: ScopeFilter): Member
  reactivate(id: MemberId, scope: ScopeFilter): Member

  search(criteria: MemberSearchCriteria, scope: ScopeFilter): Page<MemberSummary>
  listAssignable(onDate: ISODate, scope: ScopeFilter): MemberSummary[]

  attachSkill(id: MemberId, skillId: ReferenceId, scope: ScopeFilter): Member
  detachSkill(id: MemberId, skillId: ReferenceId, scope: ScopeFilter): Member

  findExpiringContracts(withinDays: number, scope: ScopeFilter): MemberSummary[]
}

interface MemberInput {
  fullName: string
  email: string
  orgUnitId: OrgUnitId
  employmentType: EmploymentType
  roleId: ReferenceId
  externalRef: string | null              // natural key for duplicate detection
  skillIds: ReferenceId[]
  contract: ContractInput | null          // required when employmentType is OFF_ROLL
}

interface ContractInput {
  vendorName: string
  startDate: ISODate
  endDate: ISODate
  status: string
}
// No rate, contract value, or purchase-order field — excluded from Phase 1 per CQ1:A

interface MemberSearchCriteria {
  nameContains?: string
  orgUnitIds?: OrgUnitId[]
  employmentType?: EmploymentType
  roleIds?: ReferenceId[]
  skillIds?: ReferenceId[]
  status?: MemberStatus
  offset?: number
  limit?: number
}
```

---

## C-02 — IProjectComponent

```typescript
interface IProjectComponent {
  create(input: ProjectInput, scope: ScopeFilter): Project
  update(id: ProjectId, input: Partial<ProjectInput>, scope: ScopeFilter): Project
  getById(id: ProjectId, scope: ScopeFilter): Project | null
  close(id: ProjectId, confirmOpenAssignments: boolean, scope: ScopeFilter): CloseProjectResult

  search(criteria: ProjectSearchCriteria, scope: ScopeFilter): Page<ProjectSummary>
  listOpen(onDate: ISODate, scope: ScopeFilter): ProjectSummary[]

  getStaffing(id: ProjectId, asOf: ISODate, scope: ScopeFilter): ProjectStaffing
}

interface ProjectInput {
  name: string
  code: string                           // natural key for duplicate detection
  description: string | null
  owningOrgUnitId: OrgUnitId
  projectTypeId: ReferenceId
  startDate: ISODate
  plannedEndDate: ISODate
  status: ProjectStatus
}

interface CloseProjectResult { project: Project; openAssignments: AssignmentSummary[] }

interface ProjectStaffing {
  projectId: ProjectId
  current: StaffedMember[]
  past: StaffedMember[]
  isUnstaffed: boolean
}

interface StaffedMember {
  member: MemberSummary
  allocationPercentage: Percentage
  period: DateRange
  projectRoleId: ReferenceId | null
}
```

---

## C-03 — IAssignmentComponent

```typescript
interface IAssignmentComponent {
  create(input: AssignmentInput, overrideOverAllocation: boolean, scope: ScopeFilter): CreateAssignmentResult
  update(id: AssignmentId, input: Partial<AssignmentInput>, overrideOverAllocation: boolean, scope: ScopeFilter): CreateAssignmentResult
  endEarly(id: AssignmentId, effectiveEndDate: ISODate, scope: ScopeFilter): Assignment
  getById(id: AssignmentId, scope: ScopeFilter): Assignment | null

  findByMember(memberId: MemberId, range: DateRange | null, scope: ScopeFilter): Assignment[]
  findByProject(projectId: ProjectId, range: DateRange | null, scope: ScopeFilter): Assignment[]
  findOverlapping(memberIds: MemberId[], range: DateRange, scope: ScopeFilter): Assignment[]
  findAsOf(asOf: ISODate, scope: ScopeFilter): Assignment[]
}

interface AssignmentInput {
  memberId: MemberId
  projectId: ProjectId
  allocationPercentage: Percentage
  period: DateRange
  projectRoleId: ReferenceId | null
}

interface CreateAssignmentResult {
  assignment: Assignment | null           // null when blocked pending override decision
  overAllocation: OverAllocationFinding[] // non-empty when a warning was raised
  savedAsOverride: boolean
  conflicts: AssignmentConflict[]         // contract-window and member-active-period conflicts
}

interface AssignmentConflict {
  kind: 'CONTRACT_WINDOW' | 'MEMBER_INACTIVE_PERIOD' | 'PROJECT_CLOSED'
  detail: string
  boundaryDate: ISODate | null
}
```

**Note**: `findOverlapping` is the query AllocationComponent depends on for all capacity arithmetic. Its
efficiency governs whether the availability view meets **NFR-S-03** (sub-3-second). Query strategy is an
R2 folded-in obligation for Functional Design.

---

## C-04 — IAllocationComponent

The single owner of capacity arithmetic (Q2:A). Pure computation — no persistent state of its own.

```typescript
interface IAllocationComponent {
  totalOnDate(memberId: MemberId, onDate: ISODate, scope: ScopeFilter): AllocationOnDate

  profileOverRange(memberId: MemberId, range: DateRange, scope: ScopeFilter): AllocationSegment[]

  detectOverAllocation(
    memberId: MemberId,
    candidate: AssignmentInput,
    excludeAssignmentId: AssignmentId | null,
    scope: ScopeFilter
  ): OverAllocationFinding[]

  availability(query: AvailabilityQuery, scope: ScopeFilter): Page<AvailabilityResult>

  currentAllocationView(asOf: ISODate, criteria: AllocationViewCriteria, scope: ScopeFilter): Page<MemberAllocationRow>

  unallocatedMembers(range: DateRange, criteria: AllocationViewCriteria, scope: ScopeFilter): MemberSummary[]

  overAllocatedMembers(range: DateRange, scope: ScopeFilter): OverAllocationFinding[]

  memberTimeline(memberId: MemberId, range: DateRange, scope: ScopeFilter): TimelineSegment[]
}

interface AllocationOnDate {
  memberId: MemberId
  onDate: ISODate
  totalPercentage: Percentage
  availablePercentage: Percentage         // capacity (100) minus total; negative when over-allocated
  contributions: AllocationContribution[]
}

interface AllocationContribution {
  assignmentId: AssignmentId
  project: ProjectSummary
  allocationPercentage: Percentage
}

/** One sub-period over which the member's total allocation is constant.
 *  The range is segmented at every date where an assignment starts or ends. */
interface AllocationSegment {
  period: DateRange
  totalPercentage: Percentage
  availablePercentage: Percentage
  isOverAllocated: boolean
  contributions: AllocationContribution[]
}

/** Identifies the SPECIFIC sub-period exceeding 100%, not merely that the range does somewhere. */
interface OverAllocationFinding {
  memberId: MemberId
  member: MemberSummary
  period: DateRange
  totalPercentage: Percentage
  contributions: AllocationContribution[]
  arisesFromOverride: boolean
}

interface AvailabilityQuery {
  range: DateRange
  orgUnitIds?: OrgUnitId[]
  employmentType?: EmploymentType
  roleIds?: ReferenceId[]
  skillIds?: ReferenceId[]
  minimumAvailablePercentage?: Percentage
  offset?: number
  limit?: number
}

interface AvailabilityResult {
  member: MemberSummary
  range: DateRange
  segments: AllocationSegment[]           // availability varies within the range
  minAvailablePercentage: Percentage
  maxAvailablePercentage: Percentage
  isFullyAllocated: boolean
  isOverAllocated: boolean
}

interface MemberAllocationRow {
  member: MemberSummary
  totalPercentage: Percentage
  availablePercentage: Percentage
  isOverAllocated: boolean
  contributions: AllocationContribution[]
}

interface TimelineSegment {
  period: DateRange
  assignments: AllocationContribution[]
  totalPercentage: Percentage
  isGap: boolean
}

interface AllocationViewCriteria {
  orgUnitIds?: OrgUnitId[]
  employmentType?: EmploymentType
  roleIds?: ReferenceId[]
  skillIds?: ReferenceId[]
  offset?: number
  limit?: number
}
```

**Capacity model**: `availablePercentage` is computed against a fixed capacity of 100 for every member.
Part-time and fractional-capacity members are not modeled in Phase 1 (AS-01, resolved at Q10:B). The
constant is expressed once in this component so a later phase can make it a member attribute without
touching callers.

---

## C-05 — IOrgUnitComponent

```typescript
interface IOrgUnitComponent {
  create(input: OrgUnitInput): OrgUnit
  update(id: OrgUnitId, input: Partial<OrgUnitInput>): OrgUnit
  getById(id: OrgUnitId): OrgUnit | null
  listAll(): OrgUnit[]
  listHierarchy(): OrgUnitNode[]

  remove(id: OrgUnitId): RemoveResult
  countReferences(id: OrgUnitId): ReferenceCount

  resolveScope(role: UserRole, homeOrgUnitId: OrgUnitId | null): OrgUnitId[] | 'ALL'
}

interface OrgUnitInput {
  name: string
  parentOrgUnitId: OrgUnitId | null       // null for a department; set for a team
}

interface OrgUnitNode { orgUnit: OrgUnit; children: OrgUnitNode[] }
interface RemoveResult { removed: boolean; blockedBy: ReferenceCount | null }
interface ReferenceCount { memberCount: number; projectCount: number; childOrgUnitCount: number }
```

---

## C-06 — IReferenceDataComponent

Generic across ROLE, SKILL, and PROJECT_TYPE (Q8:C).

```typescript
interface IReferenceDataComponent {
  list(type: ReferenceType, includeInactive: boolean): ReferenceDataEntry[]
  getById(id: ReferenceId): ReferenceDataEntry | null
  create(type: ReferenceType, name: string): ReferenceDataEntry
  rename(id: ReferenceId, name: string): ReferenceDataEntry
  deactivate(id: ReferenceId): ReferenceDataEntry
  reactivate(id: ReferenceId): ReferenceDataEntry
  remove(id: ReferenceId): RemoveResult
  countReferences(id: ReferenceId): number
  validateIds(type: ReferenceType, ids: ReferenceId[]): ValidateIdsResult
}

interface ReferenceDataEntry {
  id: ReferenceId
  referenceType: ReferenceType
  name: string
  isActive: boolean
}

interface ValidateIdsResult { valid: ReferenceId[]; unknown: ReferenceId[]; inactive: ReferenceId[] }
```

**Note**: `validateIds` exists for ImportComponent, which must report unmatched reference values rather
than silently creating them.

---

## C-07 — IIdentityComponent

```typescript
interface IIdentityComponent {
  createAccount(input: UserAccountInput): UserAccount
  setPassword(id: UserAccountId, plainPassword: string): void
  verifyCredentials(username: string, plainPassword: string): VerifiedIdentity | null
  deactivateAccount(id: UserAccountId): UserAccount

  linkToMember(id: UserAccountId, memberId: MemberId): LinkResult
  unlinkFromMember(id: UserAccountId): UserAccount
  resolveIdentity(id: UserAccountId): VerifiedIdentity | null
}

interface UserAccountInput { username: string; role: UserRole; homeOrgUnitId: OrgUnitId | null }

interface VerifiedIdentity {
  userAccountId: UserAccountId
  username: string
  role: UserRole
  homeOrgUnitId: OrgUnitId | null
  linkedMemberId: MemberId | null
  isActive: boolean
}

interface LinkResult { linked: boolean; conflictingMemberId: MemberId | null }
```

**Note**: `verifyCredentials` accepts a plaintext password and returns an identity or null. It never
returns, logs, or exposes the stored hash. Only a salted hash is persisted (**FR-AU-02**, **US-ENB-02**).
The signature deliberately separates credential verification from session establishment (C-08), which is
what makes the boundary replaceable by SSO later (**US-ENB-03**).

---

## C-08 — ISessionComponent

```typescript
interface ISessionComponent {
  establish(identity: VerifiedIdentity): Session
  resolve(sessionId: SessionId): ResolvedSession | null
  touch(sessionId: SessionId): void
  terminate(sessionId: SessionId): void
  terminateAllForUser(userAccountId: UserAccountId): void
}

interface Session { id: SessionId; userAccountId: UserAccountId; createdAt: string; expiresAt: string }

interface ResolvedSession {
  sessionId: SessionId
  identity: VerifiedIdentity
  scope: AccessScope
  isExpired: boolean
}
```

---

## C-09 — IAuthorizationComponent

```typescript
interface IAuthorizationComponent {
  resolveScope(identity: VerifiedIdentity): AccessScope
  toScopeFilter(scope: AccessScope): ScopeFilter

  canRead(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): boolean
  canWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): boolean
  assertCanRead(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void
  assertCanWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void
}

type ResourceKind =
  | 'MEMBER' | 'PROJECT' | 'ASSIGNMENT' | 'ALLOCATION_VIEW'
  | 'REFERENCE_DATA' | 'ORG_UNIT' | 'USER_ACCOUNT' | 'IMPORT'

interface TargetRef { orgUnitId: OrgUnitId | null; memberId: MemberId | null }
```

**Note**: every method takes the server-resolved `AccessScope`, never a client-supplied role or org unit
(**FR-R-08**, **US-ENB-01**). `toScopeFilter` produces the constraint that repositories apply *inside*
the query, so out-of-scope rows are never fetched rather than fetched and trimmed.

---

## C-10 — IImportComponent

```typescript
interface IImportComponent {
  getTemplate(target: ImportTarget): TemplateDescriptor
  parse(target: ImportTarget, file: FileUpload): ParsedImport
  validate(parsed: ParsedImport, scope: ScopeFilter): ImportValidation
  execute(validated: ImportValidation, scope: ScopeFilter): ImportReport
}

type ImportTarget = 'MEMBERS' | 'PROJECTS'

interface TemplateDescriptor { target: ImportTarget; columns: TemplateColumn[] }
interface TemplateColumn { name: string; required: boolean; description: string }

interface ParsedImport { target: ImportTarget; rows: ParsedRow[]; unrecognisedColumns: string[] }
interface ParsedRow { rowNumber: number; values: Record<string, string> }

interface ImportValidation {
  target: ImportTarget
  validRows: ParsedRow[]
  failedRows: RowFailure[]
  conflictRows: RowConflict[]
}

/** All reasons for a row are reported, not only the first. */
interface RowFailure { rowNumber: number; reasons: string[] }

interface RowConflict {
  rowNumber: number
  kind: 'EXISTING_RECORD' | 'DUPLICATE_WITHIN_FILE' | 'UNMATCHED_REFERENCE_DATA'
  detail: string
  existingRecordId: string | null
}

interface ImportReport {
  target: ImportTarget
  createdCount: number
  failedRows: RowFailure[]
  conflictRows: RowConflict[]
}
```

---

## C-12 — Route Layer Endpoints

REST per resource (Q6:A). Shape validation only; no business rules (Q4:A).

| Method | Path | Service | Stories |
|---|---|---|---|
| POST | `/api/auth/login` | AuthService | US-ACC-01, US-ACC-03 |
| POST | `/api/auth/logout` | AuthService | US-ACC-02 |
| GET | `/api/auth/session` | AuthService | US-ACC-02 |
| GET | `/api/members` | MemberService | US-MEM-04 |
| POST | `/api/members` | MemberService | US-MEM-01, US-MEM-07 |
| GET | `/api/members/:id` | MemberService | US-MEM-01 |
| PATCH | `/api/members/:id` | MemberService | US-MEM-01, US-MEM-02, US-MEM-03 |
| POST | `/api/members/:id/deactivate` | MemberService | US-MEM-05 |
| GET | `/api/members/expiring-contracts` | MemberService | US-MEM-06 |
| GET | `/api/members/me` | MemberService | US-VIS-04 |
| GET | `/api/projects` | ProjectService | US-PRJ-03 |
| POST | `/api/projects` | ProjectService | US-PRJ-01, US-PRJ-05 |
| GET | `/api/projects/:id` | ProjectService | US-PRJ-01 |
| PATCH | `/api/projects/:id` | ProjectService | US-PRJ-01 |
| POST | `/api/projects/:id/close` | ProjectService | US-PRJ-02 |
| GET | `/api/projects/:id/staffing` | ProjectService | US-PRJ-04 |
| POST | `/api/assignments` | AssignmentService | US-ASN-01, US-ASN-05, US-ASN-06 |
| PATCH | `/api/assignments/:id` | AssignmentService | US-ASN-03, US-ASN-05 |
| POST | `/api/assignments/:id/end` | AssignmentService | US-ASN-03 |
| GET | `/api/assignments` | AssignmentService | US-ASN-02, US-ASN-07 |
| GET | `/api/allocations/current` | AllocationQueryService | US-VIS-01 |
| GET | `/api/allocations/as-of` | AllocationQueryService | US-ASN-07 |
| GET | `/api/allocations/availability` | AllocationQueryService | US-VIS-02, US-VIS-03 |
| GET | `/api/allocations/unallocated` | AllocationQueryService | US-VIS-06 |
| GET | `/api/allocations/over-allocated` | AllocationQueryService | US-VIS-07 |
| GET | `/api/allocations/timeline/:memberId` | AllocationQueryService | US-VIS-05 |
| GET | `/api/reference-data/:type` | ReferenceDataService | US-ADM-01 |
| POST | `/api/reference-data/:type` | ReferenceDataService | US-ADM-01 |
| PATCH | `/api/reference-data/:id` | ReferenceDataService | US-ADM-01, US-ADM-02 |
| DELETE | `/api/reference-data/:id` | ReferenceDataService | US-ADM-02 |
| GET | `/api/org-units` | OrgUnitService | US-ADM-03 |
| POST | `/api/org-units` | OrgUnitService | US-ADM-03 |
| PATCH | `/api/org-units/:id` | OrgUnitService | US-ADM-03 |
| DELETE | `/api/org-units/:id` | OrgUnitService | US-ADM-03 |
| GET | `/api/import/template/:target` | ImportService | US-IMP-05 |
| POST | `/api/import/:target` | ImportService | US-IMP-01 to US-IMP-04 |
| POST | `/api/user-accounts/:id/link-member` | AuthService | US-ACC-04 |

**Note on `POST /api/assignments`**: over-allocation is a two-step interaction — the first call returns
the warning with `assignment: null`, and the client re-submits with `overrideOverAllocation: true` to
proceed (**US-ASN-05**). The exact protocol (re-submit versus a confirmation token) is a Functional
Design decision.
