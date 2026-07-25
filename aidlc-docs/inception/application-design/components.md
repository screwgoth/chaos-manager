# Components — C.H.A.O.S

**Project**: chaos-manager
**Stage**: INCEPTION → Application Design
**Date**: 2026-07-25

## Design Decisions Applied

| Decision | Choice |
|---|---|
| Architectural style | **Layered monolith** — HTTP/route layer → service layer → domain layer → data access layer (Q1:A) |
| Allocation logic | **Single dedicated Allocation component** owns all capacity arithmetic (Q2:A) |
| Service layer | **One service per domain area** (Q3:A) |
| Rule enforcement | **Domain and service layer only** — route layer validates request shape only (Q4:A) |
| Frontend | **Feature-folder structure** (Q5:A) |
| API contract | **REST endpoints per resource** (Q6:A) |
| Unit seam | **Core Domain / Supporting Platform** (Q7 revised to A at CQ1:A) |
| Reference data | **Generic component for roles/skills/project types; separate OrgUnit component** (Q8 → C, confirmed CQ2:A) |
| Signature detail | **Names, parameters, return types** (Q9:B) |

**Deferred to Functional Design** (per-unit, CONSTRUCTION): detailed business rules, validation logic,
persistence schema, and the six NFR obligations folded in by revision R2.

All component, entity, field, and method names below are domain-neutral per **FR-C-01** — none carries
IT/Engineering-specific vocabulary.

---

## 1. Backend Domain Components

### C-01 — MemberComponent

- **Purpose**: Owns the member record — the roster of people who can be assigned, on-roll and off-roll alike.
- **Responsibilities**
  - Maintain member identity, contact, org unit, employment type, role, and status
  - Hold off-roll contract attributes (vendor, contract start/end, contract status) on the same entity, distinguished by `employmentType` (FR-M-02)
  - Attach and detach skills drawn from reference data
  - Deactivate members without destroying their assignment history
  - Answer member search and filter queries
  - Identify off-roll members whose contract ends within the configured window
- **Interface**: `IMemberComponent` — CRUD, deactivate, skill attach/detach, search, expiring-contract query
- **Owns entities**: `Member`, `MemberSkill`
- **Depends on**: OrgUnitComponent (validate org unit), ReferenceDataComponent (validate role and skills)
- **Satisfies**: FR-M-01 to FR-M-07
- **Expected unit**: Unit 1 — Core Domain

### C-02 — ProjectComponent

- **Purpose**: Owns the project registry — the engagements members are assigned to.
- **Responsibilities**
  - Maintain project name, code, description, owning org unit, project type, start date, planned end date, status
  - Close projects while preserving assignment history
  - Answer project search and filter queries
  - Report a project's current and past staffing by delegating to AssignmentComponent
- **Interface**: `IProjectComponent` — CRUD, close, search, staffing view
- **Owns entities**: `Project`
- **Depends on**: OrgUnitComponent (validate owning org unit), ReferenceDataComponent (validate project type), AssignmentComponent (read staffing)
- **Satisfies**: FR-P-01 to FR-P-04, FR-P-06
- **Expected unit**: Unit 1 — Core Domain

### C-03 — AssignmentComponent

- **Purpose**: Owns the assignment record — the link between a member and a project, bounded by a date range and carrying an allocation percentage.
- **Responsibilities**
  - Create, modify, and end assignments
  - Hold allocation percentage, start date, end date, and optional project role
  - Record that an assignment was saved as an explicit over-allocation override
  - Retain ended and historical assignments so allocation is reconstructible as of any past date
  - Answer "which assignments overlap this date or range" for a member, a project, or a scope
- **Interface**: `IAssignmentComponent` — create, modify, end, query by member/project/range
- **Owns entities**: `Assignment`
- **Depends on**: MemberComponent (validate member active), ProjectComponent (validate project open), AllocationComponent (over-allocation check before save), ReferenceDataComponent (validate project role)
- **Satisfies**: FR-A-01, FR-A-02, FR-A-07, FR-A-08, FR-A-09, FR-A-10
- **Expected unit**: Unit 1 — Core Domain

