# Application Design — C.H.A.O.S (Consolidated)

**Project**: chaos-manager
**Stage**: INCEPTION → Application Design
**Date**: 2026-07-25
**Status**: Awaiting approval

This document consolidates the Application Design artifacts. The detailed documents are:

| Document | Contents |
|---|---|
| [components.md](components.md) | Component definitions, responsibilities, interfaces, unit assignment |
| [component-methods.md](component-methods.md) | Method signatures with parameters and return types, shared types, REST endpoint table |
| [services.md](services.md) | Service definitions, layering contract, orchestration flows, service-to-component matrix |
| [component-dependency.md](component-dependency.md) | Dependency matrix, diagrams, communication patterns, three critical data flows, unit seam |

---

## 1. Design Decisions

| # | Decision | Choice | Source |
|---|---|---|---|
| 1 | Architectural style | Layered monolith — Route → Service → Domain → Repository | Q1:A |
| 2 | Allocation logic | Single dedicated Allocation component (C-04) | Q2:A |
| 3 | Service layer | One service per domain area (9 services) | Q3:A |
| 4 | Rule enforcement | Domain and service layer only; route layer validates shape | Q4:A |
| 5 | Frontend structure | Feature folders | Q5:A |
| 6 | API contract | REST endpoints per resource | Q6:A |
| 7 | Unit seam | Core Domain / Supporting Platform, both full-stack | Q7:B → revised to A at CQ1:A |
| 8 | Reference data | Generic component for roles/skills/project types; separate OrgUnit component | Q8 → C, confirmed CQ2:A |
| 9 | Signature detail | Names, parameters, return types | Q9:B |
| 10 | Diagrams | Mermaid with text alternative | Q10:A |

### Note on decision 7

Q7 originally selected a Backend/Frontend seam. Step 8 analysis found that this conflicted with DA-01,
DA-02, and the Slice 1 story set, because the AI-DLC per-unit loop completes each unit fully before the
next begins — meaning no screen would exist until Unit 2. Resolved at CQ1:A by returning to the Core
Domain / Supporting Platform seam, which keeps both units full-stack and Slice 1 intact.

---

## 2. Architecture at a Glance

```
+---------------------------------------------------------------+
|  FRONTEND - React, feature folders                            |
|  auth | members | projects | assignments | views | admin      |
|  import | shared (API client, session context, date controls) |
+---------------------------------------------------------------+
                            |
                            | JSON over HTTP, REST per resource
                            v
+---------------------------------------------------------------+
|  ROUTE LAYER (C-12)                                           |
|  Shape validation and session resolution ONLY                 |
|  No business rules, no permission decisions                   |
+---------------------------------------------------------------+
                            |
                            v
+---------------------------------------------------------------+
|  SERVICE LAYER - one service per domain area                  |
|  S-01 Auth        S-02 AccessControl   S-03 Member            |
|  S-04 Project     S-05 Assignment      S-06 AllocationQuery   |
|  S-07 ReferenceData  S-08 OrgUnit      S-09 Import            |
|  Orchestration, authorization, transaction boundaries         |
+---------------------------------------------------------------+
                            |
                            v
+---------------------------------------------------------------+
|  DOMAIN COMPONENTS - business rules and invariants            |
|  C-01 Member    C-02 Project     C-03 Assignment              |
|  C-04 ALLOCATION - all capacity arithmetic                    |
|  C-05 OrgUnit   C-06 ReferenceData                            |
|  C-07 Identity  C-08 Session     C-09 AUTHORIZATION           |
|  C-10 Import                                                  |
+---------------------------------------------------------------+
                            |
                            v
+---------------------------------------------------------------+
|  DATA ACCESS (C-11) - repositories, scope-filtered queries    |
|  Database - technology open (OD-01)                           |
+---------------------------------------------------------------+
```

---

## 3. Components

**10 domain components**, plus the repository layer and route layer:

| ID | Component | Core responsibility | Unit |
|---|---|---|---|
| C-01 | Member | Roster of people, on-roll and off-roll in one entity | 1 |
| C-02 | Project | Project registry and staffing presentation | 1 |
| C-03 | Assignment | Member-to-project links with percentage and date range | 1 |
| **C-04** | **Allocation** | **All capacity arithmetic — summation, over-allocation, availability** | 1 |
| C-05 | OrgUnit | Two-level org structure and scope boundaries | 1 |
| C-06 | ReferenceData | Roles, skills, project types as admin-managed lookups | 1 |
| C-07 | Identity | User accounts, credential verification, password hashing | 1 |
| C-08 | Session | Session lifecycle, independent of authentication method | 1 |
| **C-09** | **Authorization** | **All access decisions, enforced server-side** | 2 |
| C-10 | Import | CSV/Excel bulk load with per-row outcomes | 2 |
| C-11 | Repositories | Persistence with scope filters applied inside queries | 1, ext. 2 |
| C-12 | Route layer | HTTP translation, shape validation only | 1, ext. 2 |

**8 frontend feature folders**: auth, members, projects, assignments, views, admin, import, shared.

### The two load-bearing components

**C-04 Allocation** is the single owner of all capacity arithmetic. Total allocation on a date,
allocation profile over a range, over-allocation detection with **specific sub-period identification**,
availability search, bench, over-allocated list, and member timeline are all one body of logic exposed
seven ways. It holds no state and performs no writes, which makes it verifiable in isolation — important
because it is the highest-risk code in the project and Phase 1 has no automated test suite (NFR-Q-01).

