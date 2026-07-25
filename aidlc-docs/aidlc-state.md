# AI-DLC State Tracking

## Project Information
- **Project Name**: chaos-manager (C.H.A.O.S — Centralized Hub for Aligning Organizational Squads)
- **Project Type**: Greenfield
- **Start Date**: 2026-07-25T08:32:00Z
- **Current Stage**: CONSTRUCTION - Unit 1 `core-domain` Code Generation (Part 1 plan complete, awaiting approval)

## Workspace State
- **Existing Code**: No
- **Programming Languages**: None found at detection; target stack Node.js/TypeScript + React
- **Build System**: None found
- **Project Structure**: Empty (documentation only at detection time)
- **Reverse Engineering Needed**: No
- **Workspace Root**: /home/raseel/code/github/screwgoth/chaos-manager

## Code Location Rules
- **Application Code**: Workspace root (NEVER in aidlc-docs/)
- **Documentation**: aidlc-docs/ only
- **Structure patterns**: See code-generation.md Critical Rules

## Extension Configuration
| Extension | Enabled | Decided At |
|---|---|---|
| Security Baseline | No | Requirements Analysis |
| Resiliency Baseline | No | Requirements Analysis |
| Property-Based Testing | No | Requirements Analysis |

**Note**: All three extensions disabled per user opt-in, confirmed at clarification Question 6 (A).
Full rule files NOT loaded — context saved. Per requirements NFR-SE-02, password hashing (FR-AU-02)
and server-side authorization enforcement (FR-R-08) are retained as mandatory *functional*
requirements independent of the disabled security extension.

## Execution Plan Summary
- **Total Stages**: 14 (4 completed, 2 skipped, 7 to execute, 1 placeholder)
- **Stages to Execute**: Application Design, Units Generation (max 3 units), Functional Design (per unit), NFR Requirements (per unit), Infrastructure Design (per unit), Code Generation (per unit), Build and Test
- **Stages to Skip**: Reverse Engineering — greenfield project, no existing code to analyze; NFR Design — folded into Functional Design per user direction (R2)
- **User Revisions**: R1 — Units Generation constrained to target 2 units, hard cap 3. R2 — NFR Design skipped, six obligations folded into Functional Design.
- **Estimated stage executions**: ≈11 at 2 units, ≈15 at 3 units (revised down from ≈23)
- **Risk Level**: Medium — temporal allocation logic is load-bearing and has no automated test suite (NFR-Q-01); RBAC lands in build Wave 5; adoption risk exceeds technical risk
- **Plan Document**: `aidlc-docs/inception/plans/execution-plan.md`

## Stage Progress

### 🔵 INCEPTION PHASE
- [x] Workspace Detection — COMPLETED 2026-07-25T08:33:00Z
- [x] Reverse Engineering — SKIPPED (greenfield project, no existing code)
- [x] Requirements Analysis — APPROVED 2026-07-25T09:20:00Z
- [x] User Stories — APPROVED 2026-07-25T10:00:00Z (43 stories, 5 personas)
- [x] Workflow Planning — APPROVED 2026-07-25T10:15:00Z with revisions R1 and R2
- [x] Application Design — APPROVED 2026-07-25T10:55:00Z (10 components, 9 services, 8 frontend folders, 2-unit seam)
- [x] Units Generation — APPROVED 2026-07-25T11:25:00Z (2 units, 43 stories mapped)

**🔵 INCEPTION PHASE COMPLETE** — all stages approved or deliberately skipped.

## Units of Work
| # | Unit name | Stories | Must | Should | Slice 1 | Demonstrable alone |
|---|---|---|---|---|---|---|
| 1 | `core-domain` | 30 | 29 | 1 | All 6 | Yes |
| 2 | `supporting-platform` | 13 | 6 | 7 | 0 | No — by design |