### C-04 — AllocationComponent

- **Purpose**: **The single owner of all capacity arithmetic.** Summation over overlapping date ranges, over-allocation detection, and availability computation are one body of logic exposed three ways.
- **Responsibilities**
  - Compute a member's total allocation as of a date, as the sum of percentages of all assignments overlapping that date (FR-A-03)
  - Compute a member's allocation profile across a date range, segmented at every point where the total changes
  - Detect over-allocation — total exceeding 100% — and identify the **specific sub-periods** that exceed it, not merely that the range does somewhere
  - Compute available capacity for a member over a range as the inverse of allocation
  - Answer availability searches: which members have unallocated capacity in a period, filtered by org unit, employment type, role, or skill
  - Identify fully unallocated members ("bench") and over-allocated members for a period
  - Produce a member's assignment timeline across a period
- **Interface**: `IAllocationComponent` — pure computation over assignment data; holds no persistent state of its own
- **Owns entities**: none — it computes over `Assignment` data supplied through the data access layer
- **Depends on**: AssignmentComponent (assignment data), MemberComponent (member set and filters)
- **Satisfies**: FR-A-03, FR-A-04, FR-A-05, FR-A-06 (detection half), FR-V-01 to FR-V-07
- **Expected unit**: Unit 1 — Core Domain
- **Design note — highest-risk component**: Every allocation figure, warning, and availability result in the application derives from this one component. **Phase 1 capacity model: every member's capacity is 100%; part-time members are not modeled** (AS-01, resolved at Q10:B). With no automated test suite in Phase 1 (NFR-Q-01), this component's behavior is the primary subject of the manual acceptance checks in `stories.md`.

### C-05 — OrgUnitComponent

- **Purpose**: Owns the two-level organizational structure and the scope boundaries derived from it.
- **Responsibilities**
  - Maintain departments and the teams within them (FR-O-01)
  - Provide org units as selectable values for members and projects
  - Refuse removal of an org unit that is still referenced, reporting what references it
  - Resolve which org units fall within a given access scope, for use by AuthorizationComponent
- **Interface**: `IOrgUnitComponent` — CRUD, hierarchy query, scope resolution, reference check
- **Owns entities**: `OrgUnit`
- **Depends on**: none
- **Satisfies**: FR-O-01 to FR-O-04
- **Expected unit**: Unit 1 — Core Domain
- **Design note**: Separated from ReferenceDataComponent per Q8:C. Org units are hierarchical, they drive the visibility scope applied to every query, and their removal semantics differ from a simple lookup. Folding them into the generic component would force org-unit special cases into it.

### C-06 — ReferenceDataComponent

- **Purpose**: Generic owner of the simple admin-managed lookups — roles, skills, and project types — that make the application team-type agnostic.
- **Responsibilities**
  - Maintain named, activatable entries for each reference type through one shared abstraction
  - Make new entries immediately selectable with no redeployment (FR-C-03)
  - Propagate renames to every referencing record
  - Deactivate entries in use rather than deleting them, preserving referential integrity (FR-C-04)
  - Refuse hard deletion of an entry in use, reporting the reference count
- **Interface**: `IReferenceDataComponent` — parameterized by reference type: list, create, rename, deactivate, reactivate, reference count
- **Owns entities**: `ReferenceDataEntry` (discriminated by `referenceType`: ROLE, SKILL, PROJECT_TYPE)
- **Depends on**: none
- **Satisfies**: FR-C-01 to FR-C-04, FR-C-06
- **Expected unit**: Unit 1 — Core Domain
- **Forward reference**: **FR-C-05** requires the model to permit user-defined custom fields in Phase 2 without restructuring core entities. That extension point is a Functional Design obligation and is not designed here.

### C-07 — IdentityComponent

