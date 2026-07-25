# Application Design Plan

**Project**: C.H.A.O.S (chaos-manager)
**Stage**: INCEPTION → Application Design (Part 1: Planning)
**Date**: 2026-07-25
**Status**: Answers received; Q7 revised to A and Q8 resolved to C via clarification round 1; generation COMPLETE — all checklist steps [x]

**Resolved decisions**: Q1=A layered monolith · Q2=A single dedicated Allocation component · Q3=A one
service per domain area · Q4=A rules in domain and service layer only · Q5=A feature folders · Q6=A REST
per resource · **Q7=A** (originally B, revised at CQ1:A — Core Domain / Supporting Platform seam) ·
**Q8=C** (delegated, confirmed at CQ2:A) · Q9=B names/params/returns · Q10=A Mermaid with text alternative
**Input**: approved `requirements.md`, `stories.md`, `personas.md`, `execution-plan.md` (rev R1, R2)

**Purpose of this stage**: identify the main functional components, their responsibilities and method
signatures, the service layer that orchestrates them, and how they depend on one another. Detailed
business logic is *not* designed here — that happens in Functional Design, per unit.

**Section A** holds 10 questions. **Sections B–C** hold the execution checklist for the generation
part, which runs only after you approve.

---

# Section A — Design Questions

## Question 1 — Architectural style
What overall structure should the application take?

A) **Layered monolith** (recommended) — one deployable API with clear internal layers: HTTP/route layer → service layer → domain layer → data access layer. Simplest thing that satisfies a 200-member, on-premises, single-department Phase 1.

B) **Modular monolith with enforced module boundaries** — one deployable, but internally partitioned into modules (People, Projects, Allocation, Access, Configuration) that may only call each other through published interfaces. More discipline, more future optionality.

C) **Hexagonal / ports-and-adapters** — domain at the centre, all I/O behind ports. Strongest isolation of the allocation logic, most indirection.

D) **Separate services** — allocation as its own service, others in a second service.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2 — Where does allocation logic live?
Allocation summation over overlapping date ranges (FR-A-03), over-allocation detection (FR-A-04), and availability computation (FR-V-02) are the same arithmetic viewed three ways, and they are the highest-risk code in the project.

A) **A single dedicated Allocation component** (recommended) — one component owns all capacity arithmetic; assignment, views, and availability all call into it. One place to get right, one place to fix.

B) **Computed in the database** — SQL views or queries perform the summation; the application reads results.

C) **Distributed across the components that need it** — assignment logic warns, views compute their own totals.

D) **A dedicated component, with the database doing the heavy aggregation behind it** — component owns the rules, delegates set-based computation to SQL.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3 — Service layer shape
How should the service layer be organized?

A) **One service per domain area** (recommended) — MemberService, ProjectService, AssignmentService, AllocationQueryService, ReferenceDataService, ImportService, AuthService, AccessControlService. Route handlers stay thin and call exactly one service.

B) **One service per user story or use case** — finer-grained, each orchestrating a single operation.

C) **A single application service** — one facade over all domain operations.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4 — Where are business rules enforced?
Given US-ENB-01 requires server-side enforcement and US-ENB-04 requires a client-agnostic API:

A) **Domain and service layer only** — the API layer validates request shape and nothing more; all rules live behind it, so any client gets identical enforcement

B) **Service layer, with the route layer also performing permission checks** — defence in depth at the cost of two places to maintain

C) **Domain entities own their invariants; services orchestrate; routes translate** — richest domain model, most code

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5 — Frontend component organization
How should the React application be structured?

A) **Feature-folder structure** (recommended) — top-level folders per feature area (members, projects, assignments, views, admin, import), each holding its own components, hooks, and API calls, plus a shared folder for common UI

B) **Type-based structure** — components/, hooks/, pages/, services/ folders at the top level

C) **Route-driven structure** — folders mirror the URL structure

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6 — Frontend-to-backend contract
How should the frontend obtain data?

A) **REST endpoints per resource** (recommended) — members, projects, assignments, allocations, availability, reference data. Conventional, easy to consume from a later mobile client per US-ENB-04.

B) **REST plus purpose-built read endpoints for the heavy views** — resource endpoints for writes, plus dedicated endpoints for the allocation view, availability search, and timeline so the client never assembles them from multiple calls

C) **GraphQL** — single endpoint, client selects fields

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 7 — How are the two units expected to split?
Per revision R1, Units Generation targets 2 units (cap 3). Application Design should draw component boundaries that make that split clean. Which seam do you prefer?

A) **Core Domain / Supporting Platform** (recommended) — Unit 1: members, projects, assignments, allocation, views. Unit 2: authentication, access control, reference-data administration, import. Slice 1 sits almost entirely in Unit 1.

B) **Backend / Frontend** — Unit 1 is the whole API and database, Unit 2 is the whole React application

C) **Read / Write** — Unit 1 owns all mutation, Unit 2 owns all querying and views

