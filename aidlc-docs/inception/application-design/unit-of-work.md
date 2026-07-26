# Units of Work — C.H.A.O.S

**Project**: chaos-manager
**Stage**: INCEPTION → Units Generation (Part 2: Generation)
**Date**: 2026-07-25

## Decomposition Approach

Per the approved `unit-of-work-plan.md`:

| Decision | Resolution |
|---|---|
| Unit count | **2** — inherited from the Application Design seam (Q1:A), within the R1 cap of 3 |
| Unit names | `core-domain`, `supporting-platform` (Q2:A) |
| Deployment | Single deployable monolith — one Node.js API process, one React build (Q3:A) |
| Code layout | Layer-first, unit-second (Q4:A) |
| Build order | Sequential — `core-domain` then `supporting-platform` (Q5:A) |
| X-1 handling | Permissive authorization stand-in in Unit 1 (Q6:A) |
| Ownership | Single track; units are a sequencing device (Q7:A) |
| Shared code | Separate `shared/` module; one database schema with ordered migrations (Q8:A) |

**Terminology**: this is a **monolith**, so each unit is a **module** within one deployable, not an
independently deployable service. "Unit of work" is the planning term.

---

## Unit 1 — `core-domain`

**Purpose**: The system of record for people, projects, and their time-bounded allocation — everything
needed to answer "who is on what, at what percentage, when".

**Why this is Unit 1**: it contains the entire Slice 1 vertical thread, so the first end-to-end
demonstrable application falls out of this unit alone. It also owns the allocation arithmetic, which is
the highest-risk code in the project and benefits from being built while attention is undivided.

### Scope

| Layer | Contents |
|---|---|
| **Domain components** | C-01 Member · C-02 Project · C-03 Assignment · **C-04 Allocation** · C-05 OrgUnit · C-06 ReferenceData · C-07 Identity (local authentication only) · C-08 Session |
| **Services** | S-01 AuthService · S-03 MemberService · S-04 ProjectService · S-05 AssignmentService · S-06 AllocationQueryService · S-07 ReferenceDataService · S-08 OrgUnitService |
| **Data access** | C-11 repositories for all Unit 1 entities |
| **Route layer** | C-12 endpoints for auth, members, projects, assignments, allocations, reference data, org units |
| **Frontend** | F-01 auth · F-02 members · F-03 projects · F-04 assignments · F-05 views · **F-06 admin** · F-08 shared |
| **Stand-in** | Permissive `IAuthorizationComponent` implementation (see X-1 in `unit-of-work-dependency.md`) |

### Database entities owned

`Member` · `MemberSkill` · `Project` · `Assignment` · `OrgUnit` · `ReferenceDataEntry` ·
`UserAccount` · `Session`

### Interfaces published to Unit 2

| Interface | Consumed by |
|---|---|
| `IMemberComponent` | C-10 Import |
| `IProjectComponent` | C-10 Import |
| `IOrgUnitComponent` | C-10 Import, C-09 Authorization |
| `IReferenceDataComponent` | C-10 Import |
| `IAuthorizationComponent` | Unit 2 **replaces** Unit 1's stand-in implementation behind this unchanged interface |

### Stories

**32 stories — 29 Must, 3 Should** (corrected 2026-07-26 at Unit 2 Functional Design, Q15:A). Full list
in `unit-of-work-story-map.md`.

Originally scoped at 30. Verification against shipped code found that Unit 1 also completed
**US-ASN-04** (project role on assignment) and **US-VIS-05** (member assignment timeline), both
originally assigned to Unit 2 — the allocation component produced them as a by-product. They are
credited here rather than left claimed by a unit that did not build them.
**Contains all six Slice 1 stories**: US-ACC-01, US-ENB-02, US-MEM-01, US-PRJ-01, US-ASN-01, US-VIS-01.

### Independently demonstrable

**Yes.** On completion, a user can sign in, create members and projects, configure reference data and org
units, assign members with percentages and date ranges, receive over-allocation warnings, view current
allocation, and search future availability. This is a working replacement for the allocation spreadsheet.

**With one caveat**: org-scope visibility restrictions are not yet enforced (X-1). Every signed-in user
sees all data regardless of role. Acceptable only because Q7:A confirms no external pilot users during
this unit.

### R2 folded-in NFR obligations addressed by this unit's Functional Design

1. Data access strategy and the allocation-persistence boundary
2. Session handling design
3. Replaceable authentication boundary (US-ENB-03)
6. Performance approach for allocation and availability queries against NFR-S-03

---

## Unit 2 — `supporting-platform`

**Purpose**: Harden and extend the core — real access control, bulk data loading, and the
Should-priority refinements.

### Scope