- **Deployment**: single deployable monolith; units are logical modules
- **Code layout**: `backend/src/{unit-name}/`, `backend/tests/{unit-name}/`, `frontend/src/{unit-name}/`, plus a `shared/` module in each tree
- **Build order**: sequential — `core-domain` then `supporting-platform`
- **Cross-unit dependencies**: X-1 (Unit 1 uses a permissive authorization stand-in that Unit 2 replaces), X-2 (Unit 2 import consumes Unit 1 interfaces), X-3 (one shared database schema)
- **⚠️ X-1 revisit trigger**: org-scope visibility is NOT enforced while `core-domain` is the only completed unit. Acceptable only under the single-track, no-external-users assumption (plan Q7:A). If pilot users get access before `supporting-platform` completes, switch to a restrictive stand-in or pull C-09 Authorization into Unit 1.

### 🟢 CONSTRUCTION PHASE — Unit 1: `core-domain`
- [x] Functional Design — APPROVED 2026-07-25T11:45:00Z (4 docs; R2 obligations 1, 2, 3, 6 discharged; OD-02 closed, FR-C-05 discharged)
- [x] NFR Requirements — APPROVED 2026-07-25T12:12:00Z (2 docs; OD-01 and OD-03 CLOSED)
- [ ] NFR Design — SKIPPED (R2)
- [x] Infrastructure Design — APPROVED 2026-07-25T12:35:00Z (3 docs incl. shared-infrastructure.md)
- [ ] Code Generation — Part 1 plan complete (26 steps), AWAITING PLAN APPROVAL before any code is written

### 🟢 CONSTRUCTION PHASE — Unit 2: `supporting-platform`
- [ ] Functional Design — EXECUTE (+ R2 folded-in obligations 4, 5)
- [ ] NFR Requirements — EXECUTE
- [ ] NFR Design — SKIPPED (R2)
- [ ] Infrastructure Design — EXECUTE
- [ ] Code Generation — EXECUTE

### 🟢 CONSTRUCTION PHASE — after all units
- [ ] Build and Test — EXECUTE (ALWAYS)

### 🟡 OPERATIONS PHASE
- [ ] Operations — PLACEHOLDER

## Open Decisions Carried Forward
| ID | Decision | Assigned To |
|---|---|---|
| ~~OD-01~~ | ~~Database technology~~ — **CLOSED 2026-07-25: PostgreSQL 16+** | Closed at core-domain NFR Requirements |
| ~~OD-02~~ | ~~Allocation history modeling~~ — **CLOSED 2026-07-25**: append-only `AssignmentHistory` snapshot table + mutate-in-place, yielding a bi-temporal model. As-of-date queries resolve against history, not current rows. | Closed at core-domain Functional Design |
| ~~OD-03~~ | ~~Node.js API framework and React tooling~~ — **CLOSED 2026-07-25: Fastify + Vite/React SPA** (Next.js selected then reverted at CQ1:A for conflicting with the single-Node-process and Fastify decisions) | Closed at core-domain NFR Requirements |
| ~~OD-04~~ | ~~Member capacity modeling~~ — **CLOSED 2026-07-25**: uniform 100%, part-time not modeled | Closed at User Stories planning |
| ~~FR-C-05~~ | ~~Phase 2 custom fields extension point~~ — **DISCHARGED 2026-07-25**: reserved schema-less `attributes` column on Member and Project, unused in Phase 1 (BR-C-09) | Closed at core-domain Functional Design |

**No open decisions remain.** All four (OD-01…OD-04) plus FR-C-05 are closed.

## Technology Stack (applies to both units)
PostgreSQL 16+ · Kysely (query builder, hand-written allocation SQL) · Kysely migrator · Fastify ·
Vite + React SPA · TanStack Query v5 · date-fns (date-only UTC convention) · Zod · Tailwind (hand-built) ·
Jest · Node 22 LTS + npm · TypeScript `strict` + `noUncheckedIndexedAccess` · Docker Compose (app + PostgreSQL)