D) **Let Units Generation decide** — Application Design stays neutral and does not favour a seam

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 8 — Reference data and extensibility
FR-C-02 requires roles, skills, project types, and org units to be admin-managed records. FR-C-05 requires the model to permit Phase 2 custom fields without restructuring.

A) **One generic reference-data component** handling all four types uniformly through a shared abstraction — least code, but weaker per-type validation

B) **Distinct components per reference type** sharing a common interface — org units in particular behave differently (hierarchy, referenced by visibility scope) and deserve their own component

C) **Generic component for roles, skills, and project types; a separate OrgUnit component** (recommended) — the three simple lookups share machinery, the hierarchical one that drives visibility scope does not

D) Other (please describe after [Answer]: tag below)

[Answer]: Recommend

## Question 9 — Method signature detail level
This stage produces `component-methods.md`. How much should signatures specify?

A) **Names and purpose only** — parameter and return detail deferred to Functional Design

B) **Names, parameters, and return types** (recommended) — enough to see the contracts and spot mismatches, without specifying implementation

C) **Full signatures plus error and exception behavior** — most precise, closest to a code skeleton

D) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 10 — Diagrams
`component-dependency.md` needs to show relationships and data flow.

A) **Mermaid diagrams** (recommended) — renders in most Markdown viewers; a text alternative is included regardless, per content-validation rules

B) **ASCII diagrams only** — maximum portability, less readable for graphs

C) **Both Mermaid and ASCII**

D) **Tables only, no diagrams**

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

# Section B — Mandatory Design Artifacts

Required regardless of answers above.

- [x] Generate `components.md` with component definitions and high-level responsibilities
- [x] Generate `component-methods.md` with method signatures (business rules detailed later in Functional Design)
- [x] Generate `services.md` with service definitions and orchestration patterns
- [x] Generate `component-dependency.md` with dependency relationships and communication patterns
- [x] Generate `application-design.md` consolidating the above into a single document
- [x] Validate design completeness and consistency

---

# Section C — Generation Execution Checklist

## C.1 — Preparation
- [x] Re-read approved `requirements.md`, `stories.md`, and `personas.md`
- [x] Restate the chosen architectural style and design decisions at the top of `application-design.md`
- [x] Confirm no extension rules apply (all three disabled per `aidlc-state.md`)
- [x] Note the six R2 folded-in NFR obligations as forward references to Functional Design, without designing them here

## C.2 — Component identification
- [x] Identify components covering the People domain (FR-M-01 to FR-M-08)
- [x] Identify components covering the Projects domain (FR-P-01 to FR-P-06)
- [x] Identify components covering Assignment and Allocation (FR-A-01 to FR-A-10)
- [x] Identify components covering Views and Availability (FR-V-01 to FR-V-07)
- [x] Identify components covering the Organizational model (FR-O-01 to FR-O-04)
- [x] Identify components covering Access control and Authentication (FR-R-01 to FR-R-08, FR-AU-01 to FR-AU-05)
- [x] Identify components covering Reference data (FR-C-01 to FR-C-06)
- [x] Identify components covering Data import (FR-I-01 to FR-I-04)
- [x] Identify frontend component areas per the Q5 answer
- [x] Record each component's responsibilities and interface
- [x] Verify every component name is domain-neutral per FR-C-01
- [x] Write `components.md`

## C.3 — Component methods
- [x] Define method signatures per component at the detail level chosen in Q9
- [x] State each method's high-level purpose and input/output types
- [x] Mark explicitly that detailed business rules are deferred to Functional Design
- [x] Write `component-methods.md`

## C.4 — Service layer
- [x] Define services per the Q3 answer
- [x] Define each service's responsibilities and the components it orchestrates
- [x] Define where business rules are enforced per the Q4 answer
- [x] Define the API contract shape per the Q6 answer
- [x] Write `services.md`

## C.5 — Dependencies
- [x] Build the component dependency matrix
- [x] Document communication patterns between components
- [x] Document data flow for the three highest-value paths: create assignment with over-allocation check, availability query over a future period, and CSV import with row-level errors
- [x] Produce diagrams per the Q10 answer, validated per `common/content-validation.md`, with text alternatives
- [x] Verify no circular dependencies exist
- [x] Write `component-dependency.md`

## C.6 — Unit seam preparation
- [x] Annotate each component with its expected unit per the Q7 answer
- [x] Verify the seam produces at most 3 units and that cross-seam dependencies are minimal and one-directional where possible
- [x] Confirm the Slice 1 story set falls within a single unit wherever possible

## C.7 — Validation and completion
- [x] Verify every Must-priority functional requirement maps to at least one component
- [x] Verify all 42 stories are supported by the component set
- [x] Verify no component name or method name contains team-type-specific vocabulary
- [x] Consolidate into `application-design.md`
- [x] Mark all checkboxes in this plan `[x]`
- [x] Update `aidlc-docs/aidlc-state.md`
- [x] Log completion and approval prompt in `aidlc-docs/audit.md`
- [x] Present the completion message and await approval
