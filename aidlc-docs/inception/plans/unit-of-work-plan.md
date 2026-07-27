# Unit of Work Plan

**Project**: C.H.A.O.S (chaos-manager)
**Stage**: INCEPTION → Units Generation (Part 1: Planning)
**Date**: 2026-07-25
**Status**: All 8 answers received 2026-07-25T11:05:00Z — Step 7 analysis found no ambiguities or contradictions. Part 1 APPROVED 2026-07-25T11:15:00Z. Part 2 Generation COMPLETE — all checklist steps [x].

## Resolved Decomposition Decisions

| Q | Answer | Decision |
|---|---|---|
| 1 | A | **2 units as designed** — Core Domain / Supporting Platform seam inherited from Application Design unchanged, with cross-seam dependencies X-1 and X-2 |
| 2 | A | Unit names **`core-domain`** and **`supporting-platform`** |
| 3 | A | **Single deployable monolith** — one Node.js API process plus one React build; units are logical modules |
| 4 | A | **Layer-first, unit-second** on disk — `backend/src/{unit-name}/`, `backend/tests/{unit-name}/`, `frontend/src/{unit-name}/`; separate `package.json` per toolchain |
| 5 | A | **Sequential build**, `core-domain` then `supporting-platform`; the 9-wave story order applies within units, not across them |
| 6 | A | **Permissive authorization stand-in** in Unit 1, replaced by the real implementation in Unit 2 |
| 7 | A | **Single developer / AI-assisted single track** — units are a sequencing device; no ownership boundaries designed |
| 8 | A | **Shared code in a separate `shared/` module** outside both units; database treated as **one shared schema with ordered migration files** |

**Consistency check**: Q6:A (permissive stand-in) and Q7:A (single track, no external users during Unit 1)
are mutually consistent — the visibility gap is acceptable precisely because no pilot user touches Unit 1.
This dependency between the two answers is recorded in `unit-of-work-dependency.md` so that if the delivery
model later changes to include pilot users before Unit 2 completes, the stand-in decision is revisited.
**Input**: approved `requirements.md`, `stories.md`, `application-design/*`, `execution-plan.md` (rev R1, R2)

## Starting Position

Application Design already established a **2-unit seam** at CQ1:A, and you constrained Units Generation
to **target 2, hard cap 3** at revision R1. So the decomposition question is largely settled — the units
below are inherited, not invented here:

| Unit | Scope |
|---|---|
| **Unit 1 — Core Domain** | Members, projects, assignments, allocation, org units, reference data, local authentication, sessions, and their screens. Contains all six Slice 1 stories. |
| **Unit 2 — Supporting Platform** | Full RBAC and org-scope enforcement, CSV import, admin screens, Should-priority refinements. |

What this stage still needs from you: **unit naming, code organization on disk, how the X-1 authorization
stand-in is handled, and whether the two units are built in sequence or in parallel.** Those are the
questions in Section A.

**Section A** holds 8 questions. **Sections B–C** hold the generation checklist, which runs only after you
approve.

---

# Section A — Decomposition Questions

## Question 1 — Confirm the unit count and boundary
Application Design proposed 2 units along a Core Domain / Supporting Platform seam, with two documented cross-seam dependencies (X-1 authorization stand-in, X-2 import depends on core entities).

A) **Confirm 2 units as designed** (recommended) — inherit the seam from Application Design unchanged

B) **Confirm 2 units but move Authorization into Unit 1** — eliminates the X-1 stand-in entirely by building real RBAC up front; Unit 2 becomes import plus admin screens plus refinements only

C) **Split into 3 units** — Unit 1 Slice 1 vertical thread, Unit 2 remaining core domain, Unit 3 supporting platform (still within the R1 cap)

D) **Collapse to a single unit** — treat the whole application as one unit of work with logical modules; the Construction per-unit loop then runs once

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2 — Unit names
Unit names become directory names and appear in every Construction-phase artifact path (`aidlc-docs/construction/{unit-name}/...`), so they are worth choosing deliberately.