- **Purpose**: Owns user accounts and credential verification, isolated so that SSO can replace it later.
- **Responsibilities**
  - Maintain user accounts, their assigned role, and their active status
  - Verify submitted credentials
  - Store passwords only as salted hashes produced by a current password-hashing algorithm (FR-AU-02)
  - Link a user account to at most one member record, and enforce that limit
  - Resolve an authenticated user's identity and role for downstream authorization
- **Interface**: `IIdentityComponent` — account CRUD, credential verification, password set, member link
- **Owns entities**: `UserAccount`
- **Depends on**: MemberComponent (validate member on link)
- **Satisfies**: FR-AU-01, FR-AU-02, FR-AU-05
- **Expected unit**: Unit 1 — Core Domain (minimal local authentication only; see unit note in `component-dependency.md`)
- **Design note**: Credential verification is deliberately separated from session establishment (C-08) and from identity resolution, which is what makes the authentication boundary replaceable per **US-ENB-03**. The full design of that boundary is an R2 folded-in obligation for Functional Design.

### C-08 — SessionComponent

- **Purpose**: Owns session lifecycle, independent of how the user authenticated.
- **Responsibilities**
  - Establish a session for a verified identity, carrying user, role, and resolved access scope
  - Expire sessions after the configured inactivity period
  - Terminate sessions on sign-out
  - Reject requests carrying an expired or unknown session
- **Interface**: `ISessionComponent` — establish, resolve, refresh, terminate
- **Owns entities**: `Session`
- **Depends on**: IdentityComponent (verified identity), AuthorizationComponent (resolve scope at establishment)
- **Satisfies**: FR-AU-04
- **Expected unit**: Unit 1 — Core Domain

### C-09 — AuthorizationComponent

- **Purpose**: The single decision point for "may this session do this to this data", enforced server-side.
- **Responsibilities**
  - Resolve a session's access scope from its role and org unit (FR-R-07)
  - Decide read and write permission per role: Admin, Resource/Delivery Manager, Team Lead, Team Member, Executive (FR-R-01 to FR-R-06)
  - Supply a scope constraint that every data query applies, so scoping is a query-level filter rather than a post-fetch trim
  - Refuse any request whose scope or role does not permit it, regardless of what the client sent (FR-R-08)
- **Interface**: `IAuthorizationComponent` — resolve scope, assert read, assert write, produce scope filter
- **Owns entities**: `RolePermission` (configuration, not user data)
- **Depends on**: OrgUnitComponent (scope resolution)
- **Satisfies**: FR-R-01 to FR-R-08
- **Expected unit**: Unit 2 — Supporting Platform (full RBAC and org-scope enforcement; build Wave 5 per `stories.md` §9.3)
- **Design note**: Never trusts a client-supplied role, scope, member id, or org unit. All decisions derive from the server-resolved session. The enforcement points are an R2 folded-in obligation for Functional Design.

### C-10 — ImportComponent

- **Purpose**: Owns bulk loading of members and projects from CSV/Excel, with per-row outcomes.
- **Responsibilities**
  - Parse uploaded CSV/Excel files against the expected column set
  - Validate each row independently, so valid rows import while invalid rows do not (FR-I-02)
  - Report each failed row by file position with **all** reasons it failed, not only the first
  - Detect rows whose natural key duplicates an existing record, or another row in the same file, and report them as conflicts without creating duplicates (FR-I-04)
  - Match referenced roles, skills, project types, and org units against existing reference data, reporting unmatched values rather than silently creating them
  - Provide a downloadable template describing expected columns
- **Interface**: `IImportComponent` — parse, validate, execute import, produce report, produce template
- **Owns entities**: `ImportReport` (transient result, persistence deferred to Functional Design)
- **Depends on**: MemberComponent, ProjectComponent, ReferenceDataComponent, OrgUnitComponent
- **Satisfies**: FR-I-01 to FR-I-04, FR-M-08, FR-P-05
- **Expected unit**: Unit 2 — Supporting Platform (build Wave 8 — depends on every entity and validation rule being settled)

---

## 2. Data Access Layer

### C-11 — Repository Layer