## Current Status
- **Lifecycle Phase**: 🟢 CONSTRUCTION
- **Current Unit**: Unit 1 of 2 — `core-domain`
- **Current Stage**: Code Generation Part 2 (generation) — **PAUSED at user request 2026-07-25T21:34:00Z**
- **Completed for this unit**: Functional Design ✅ · NFR Requirements ✅ · Infrastructure Design ✅ · Code Generation Part 1 (plan approved) ✅
- **Working branch**: `aidlc/construction-core-domain` (created from `aidlc/inception-requirements`)
- **Code progress**: Steps 1-3 of 26 complete and verified · Step 4 PARTIAL (7 of 8 repositories)
- **Resume at**: `SessionRepository` (`backend/src/shared/repository/session-repository.ts`), then the `repository/index.ts` barrel, then Step 5 (repository unit tests). See `aidlc-docs/construction/plans/core-domain-code-generation-plan.md`.
- **Verification at pause**: `npx tsc --noEmit` clean · `npx jest` 27/27 passing (2 suites). Nothing claimed complete that was not run.
- **Next Stage**: finish Code Generation for `core-domain`, then the full Construction loop for `supporting-platform`, then Build and Test (once, after all units)
- **Outstanding risk carried forward**: X-1 — while `core-domain` is the only completed unit, org-scope visibility is NOT enforced (permissive authorization stand-in). Acceptable only under the single-track, no-external-users assumption; revisit when Unit 2 lands.

## Artifact Index
| Artifact | Path |
|---|---|
| Audit log | `aidlc-docs/audit.md` |
| Requirements | `aidlc-docs/inception/requirements/requirements.md` |
| Requirements questions | `aidlc-docs/inception/requirements/requirement-verification-questions.md` |
| Requirements clarifications | `aidlc-docs/inception/requirements/requirements-clarification-questions.md` |
| User stories assessment | `aidlc-docs/inception/plans/user-stories-assessment.md` |
| Story generation plan | `aidlc-docs/inception/plans/story-generation-plan.md` |
| User stories | `aidlc-docs/inception/user-stories/stories.md` |
| Personas | `aidlc-docs/inception/user-stories/personas.md` |
| Execution plan | `aidlc-docs/inception/plans/execution-plan.md` |
| Application design plan | `aidlc-docs/inception/plans/application-design-plan.md` |
| Application design clarifications | `aidlc-docs/inception/plans/application-design-clarification-questions.md` |
| Application design (consolidated) | `aidlc-docs/inception/application-design/application-design.md` |
| Components | `aidlc-docs/inception/application-design/components.md` |
| Component methods | `aidlc-docs/inception/application-design/component-methods.md` |
| Services | `aidlc-docs/inception/application-design/services.md` |
| Component dependencies | `aidlc-docs/inception/application-design/component-dependency.md` |
| Unit of work plan | `aidlc-docs/inception/plans/unit-of-work-plan.md` |
| Units of work | `aidlc-docs/inception/application-design/unit-of-work.md` |
| Unit dependencies | `aidlc-docs/inception/application-design/unit-of-work-dependency.md` |
| Unit-to-story map | `aidlc-docs/inception/application-design/unit-of-work-story-map.md` |
| `core-domain` FD plan | `aidlc-docs/construction/plans/core-domain-functional-design-plan.md` |
| `core-domain` domain entities | `aidlc-docs/construction/core-domain/functional-design/domain-entities.md` |
| `core-domain` business logic | `aidlc-docs/construction/core-domain/functional-design/business-logic-model.md` |
| `core-domain` business rules | `aidlc-docs/construction/core-domain/functional-design/business-rules.md` |
| `core-domain` frontend components | `aidlc-docs/construction/core-domain/functional-design/frontend-components.md` |
| `core-domain` NFR requirements plan | `aidlc-docs/construction/plans/core-domain-nfr-requirements-plan.md` |
| `core-domain` NFR clarifications | `aidlc-docs/construction/plans/core-domain-nfr-requirements-clarification-questions.md` |
| `core-domain` NFR requirements | `aidlc-docs/construction/core-domain/nfr-requirements/nfr-requirements.md` |
| `core-domain` tech stack decisions | `aidlc-docs/construction/core-domain/nfr-requirements/tech-stack-decisions.md` |
| `core-domain` infra design plan | `aidlc-docs/construction/plans/core-domain-infrastructure-design-plan.md` |
| `core-domain` infrastructure design | `aidlc-docs/construction/core-domain/infrastructure-design/infrastructure-design.md` |
| `core-domain` deployment architecture | `aidlc-docs/construction/core-domain/infrastructure-design/deployment-architecture.md` |
| Shared infrastructure (both units) | `aidlc-docs/construction/shared-infrastructure.md` |
| `core-domain` code generation plan | `aidlc-docs/construction/plans/core-domain-code-generation-plan.md` |