| Layer | Contents |
|---|---|
| **Domain components** | **C-09 Authorization** (full RBAC and org-scope enforcement, replacing the Unit 1 stand-in) · C-10 Import |
| **Services** | S-02 AccessControlService (full implementation) · S-09 ImportService |
| **Data access** | C-11 extensions — scope-filter application inside queries, import transaction handling |
| **Route layer** | C-12 endpoints for import and account-member linkage |
| **Frontend** | F-07 import |
| **Extensions to Unit 1** | Should-priority additions to existing screens: contract-expiry flags, project role on assignments, member timeline, bench list, over-allocated list |

### Database entities owned

**CORRECTED 2026-07-26 at Unit 2 Functional Design (Q1:A)**: ~~`RolePermission` (configuration)~~ →
**Unit 2 owns NO database entity and requires NO migration.** The role→permission matrix is a code
constant (BR-R-14), and per Q10:A no `ImportRun` record is persisted. `001_initial_schema.ts` is
therefore the final Phase 1 schema.

Unit 2 **writes** Unit 1's entities through Unit 1's published
interfaces; it does not own them.

### Interfaces consumed from Unit 1

`IMemberComponent` · `IProjectComponent` · `IOrgUnitComponent` · `IReferenceDataComponent`

### Interfaces published

`IAuthorizationComponent` — the real implementation, replacing Unit 1's stand-in.

### Stories

**11 stories outstanding — 6 Must, 5 Should** (corrected 2026-07-26, Q15:A). Full list in
`unit-of-work-story-map.md`.

Originally 13. **US-ASN-04 and US-VIS-05 were completed during Unit 1** and are credited there. Of the
5 remaining Should stories, three (US-VIS-06, US-VIS-07, US-MEM-06) already have tested backend
endpoints and need **frontend only**. Unit 2's genuine design burden is authorization and import.

### Independently demonstrable

**No, and by design.** Unit 2 has no standalone user journey; it hardens and extends Unit 1. Its
completion is demonstrated by behavior *change* in Unit 1's screens: a Team Lead who previously saw all
org units now sees only their own, and an Admin can now populate the system from a spreadsheet.

### R2 folded-in NFR obligations addressed by this unit's Functional Design

4. Server-side authorization enforcement points (US-ENB-01, FR-R-08)
5. Client-agnostic API boundary (US-ENB-04, NFR-IN-03) — verification that Unit 2's endpoints uphold the invariant Unit 1 established

---

## Code Organization Strategy

**Project type**: Greenfield, multi-unit, single-deployable monolith.
**Pattern applied**: layer-first, unit-second (Q4:A) — an adaptation of the AI-DLC greenfield multi-unit
monolith pattern (`src/{unit-name}/`, `tests/{unit-name}/`), extended to accommodate the
backend/frontend split that the base pattern does not address.

**Application code lives at the workspace root. Never in `aidlc-docs/`.**

```
chaos-manager/                          <- workspace root
|
+-- backend/
|   +-- package.json                    Node.js/TypeScript toolchain
|   +-- tsconfig.json
|   +-- src/
|   |   +-- shared/                     Q8:A - shared, owned by neither unit
|   |   |   +-- types/                  MemberId, DateRange, Percentage, AccessScope, ...
|   |   |   +-- repository/             repository base, scope-filter application
|   |   |   +-- errors/
|   |   |   +-- config/
|   |   +-- core-domain/                UNIT 1
|   |   |   +-- member/
|   |   |   +-- project/
|   |   |   +-- assignment/
|   |   |   +-- allocation/             C-04 - highest-risk code
|   |   |   +-- org-unit/
|   |   |   +-- reference-data/
|   |   |   +-- identity/
|   |   |   +-- session/
|   |   |   +-- authorization-standin/  X-1 - replaced by Unit 2
|   |   |   +-- routes/
|   |   +-- supporting-platform/        UNIT 2
|   |       +-- authorization/          C-09 - replaces the stand-in
|   |       +-- import/
|   |       +-- routes/
|   +-- tests/
|   |   +-- core-domain/
|   |   +-- supporting-platform/
|   +-- migrations/                     one shared schema, ordered files
|
+-- frontend/
|   +-- package.json                    React toolchain
|   +-- src/
|       +-- shared/                     API client, session context, date-range control,
|       |                               percentage input, allocation bar, empty/error states
|       +-- core-domain/                UNIT 1
|       |   +-- auth/
|       |   +-- members/
|       |   +-- projects/
|       |   +-- assignments/
|       |   +-- views/
|       |   +-- admin/
|       +-- supporting-platform/        UNIT 2
|           +-- import/
|
+-- docker/
+-- docker-compose.yml                  on-premises deployment, NFR-T-01
+-- README.md
+-- aidlc-docs/                         DOCUMENTATION ONLY - no application code
```