- **Purpose**: Isolates domain components from persistence.
- **Responsibilities**
  - One repository per aggregate: `MemberRepository`, `ProjectRepository`, `AssignmentRepository`, `OrgUnitRepository`, `ReferenceDataRepository`, `UserAccountRepository`, `SessionRepository`
  - Accept the scope filter produced by AuthorizationComponent and apply it within the query, so out-of-scope rows are never fetched
  - Expose date-range-overlap queries for assignments, which AllocationComponent depends on
  - Own transaction boundaries for multi-entity operations such as import
- **Depends on**: the selected database (**OD-01, open** — resolved at NFR Requirements)
- **Expected unit**: Unit 1 — Core Domain (repositories for Unit 1 entities), extended in Unit 2
- **Design note**: Whether allocation summation is expressed as application-side computation over fetched rows or pushed partly into SQL is a **Functional Design** decision (R2 folded-in obligation: data access strategy and the allocation-persistence boundary). Q2:A fixes only that the *rules* live in C-04.

---

## 3. HTTP / Route Layer

### C-12 — Route Layer

- **Purpose**: Translates HTTP to service calls and back. Contains no business rules (Q4:A).
- **Responsibilities**
  - Validate request **shape** only — required fields present, types parseable, dates well-formed
  - Resolve the session and pass it to the service layer
  - Map service results and domain errors to HTTP status codes and response bodies
  - Expose REST endpoints per resource (Q6:A)
- **Explicitly does not**: make permission decisions, compute allocation, or enforce domain invariants — those live in C-09 and the domain components, so that any client reaches identical enforcement (**US-ENB-04**)
- **Expected unit**: Unit 1 — Core Domain, extended in Unit 2

---

## 4. Frontend Components

Feature-folder structure per Q5:A. Each feature folder owns its components, hooks, and API client calls.

| ID | Feature folder | Responsibility | Unit |
|---|---|---|---|
| F-01 | `auth/` | Sign-in form, session handling, sign-out, failed-sign-in feedback | Unit 1 |
| F-02 | `members/` | Member directory, member form, skill tagging, search and filters, contract-expiry flags | Unit 1 |
| F-03 | `projects/` | Project registry, project form, search and filters, project staffing view | Unit 1 |
| F-04 | `assignments/` | Assignment form, over-allocation warning and override dialog, modify and end assignment | Unit 1 |
| F-05 | `views/` | Current-state allocation view, availability search with filters, as-of date control, member timeline, bench list, over-allocated list, own-assignments view | Unit 1 |
| F-06 | `admin/` | Reference data management, org unit management | Unit 2 |
| F-07 | `import/` | File upload, import result report, error and conflict display, template download | Unit 2 |
| F-08 | `shared/` | Common UI primitives, date-range control, percentage input, allocation bar, empty-state and error-state components, API client, session context | Unit 1 |

**Design note on F-08**: the date-range control, percentage input, and allocation bar are shared
deliberately — they appear in assignment forms, every view, and the import report. Building them once
in Unit 1 keeps the visual treatment of allocation consistent, which matters because the Phase 1
success criterion is a speed-of-comprehension test, not a feature checklist.

---

## 5. Requirement Coverage by Component

| Requirement group | Components |
|---|---|
| FR-M — Members | C-01, C-10 (import), F-02 |
| FR-P — Projects | C-02, C-10 (import), F-03 |
| FR-A — Assignment & Allocation | C-03, C-04, F-04 |
| FR-V — Views & Availability | C-04, F-05 |
| FR-O — Organizational model | C-05, F-06 |
| FR-R — Access control | C-09, C-12 (session pass-through), F-08 |
| FR-AU — Authentication | C-07, C-08, F-01 |
| FR-C — Reference data & agnosticism | C-06, C-05, F-06 |
| FR-I — Data import | C-10, F-07 |

Every **Must**-priority functional requirement maps to at least one component. **FR-C-05** (Phase 2
custom-field extension point) is a structural constraint on the data model rather than a component
responsibility, and is carried to Functional Design.