A) **`core-domain` and `supporting-platform`** (recommended) — descriptive of scope, domain-neutral

B) **`unit-1-core` and `unit-2-platform`** — ordinal, makes build sequence obvious in file listings

C) **`allocation-core` and `access-and-data`** — names the primary capability of each

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3 — Deployment model
This determines the on-disk code structure per `code-generation.md`.

A) **Single deployable monolith** (recommended) — one Node.js API process plus one React build, with units as logical modules inside it. Matches the layered-monolith decision (Q1:A of Application Design), NFR-T-01 on-premises Docker, and the 200-member scale.

B) **Separate deployables per unit** — each unit is its own independently deployable service

C) **Single deployable, but structured so a unit could be extracted later** — monolith now, module boundaries strict enough to split if a later phase needs it

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4 — Code organization on disk
Given a single deployable (assuming Q3:A or C), the AI-DLC greenfield multi-unit monolith pattern is `src/{unit-name}/` and `tests/{unit-name}/`. But this application also splits backend from frontend, which that pattern does not address.

A) **Layer-first, unit-second** (recommended) — `backend/src/{unit-name}/…`, `backend/tests/{unit-name}/…`, `frontend/src/{unit-name}/…`. Keeps the Node and React toolchains cleanly separated, each with its own `package.json`, while preserving unit boundaries within each.

B) **Unit-first, layer-second** — `src/{unit-name}/backend/…`, `src/{unit-name}/frontend/…`. Puts everything for one unit in one place, at the cost of scattering the React build across unit folders.

C) **Strict AI-DLC pattern** — `src/{unit-name}/` and `tests/{unit-name}/` at the root, with frontend and backend intermingled inside each unit folder

D) **Feature-first, ignoring unit boundaries on disk** — units exist as a planning construct only; code is organized by feature area per the Application Design frontend structure

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5 — Build order: sequential or parallel
The AI-DLC Construction phase completes each unit fully — design and code — before starting the next. Your 9-wave story sequence in `stories.md` §9.3, however, interleaves them (RBAC at Wave 5 sits between core-domain waves).

A) **Sequential, Unit 1 then Unit 2** (recommended) — follow the standard AI-DLC per-unit loop. Unit 1 delivers a demonstrable application with a permissive authorization stand-in; Unit 2 hardens and extends it. Accepts that the 9-wave order is a guide within units, not across them.

B) **Sequential, but reorder so Unit 2's authorization work comes first** — build RBAC before the core domain, eliminating the stand-in but delaying anything demonstrable

C) **Parallel** — both units designed and built concurrently, departing from the standard per-unit loop

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6 — How to handle the X-1 authorization stand-in
Unit 1 services all depend on Authorization, which lives in Unit 2. Application Design proposed a minimal permissive stand-in behind the real interface. **Consequence as designed: until Unit 2 completes, a Team Lead sees data beyond their own org unit.**

A) **Permissive stand-in as designed** (recommended if Unit 1 stays internal) — role is resolved, org-unit restriction is not enforced. Simplest, but Unit 1 must not be exposed to users who shouldn't see all data.

B) **Restrictive stand-in** — the stand-in enforces org-unit scoping using a simple rule from the outset, and Unit 2 replaces it with the full role matrix. Slightly more work in Unit 1, no visibility gap at any point.

C) **Move Authorization into Unit 1** — same as Q1:B; no stand-in needed at all

D) **Permissive stand-in, but Unit 1 is explicitly not deployed to real users** — treat Unit 1 as a demonstration build only, gated behind Unit 2 completion before anyone outside the project team uses it

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 7 — Team alignment and ownership
Who will actually build this, and does the decomposition need to support parallel ownership?

A) **Single developer or AI-assisted single track** — units are purely a sequencing device; no ownership boundaries needed

B) **Two developers, one per unit** — units need clean ownership boundaries and a stable interface contract between them

C) **Small team working through the units together** — units sequence the work but everyone touches everything

D) **Not yet decided** — design for the single-track case and don't optimize for parallel ownership