**C-09 Authorization** is the single decision point for access. Every one of the nine services depends
on it; there is no data path that skips it. It never trusts a client-supplied role, scope, member id, or
org unit — all decisions derive from the server-resolved session, and the scope constraint it produces is
applied *inside* repository queries so out-of-scope rows are never fetched.

---

## 4. Services

Nine services, one per domain area. The layering invariant: **a route handler calls exactly one service
and never a domain component or repository directly.** This is what guarantees US-ENB-04 — a future
mobile client or integration reaches identical enforcement because enforcement sits below the route layer.

Every service method's first action is to obtain the `AccessScope` from the resolved session and derive a
`ScopeFilter`. See [services.md](services.md) for orchestration detail, including the eight-step
assignment-creation flow that handles over-allocation warning and override.

---

## 5. Critical Data Flows

Three paths are documented step-by-step in [component-dependency.md](component-dependency.md) §4:

1. **Create assignment with over-allocation detection** — the most involved path; includes the two-step warning/override interaction and the transaction boundary that prevents a concurrent write slipping between check and save
2. **Availability search over a future period** — the path that delivers the Phase 1 success criterion; range segmentation at every assignment boundary is the part that scales
3. **CSV import with row-level error reporting** — valid rows commit while invalid rows are reported individually with all reasons

---

## 6. Unit Seam

**2 units** (satisfying revision R1 without needing the third):

- **Unit 1 — Core Domain**: members, projects, assignments, allocation, org units, reference data, local authentication, sessions, and their screens. **Contains all six Slice 1 stories.**
- **Unit 2 — Supporting Platform**: full RBAC and org-scope enforcement, import, admin screens, and the Should-priority refinements.

**Two cross-seam dependencies**, both stated now rather than discovered later:

- **X-1**: Unit 1 services depend on Authorization (Unit 2). Unit 1 implements a **minimal permissive stand-in** behind the real interface — role resolution works, org-unit restriction does not. Unit 2 replaces it without changing callers. **Consequence: until Unit 2 completes, a Team Lead will see data beyond their org unit.** This is the same gap already documented as Wave 5 in `stories.md` §9.3.
- **X-2**: Import (Unit 2) depends on Member, Project, OrgUnit, ReferenceData (Unit 1). Forward-only; needs no stand-in.

---

## 7. Open Items Carried Forward

Application Design deliberately does not decide these.

| ID | Item | Resolved at |
|---|---|---|
| OD-01 | Database technology | NFR Requirements |
| OD-03 | Node.js API framework and React tooling | NFR Requirements |
| OD-02 | Allocation history modeling — date-ranged rows only, or rows plus a history table | Functional Design |
| FR-C-05 | Data model must permit Phase 2 custom fields without restructuring core entities | Functional Design |
| — | Over-allocation concurrency semantics: isolation level and locking for the check-then-write window | Functional Design |
| — | Whether allocation summation is computed application-side or partly pushed into SQL (Q2:A fixes only that the *rules* live in C-04) | Functional Design |
| — | Exact over-allocation override protocol: re-submit versus confirmation token | Functional Design |

### The six R2 folded-in NFR obligations

NFR Design was skipped at your direction, with its content folded into Functional Design. Application
Design has positioned each obligation but not designed it:

| Obligation | Positioned at |
|---|---|
| Data access strategy and the allocation-persistence boundary | C-04 ↔ C-11 relationship; `findOverlapping` is the pivotal query |
| Session handling design | C-08 SessionComponent, deliberately separate from C-07 |
| Replaceable authentication boundary (US-ENB-03) | C-07 separates credential verification from session establishment and identity resolution |
| Server-side authorization enforcement points (US-ENB-01, FR-R-08) | C-09 plus the `ScopeFilter` threading pattern into repository queries |
| Client-agnostic API boundary (US-ENB-04, NFR-IN-03) | The layering invariant in §4 — no rules above the service layer |
| Performance approach for allocation and availability against NFR-S-03 | Data flow §4.2; range segmentation is the scaling concern |

**All six are positioned. None is designed.** If Functional Design does not visibly address all six, the
R2 fold has failed and NFR Design should be reinstated.

---

## 8. Validation

| Check | Result |
|---|---|
| Every Must-priority FR maps to a component | **Pass** — see [components.md](components.md) §5 |
| All 43 stories supported by the component set | **Pass** — see [services.md](services.md) story coverage; US-ENB-02/03 are properties of C-07, US-ENB-04 of the layering contract |
| No circular dependencies | **Pass** — two near-cycles deliberately broken, documented in [component-dependency.md](component-dependency.md) §1 |
| Domain-neutral naming throughout (FR-C-01) | **Pass** — no component, entity, field, method, or endpoint name carries IT/Engineering-specific vocabulary. Member, Project, Assignment, OrgUnit, Role, Skill, ProjectType all apply unchanged to Sales or Ops. |
| Unit count within R1 cap of 3 | **Pass** — 2 units |
| Slice 1 within a single unit | **Pass** — all six Slice 1 stories in Unit 1 |
| Business rules absent from the route layer (Q4:A) | **Pass** by construction — stated as the layering invariant |
| Diagrams validated with text alternatives | **Pass** — Mermaid syntax uses alphanumeric node IDs and quoted labels; ASCII diagram in §2 uses only `+ - | ` characters with uniform line width; text alternative provided for the dependency diagram |