### Rationale

- **Two `package.json` files** keep the Node and React toolchains independent, each with its own dependency tree and build. A single root manifest would couple them unnecessarily.
- **`shared/` in both trees** implements Q8:A — types and cross-cutting utilities belong to neither unit, so neither unit's changes make the other's work a modification of foreign code.
- **`authorization-standin/` is a named directory, not an inline shortcut.** Making the stand-in a visible module means Unit 2's replacement is a deliberate deletion rather than an archaeological hunt through Unit 1 code.
- **`migrations/` holds one ordered set** — the schema spans both units (Unit 2's import writes Unit 1's entities), so per-unit schemas would be a fiction.
- **Frontend feature folders sit under their unit** rather than at `src/` root, preserving the unit boundary while keeping the Application Design F-01…F-08 feature-folder structure intact inside each.

---

## Corrections to Application Design

Two inconsistencies in `application-design/components.md` and `component-dependency.md` §5 surfaced while
assigning every component and story to exactly one unit. Both are corrected here.

| # | Application Design said | Corrected to | Why |
|---|---|---|---|
| **1** | F-06 `admin` frontend → Unit 2 | **F-06 → Unit 1** | Its backend counterparts (C-05 OrgUnit, C-06 ReferenceData, S-07, S-08) are all in Unit 1. Leaving the UI in Unit 2 would split stories US-ADM-01, US-ADM-02, and US-ADM-03 across both units, violating both the full-stack-unit property established at CQ1:A and the requirement that every story be assigned exactly once. Reference data is also a Wave 2 prerequisite for nearly everything downstream. |
| **2** | Unit 2 "also carries US-ENB-03 and US-ENB-04 completion" | **US-ENB-03 and US-ENB-04 → Unit 1** | Both are properties created when Unit 1 is built: US-ENB-03 is the C-07/C-08 separation, and US-ENB-04 is the layering invariant established with Unit 1's first endpoint. Assigning them to Unit 2 would mean an unowned property during Unit 1. Unit 2 must **uphold** both, which is recorded as a Unit 2 Functional Design obligation rather than as story ownership. |

Neither correction changes the unit count, the seam, or the Slice 1 contents.

---

## Corrections to Story and Requirement Counts

Re-derivation during story assignment found arithmetic errors in previously approved artifacts. The
underlying story and requirement *content* was correct and unchanged; only the stated totals were wrong.

| Figure | Was stated | Actual | Corrected in |
|---|---|---|---|
| Total stories | 42 | **43** | `stories.md`, `aidlc-state.md`, `execution-plan.md`, `application-design.md`, `application-design-plan.md`, `unit-of-work-plan.md` |
| Must-priority stories | 33 | **35** | `stories.md` §9.2, `execution-plan.md` |
| Should-priority stories | 9 | **8** | `stories.md` §9.2 |
| Total functional requirements | 55 | **59** (49 Must, 9 Should, 1 N/A) | `execution-plan.md`, `user-stories-assessment.md` |
| Must-priority FRs covered | 44 | **49** | `stories.md` §10, `execution-plan.md` |

No requirement or story was added, removed, or changed. Coverage remains complete: all 49 Must-priority
FRs map to stories, and 8 of 9 Should-priority FRs do, the exception being **FR-C-05** which is a
structural design constraint with no user-facing behavior and is carried to Functional Design.

---

## Validation

| Check | Result |
|---|---|
| Unit count within R1 cap of 3 | **Pass** — 2 units |
| Every component assigned to exactly one unit | **Pass** — C-01…C-12 and F-01…F-08 all assigned |
| Every service assigned to exactly one unit | **Pass** — S-01…S-09 all assigned |
| All 43 stories assigned exactly once | **Pass** — 30 + 13 = 43; verified in `unit-of-work-story-map.md` |
| Slice 1 within a single unit | **Pass** — all six in `core-domain` |
| No circular dependencies between units | **Pass** — see `unit-of-work-dependency.md` |
| Each unit independently buildable | **Pass** — Unit 1 via the stand-in; Unit 2 against completed Unit 1 interfaces |
| Each unit independently demonstrable | **Unit 1 yes; Unit 2 no, by design** — stated explicitly above rather than glossed |
| Unit names domain-neutral (FR-C-01) | **Pass** — `core-domain` and `supporting-platform` carry no team-type vocabulary |
| Six R2 NFR obligations assigned to a unit | **Pass** — obligations 1, 2, 3, 6 to Unit 1; obligations 4, 5 to Unit 2 |
| Application code paths outside `aidlc-docs/` | **Pass** — all under `backend/`, `frontend/`, `docker/` at workspace root |