X) Other (please describe after [Answer]: tag below)

[Answer]: A
 
## Question 8 — Shared code and the database schema
Both units touch shared concerns: the repository layer, shared TypeScript types, and one database schema.

A) **Shared code lives in a `shared/` or `common/` module outside both units** (recommended) — types, repository base, and cross-cutting utilities are shared explicitly rather than duplicated or owned by one unit

B) **Unit 1 owns all shared code; Unit 2 depends on it** — simpler ownership, but Unit 2 changes to shared code become Unit 1 modifications

C) **Duplicate what each unit needs** — maximum unit independence, accepted duplication

D) Other (please describe after [Answer]: tag below)

Additionally: the database schema spans both units (Unit 2's import writes Unit 1's entities). Migrations
will be treated as a **single shared schema with ordered migration files**, not per-unit schemas, unless
you say otherwise.

[Answer]: A

---

# Section B — Mandatory Unit Artifacts

Required regardless of answers above.

- [x] Generate `aidlc-docs/inception/application-design/unit-of-work.md` with unit definitions and responsibilities
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-dependency.md` with dependency matrix
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-story-map.md` mapping stories to units
- [x] Document code organization strategy in `unit-of-work.md` (greenfield — see `code-generation.md` structure patterns)
- [x] Validate unit boundaries and dependencies
- [x] Ensure all stories are assigned to units

---

# Section C — Generation Execution Checklist

## C.1 — Preparation
- [x] Re-read `application-design/components.md` and `component-dependency.md` §5 for the established seam
- [x] Re-read `stories.md` §9 for the Slice 1 set, MoSCoW priorities, and the 9-wave sequence
- [x] Confirm the answers from Section A and restate the decomposition decisions

## C.2 — Unit definitions
- [x] Define each unit: name, purpose, scope, and responsibilities
- [x] Assign every component (C-01 to C-12) and frontend feature folder (F-01 to F-08) to exactly one unit
- [x] Assign every service (S-01 to S-09) to exactly one unit
- [x] Record which database entities each unit owns
- [x] Record each unit's expected interfaces and contracts
- [x] Document the code organization strategy on disk per the Q3 and Q4 answers
- [x] Write `unit-of-work.md`

## C.3 — Dependencies
- [x] Build the unit dependency matrix
- [x] Document each cross-unit dependency, its direction, and how it is satisfied
- [x] Document the X-1 authorization stand-in resolution per the Q6 answer, including its consequence
- [x] Document the X-2 import dependency
- [x] Verify no circular dependencies between units
- [x] Determine and record the build sequence per the Q5 answer
- [x] Write `unit-of-work-dependency.md`

## C.4 — Story mapping
- [x] Assign all 43 stories to units
- [x] Verify every story is assigned exactly once, with no story unassigned and none duplicated
- [x] Confirm the Slice 1 set (US-ACC-01, US-ENB-02, US-MEM-01, US-PRJ-01, US-ASN-01, US-VIS-01) falls within a single unit
- [x] Record per-unit story counts by MoSCoW priority
- [x] Map the 9-wave build sequence onto the units and note where wave order and unit order diverge
- [x] Write `unit-of-work-story-map.md`

## C.5 — Validation
- [x] Verify unit count is within the R1 cap of 3
- [x] Verify every Must-priority functional requirement is covered by an assigned story
- [x] Verify each unit is independently buildable given its declared dependencies
- [x] Verify each unit is independently demonstrable, or state explicitly why it is not
- [x] Verify unit names are domain-neutral per FR-C-01
- [x] Confirm the six R2 folded-in NFR obligations are assigned to the unit whose Functional Design will address them

## C.6 — Completion
- [x] Validate all content per `common/content-validation.md` before file creation
- [x] Mark all checkboxes in this plan `[x]`
- [x] Update `aidlc-docs/aidlc-state.md` with the unit list and per-unit Construction stage tracking
- [x] Log completion and approval prompt in `aidlc-docs/audit.md`
- [x] Present the completion message and await approval
