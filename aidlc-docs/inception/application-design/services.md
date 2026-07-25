# Services — C.H.A.O.S

**Project**: chaos-manager
**Stage**: INCEPTION → Application Design
**Pattern**: One service per domain area (Q3:A) · rules enforced in domain and service layer only (Q4:A)

## Layering Contract

```
Route layer (C-12)     shape validation, session resolution, HTTP mapping   -- NO business rules
      |
      v
Service layer          orchestration, authorization, transaction boundary
      |
      v
Domain components      business rules and invariants (C-01..C-10)
      |
      v
Repository layer (C-11) persistence, scope-filtered queries
```

**Invariant**: a route handler calls exactly one service method and never calls a domain component or
repository directly. This is what guarantees **US-ENB-04** — any client, including a future mobile app or
integration, reaches identical enforcement because the enforcement sits below the route layer.

**Universal service obligation**: every service method's first action is to obtain the `AccessScope` from
the resolved session and derive a `ScopeFilter` via `AuthorizationComponent`. Every downstream call
carries that filter. No service method accepts a role, scope, or org unit supplied by the client
(**FR-R-08**, **US-ENB-01**).

---

## S-01 — AuthService

- **Responsibility**: Sign-in, sign-out, session resolution, and user-account-to-member linkage.
- **Orchestrates**: IdentityComponent (C-07), SessionComponent (C-08), AuthorizationComponent (C-09)
- **Key operations**: `login`, `logout`, `currentSession`, `linkAccountToMember`
- **Orchestration — login**: verify credentials via C-07 → on success resolve scope via C-09 → establish session via C-08 → return session and scope. On failure return a single undifferentiated rejection so valid usernames cannot be discovered by trial (**US-ACC-03**).
- **Stories**: US-ACC-01, US-ACC-02, US-ACC-03, US-ACC-04

## S-02 — AccessControlService

- **Responsibility**: The scope-derivation utility every other service depends on. Not exposed as its own REST resource.
- **Orchestrates**: AuthorizationComponent (C-09), OrgUnitComponent (C-05)
- **Key operations**: `scopeFor(session)`, `assertRead`, `assertWrite`
- **Design note**: Deliberately a service rather than a shared helper, so that authorization has one call path that can be reviewed and, in a later phase, audited in one place.
- **Stories**: US-ACC-05, US-ENB-01

## S-03 — MemberService

- **Responsibility**: Member lifecycle and directory queries.
- **Orchestrates**: MemberComponent (C-01), OrgUnitComponent (C-05), ReferenceDataComponent (C-06), AccessControlService (S-02)
- **Key operations**: `create`, `update`, `getById`, `deactivate`, `search`, `attachSkill`, `detachSkill`, `expiringContracts`, `getOwnProfile`
- **Orchestration — create**: derive scope → assert write on MEMBER for the target org unit → validate org unit via C-05 and role/skills via C-06 → delegate to C-01 → return member or the collected validation failures
- **Stories**: US-MEM-01 to US-MEM-07, US-VIS-04 (own profile)

## S-04 — ProjectService

- **Responsibility**: Project lifecycle, registry queries, and staffing presentation.
- **Orchestrates**: ProjectComponent (C-02), OrgUnitComponent (C-05), ReferenceDataComponent (C-06), AssignmentComponent (C-03), AccessControlService (S-02)
- **Key operations**: `create`, `update`, `getById`, `close`, `search`, `getStaffing`
- **Orchestration — close**: derive scope → assert write → ask C-03 for assignments still open past today → if any and not yet confirmed, return them for confirmation rather than closing → on confirmation delegate close to C-02, preserving history
- **Stories**: US-PRJ-01 to US-PRJ-05

## S-05 — AssignmentService

- **Responsibility**: Assignment lifecycle, including the over-allocation warning and override interaction.
- **Orchestrates**: AssignmentComponent (C-03), AllocationComponent (C-04), MemberComponent (C-01), ProjectComponent (C-02), ReferenceDataComponent (C-06), AccessControlService (S-02)
- **Key operations**: `create`, `update`, `endEarly`, `findByMember`, `findByProject`
- **Orchestration — create** (the most involved flow in the application):
  1. Derive scope; assert write on ASSIGNMENT for the member's and project's org units
  2. Validate member is active and project is open
  3. Check date-range conflicts — end before start, contract window, member active period (**US-ASN-06**)
  4. Ask **C-04** `detectOverAllocation` for the candidate assignment
  5. If findings exist and `overrideOverAllocation` is false → return findings with `assignment: null`; **persist nothing**
  6. If findings exist and override is true → persist via C-03, marking the assignment as an override
  7. If no findings → persist normally
  8. Return the assignment together with any findings, so the client can display the flag
- **Transaction boundary**: steps 4 to 7 execute within one transaction so a concurrent assignment cannot slip between the over-allocation check and the write. **Concurrency semantics are a Functional Design obligation.**
- **Stories**: US-ASN-01 to US-ASN-06

## S-06 — AllocationQueryService

