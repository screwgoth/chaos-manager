# AI-DLC State Tracking

## Project Information
- **Project Name**: chaos-manager (C.H.A.O.S — Centralized Hub for Aligning Organizational Squads)
- **Project Type**: Greenfield
- **Start Date**: 2026-07-25T08:32:00Z
- **Current Stage**: CONSTRUCTION - Unit 1 `core-domain` Functional Design (planning, awaiting answers)

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
- [ ] Functional Design — IN PROGRESS, awaiting answers to `construction/plans/core-domain-functional-design-plan.md` (+ R2 folded-in obligations 1, 2, 3, 6)
- [ ] NFR Requirements — EXECUTE (closes OD-01, OD-03)
- [ ] NFR Design — SKIPPED (R2)
- [ ] Infrastructure Design — EXECUTE
- [ ] Code Generation — EXECUTE

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
| OD-01 | Database technology selection | NFR Requirements |
| OD-02 | Allocation history modeling (date-ranged rows only vs. rows plus history table) | Functional Design |
| OD-03 | Node.js API framework and React tooling selection | NFR Requirements |
| ~~OD-04~~ | ~~Member capacity modeling~~ — CLOSED 2026-07-25: uniform 100%, part-time not modeled | Closed at User Stories planning |
| FR-C-05 | Data model must permit Phase 2 custom fields — structural constraint with no user story | Functional Design |

## Current Status
- **Lifecycle Phase**: INCEPTION (final stage)
- **Current Stage**: Units Generation Complete
- **Next Stage**: CONSTRUCTION PHASE — Unit 1 `core-domain` Functional Design
- **Status**: Awaiting user approval of units

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