- **Responsibility**: All read-side allocation and availability views. Contains no arithmetic of its own — it shapes queries for C-04 and shapes results for the client.
- **Orchestrates**: AllocationComponent (C-04), MemberComponent (C-01), AccessControlService (S-02)
- **Key operations**: `currentView`, `asOfView`, `availabilitySearch`, `unallocated`, `overAllocated`, `memberTimeline`
- **Orchestration — availabilitySearch**: derive scope → apply scope to the candidate member set → pass range and filters to C-04 `availability` → return paged results ordered so the most-available members surface first (**US-VIS-02**)
- **Performance note**: This service serves the Phase 1 success criterion — answering "who is available next month?" in under a minute. Meeting **NFR-S-03** here is an R2 folded-in obligation for Functional Design.
- **Stories**: US-VIS-01 to US-VIS-07, US-ASN-07

## S-07 — ReferenceDataService

- **Responsibility**: Admin management of roles, skills, and project types.
- **Orchestrates**: ReferenceDataComponent (C-06), AccessControlService (S-02)
- **Key operations**: `list`, `create`, `rename`, `deactivate`, `reactivate`, `remove`
- **Orchestration — remove**: derive scope → assert write on REFERENCE_DATA (Admin only) → ask C-06 for the reference count → if non-zero refuse the deletion and report the count, offering deactivation instead (**US-ADM-02**)
- **Stories**: US-ADM-01, US-ADM-02

## S-08 — OrgUnitService

- **Responsibility**: Admin management of the two-level organizational structure.
- **Orchestrates**: OrgUnitComponent (C-05), AccessControlService (S-02)
- **Key operations**: `list`, `listHierarchy`, `create`, `update`, `remove`
- **Design note**: Separate from S-07 because org units drive the access scope that every other service depends on. A change here affects visibility everywhere, which warrants its own service boundary.
- **Stories**: US-ADM-03

## S-09 — ImportService

- **Responsibility**: Orchestrates the parse → validate → execute pipeline for bulk member and project loading.
- **Orchestrates**: ImportComponent (C-10), MemberComponent (C-01), ProjectComponent (C-02), ReferenceDataComponent (C-06), OrgUnitComponent (C-05), AccessControlService (S-02)
- **Key operations**: `getTemplate`, `import`
- **Orchestration — import**:
  1. Derive scope; assert write on IMPORT (Admin only)
  2. C-10 `parse` the uploaded file; collect unrecognised columns
  3. C-10 `validate` each row independently — collect failures with **all** reasons per row, and conflicts against existing records and within the file
  4. C-10 `execute` — create records for valid rows only, inside a transaction
  5. Return the report: created count, failed rows with reasons, conflict rows
- **Transaction boundary**: valid rows commit together; failed and conflicting rows are excluded without aborting the operation (**US-IMP-03**).
- **Stories**: US-IMP-01 to US-IMP-05

---

## Service-to-Component Matrix

| Service | C-01 Member | C-02 Project | C-03 Assign | C-04 Alloc | C-05 OrgUnit | C-06 RefData | C-07 Identity | C-08 Session | C-09 Authz | C-10 Import |
|---|---|---|---|---|---|---|---|---|---|---|
| S-01 AuthService | ● | | | | | | ● | ● | ● | |
| S-02 AccessControlService | | | | | ● | | | | ● | |
| S-03 MemberService | ● | | | | ● | ● | | | ● | |
| S-04 ProjectService | | ● | ● | | ● | ● | | | ● | |
| S-05 AssignmentService | ● | ● | ● | ● | | ● | | | ● | |
| S-06 AllocationQueryService | ● | | | ● | | | | | ● | |
| S-07 ReferenceDataService | | | | | | ● | | | ● | |
| S-08 OrgUnitService | | | | | ● | | | | ● | |
| S-09 ImportService | ● | ● | | | ● | ● | | | ● | ● |

Every service depends on **C-09 AuthorizationComponent** — that universality is the point. There is no
data path that skips authorization.

---

## Story Coverage by Service

| Service | Stories |
|---|---|
| S-01 AuthService | US-ACC-01, US-ACC-02, US-ACC-03, US-ACC-04 |
| S-02 AccessControlService | US-ACC-05, US-ENB-01 |
| S-03 MemberService | US-MEM-01…07, US-VIS-04 |
| S-04 ProjectService | US-PRJ-01…05 |
| S-05 AssignmentService | US-ASN-01…06 |
| S-06 AllocationQueryService | US-VIS-01…03, US-VIS-05…07, US-ASN-07 |
| S-07 ReferenceDataService | US-ADM-01, US-ADM-02 |
| S-08 OrgUnitService | US-ADM-03 |
| S-09 ImportService | US-IMP-01…05 |

Enabler stories US-ENB-02 (password hashing) and US-ENB-03 (replaceable auth boundary) are properties of
**C-07 IdentityComponent** rather than of a service. US-ENB-04 (client-agnostic API) is a property of the
layering contract at the top of this document.
