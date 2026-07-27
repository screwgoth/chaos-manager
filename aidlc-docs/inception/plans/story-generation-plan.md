# Story Generation Plan

**Project**: C.H.A.O.S (chaos-manager)
**Stage**: INCEPTION → User Stories, Part 1 (Planning)
**Date**: 2026-07-25
**Status**: Part 1 approved 2026-07-25T09:50:00Z · Part 2 execution COMPLETE — all checklist steps [x]
**Input**: `aidlc-docs/inception/requirements/requirements.md` (approved 2026-07-25)

This document has two purposes:

1. **Section A** — 12 questions about *how* stories should be written. Please answer with the letter after each `[Answer]:` tag.
2. **Sections B–D** — the execution checklist I will follow in Part 2 (Generation) once you approve. Nothing in Part 2 runs until you approve this plan.

---

# Section A — Planning Questions

## Question 1 — Personas
The approved requirements name five roles (FR-R-01). Which should become documented personas in `personas.md`?

A) **All five** — Admin, Resource/Delivery Manager, Team Lead/Line Manager, Team Member, Executive

B) **Only the roles that actively drive Phase 1 workflows** — Resource/Delivery Manager, Team Lead, Team Member (Admin and Executive treated as thin variants)

C) All five, plus a **non-role persona** for the off-roll contractor as a *subject* of the system (someone tracked but who may never log in)

D) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 2 — Persona depth
How much detail should each persona carry?

A) **Lightweight** — name, role, one-line goal, permissions scope

B) **Standard** — name, role, responsibilities, goals, frustrations with the current spreadsheet process, key tasks, permission scope

C) **Rich** — everything in Standard plus technical comfort level, frequency of use, device context, and a short day-in-the-life narrative

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3 — Story breakdown approach
This is the most consequential answer in this document — it determines how `stories.md` is organized. Trade-offs are laid out in **Section B** below; please read it before answering.

A) **User Journey-Based** — stories follow end-to-end workflows ("staff a new project from scratch")

B) **Feature-Based** — stories grouped by system capability (member management, project management, assignment, views, import, admin)

C) **Persona-Based** — stories grouped by who performs them

D) **Domain-Based** — stories grouped by business domain (People, Projects, Allocation, Configuration, Access)

E) **Epic-Based** — hierarchical epics containing sub-stories

F) **Hybrid: Epic-Based outer structure with Domain-Based epics** (recommended) — epics map to business domains, stories sit inside them, and each story names its persona. This gives traceable groupings that Units Generation can consume directly, while keeping persona visibility.

G) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 4 — Story granularity
How large should a single story be?

A) **Fine-grained** — one story per discrete user action (create member, edit member, deactivate member as three stories). More stories, each trivially testable.

B) **Medium** — one story per coherent user capability (manage member records as one story with CRUD acceptance criteria). Fewer stories, each still small enough to build in a sitting.

C) **Coarse** — one story per feature area, with acceptance criteria carrying the detail. Fewest stories, largest each.

D) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 5 — Story format
What template should each story use?

A) **Classic** — "As a [persona], I want [capability], so that [benefit]"

B) **Classic plus context** — the above, plus a short description paragraph where the story needs explanation

C) **Job story** — "When [situation], I want to [motivation], so I can [expected outcome]"

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6 — Acceptance criteria format
How should acceptance criteria be written?

A) **Given/When/Then** (Gherkin style) — most precise, most verbose, directly translatable into tests later

B) **Checklist of verifiable statements** — concise bullets, each independently checkable

C) **Given/When/Then for complex rule-driven stories** (allocation, over-allocation, permissions) **and checklists for straightforward CRUD stories** — precision where it pays, brevity elsewhere

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 7 — Negative paths and edge cases
Requirements FR-A-04 to FR-A-06 and FR-I-02 imply error and warning behavior. How should these appear?

A) **Inside the parent story's acceptance criteria** — one story covers happy and unhappy paths

B) **As separate stories** — error handling and validation get their own stories

C) **Inside acceptance criteria, except where the negative path is itself a feature** (over-allocation warning and override, CSV row-level error reporting) which become their own stories

D) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 8 — Story identifiers and traceability
Should stories trace back to the approved functional requirements?

A) **Yes** — each story carries an ID (e.g. `US-ALLOC-01`) and lists the FR IDs it satisfies; a coverage table confirms every Must-priority FR maps to at least one story

B) **Yes, IDs only** — stories get IDs but no FR mapping

C) **No** — plain narrative stories, no identifiers

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 9 — Priority and the first vertical slice
Delivery approach DA-01 calls for a thin end-to-end vertical slice first. How should stories express priority?

A) **MoSCoW** (Must/Should/Could) per story, plus an explicitly flagged **Slice 1** set of stories forming the first end-to-end thread

B) **Sequenced list** — stories ordered in build sequence, no priority labels

C) **Both** — MoSCoW labels, a flagged Slice 1 set, and a suggested sequence for the remaining stories

D) Other (please describe after [Answer]: tag below)

[Answer]: Recommend best approach and use it.

## Question 10 — Resolving open assumptions through stories
The approved requirements carry two assumptions I made on your behalf. Should stories resolve them, or leave them for Functional Design?

- **AS-01 / OD-04**: is a part-time member's capacity modeled explicitly (a 60%-capacity member is fully booked at 60%), or is everyone assumed 100%?
- **AS-02**: over-allocation warns and permits override, rather than blocking.

A) **Write stories for both explicitly** — including a part-time capacity story and an over-allocation override story, treating my assumptions as confirmed

B) **Write the over-allocation override story; leave part-time capacity out of Phase 1** — assume everyone is 100% capacity

C) **Write both, but flag them as assumption-driven** so they get a second look at Functional Design

D) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 11 — Non-functional and admin stories
Should `stories.md` include stories for things without an obvious end-user narrative?

A) **Functional user stories only** — authentication, RBAC enforcement, reference-data administration, and CSV import all get stories since each has a real actor

B) **Functional stories plus explicit technical enabler stories** for cross-cutting concerns (e.g. "the API enforces org-scope on every read")

C) **Functional stories only, narrowly** — exclude authentication and admin configuration, treating them as implementation detail

D) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 12 — Team-type agnosticism validation
FR-C-06 requires Phase 1 to be demonstrably usable by a non-IT team. Should stories cover this?

A) **Yes** — include stories written from a Sales or Ops manager's perspective, exercising the same capabilities with different reference data, to prove the vocabulary and model hold up

B) **No** — one set of domain-neutral stories is sufficient; the neutrality is visible in the wording

C) **Partially** — one representative cross-domain story plus a documented review checklist confirming no story contains IT-specific vocabulary

D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

# Section A.1 — Resolved Methodology

Recorded from the answers above. This is the methodology Part 2 will follow.

| Decision | Answer | Resolution |
|---|---|---|
| Personas | Q1: B | Three full personas — Resource/Delivery Manager, Team Lead/Line Manager, Team Member. Admin and Executive documented as **thin variants** (role, goal, permission scope only). Both remain valid story actors. |
| Persona depth | Q2: A | Lightweight — name, role, one-line goal, permission scope. |
| Breakdown | Q3: B | **Feature-Based** — stories grouped by system capability: Members, Projects, Assignment, Views, Import, Administration, Access & Authentication. |
| Granularity | Q4: B | Medium — one story per coherent user capability, CRUD detail carried in acceptance criteria. |
| Story format | Q5: A | Classic — "As a [persona], I want [capability], so that [benefit]". No description paragraphs. |
| Acceptance criteria | Q6: A | **Given/When/Then** for every story, without exception. |
| Negative paths | Q7: B | Error handling and validation get **their own stories**, separate from the happy-path story. |
| Traceability | Q8: A | Story IDs (`US-<AREA>-nn`) plus FR ID mapping per story, plus a coverage table proving every Must-priority FR is covered. |
| Priority & slicing | Q9: delegated | **Option C selected** — see rationale below. |
| Open assumptions | Q10: B | Over-allocation override story included. **Part-time capacity excluded from Phase 1** — all members assumed 100% capacity. See consequence below. |
| Enabler stories | Q11: B | Functional stories plus explicit **technical enabler stories** for cross-cutting concerns. |
| Team-type validation | Q12: B | No Sales/Ops-perspective stories. Domain neutrality carried by wording alone. |

## Q9 Resolution — recommended approach selected

You delegated this one. I've selected **Option C: MoSCoW labels + flagged Slice 1 set + suggested
sequence for the remainder.**

Rationale: your delivery approach (DA-01) is a thin end-to-end vertical slice, which needs the Slice 1
flag to be actionable — without it, "build a vertical slice first" has no defined content. MoSCoW
labels are needed independently, because Phase 1 already contains Should-priority requirements
(FR-M-07, FR-A-09, FR-A-10, FR-V-05 to FR-V-07) that can be dropped under time pressure without
breaking the core. And the build sequence matters here specifically because Q7: B splits error-handling
into separate stories — those stories are meaningless before their happy-path counterpart exists, so
an explicit ordering prevents them being picked up out of order. Option A gives the first two but
leaves that ordering implicit; Option B gives ordering but loses the drop-safe distinction. C costs
one extra column and removes both risks.

## Q10 Consequence — requirements amendment required

Answer B resolves two open items in the approved requirements document, and one of them **narrows
approved scope**, so it is recorded here rather than applied silently:

- **AS-01** (part-time capacity) — now decided: all members are assumed to have 100% capacity in Phase 1. Part-time or fractional-capacity members are **not** modeled. A person working 60% of a full week will appear as fully available at 100% and can be booked to 100%; the system will not know the difference.
- **OD-04** (explicit capacity attribute vs. uniform 100%) — now closed rather than deferred to Functional Design: uniform 100%.

Both entries in `requirements.md` will be updated to reflect this decision, with a note pointing back
to this answer. **AS-02** (over-allocation warns with override) stands confirmed as originally written.

---

# Section B — Story Breakdown Approach Options

Reference material for Question 3. Each option is viable; they differ in what they optimize for.

## Option A — User Journey-Based
Stories follow end-to-end workflows: "staff a new project", "handle a contractor rolling off",
"rebalance an over-allocated engineer".

- **Benefits**: Excellent at exposing gaps between screens; naturally validates that the whole flow is faster than the spreadsheet; directly supports the vertical-slice approach.
- **Trade-offs**: Stories overlap heavily (many journeys touch the member directory), which violates INVEST *Independent*; harder to map onto units of work; risk of the same requirement appearing in several stories.

## Option B — Feature-Based
Stories grouped by capability: member management, project management, assignment, views, import,
administration.

- **Benefits**: Clean independence; maps almost one-to-one onto the requirements document; easy to estimate; obvious unit boundaries.
- **Trade-offs**: Loses the connective tissue between features; a set of individually-complete features can still add up to an awkward workflow; less useful for validating the success criterion.

## Option C — Persona-Based
Stories grouped by who performs them: everything the Resource Manager does, everything the Team
Member does, and so on.

- **Benefits**: Makes the permission model very concrete; each persona's world is reviewable in one place; good for spotting a role with too little or too much power.
- **Trade-offs**: Substantial duplication where roles share capabilities with different scopes; the same screen appears under three personas; poor mapping to units of work.

## Option D — Domain-Based
Stories grouped by business domain: People, Projects, Allocation, Configuration, Access.

- **Benefits**: Aligns with how the data model will actually be structured; stable groupings that survive scope changes; strong input to Units Generation; domain-neutral by construction, which serves FR-C-01.
- **Trade-offs**: Slightly abstract for non-technical stakeholders; workflow continuity is implicit rather than explicit.

## Option E — Epic-Based
Hierarchical epics containing sub-stories.

- **Benefits**: Scales to later phases cleanly — deferred capabilities become future epics; good for roadmap communication; familiar to most delivery tooling.
- **Trade-offs**: The hierarchy is only as good as the epic axis chosen, which this option leaves undecided; adds a layer of structure that a 200-user Phase 1 may not need.

## Option F — Hybrid: Epic-Based outer structure, Domain-Based epics (recommended)
Epics correspond to business domains (People, Projects, Allocation, Visibility, Configuration,
Access). Stories sit within epics. Each story names its persona and traces to functional requirement
IDs. Deferred Phase 2 capabilities are listed as named future epics without stories.

- **Why recommended here**: You get Domain-Based stability and unit-mapping, Persona-Based clarity through per-story persona attribution, and Epic-Based roadmap structure for the phased delivery you asked for — without the duplication that pure Journey or Persona breakdowns introduce. It also lets me flag a **Slice 1** cross-epic story set for DA-01 without reorganizing anything.
- **Trade-offs**: Workflow continuity still needs a deliberate check; I'd address that by adding a short user-journey walkthrough section to `stories.md` that references story IDs rather than restating them.

---

# Section C — Mandatory Story Artifacts

These are required regardless of the answers above.

- [x] Generate `stories.md` with user stories following INVEST criteria
- [x] Generate `personas.md` with user archetypes and characteristics
- [x] Ensure stories are Independent, Negotiable, Valuable, Estimable, Small, Testable
- [x] Include acceptance criteria for each story
- [x] Map personas to relevant user stories

---

# Section D — Part 2 Execution Checklist

This is what I will execute after you approve. Checkboxes are marked `[x]` as each step completes.

## D.1 — Preparation
- [x] Re-read approved `requirements.md` and extract all Must and Should priority functional requirements into a working coverage list
- [x] Confirm the answers from Section A and restate the chosen methodology at the top of `stories.md`
- [x] Confirm no extension rules apply (all three extensions disabled per `aidlc-state.md`)

## D.2 — Personas
- [x] Draft personas at the depth chosen in Q2, for the set chosen in Q1
- [x] For each persona: role, responsibilities, goals, current-process frustrations, permission scope per FR-R-02 to FR-R-07
- [x] Verify persona vocabulary is domain-neutral per FR-C-01 — no IT/Engineering-specific terms
- [x] Write `aidlc-docs/inception/user-stories/personas.md`

## D.3 — Story structure
- [x] Establish the grouping structure per the Q3 answer
- [x] Establish story ID scheme per the Q8 answer
- [x] Establish the story template per Q5 and the acceptance-criteria format per Q6

## D.4 — Story authoring
- [x] Author stories covering the People domain (FR-M-01 to FR-M-08)
- [x] Author stories covering the Projects domain (FR-P-01 to FR-P-06)
- [x] Author stories covering the Allocation domain (FR-A-01 to FR-A-10)
- [x] Author stories covering the Visibility domain (FR-V-01 to FR-V-07)
- [x] Author stories covering the Organizational model (FR-O-01 to FR-O-04)
- [x] Author stories covering Access control (FR-R-01 to FR-R-08)
- [x] Author stories covering Authentication (FR-AU-01 to FR-AU-05)
- [x] Author stories covering Reference data and team-type agnosticism (FR-C-01 to FR-C-06)
- [x] Author stories covering Data import (FR-I-01 to FR-I-04)
- [x] Handle negative paths and edge cases per the Q7 answer
- [x] Handle open assumptions AS-01 and AS-02 per the Q10 answer
- [x] Handle non-functional and enabler stories per the Q11 answer
- [x] Handle team-type agnosticism validation per the Q12 answer

## D.5 — Priority and slicing
- [x] Apply priority labels per the Q9 answer
- [x] Identify and flag the **Slice 1** story set satisfying DA-02 (create member → create project → assign with percentage and date range → view resulting allocation)
- [x] Confirm Slice 1 is genuinely end-to-end and independently demonstrable

## D.6 — Validation
- [x] Verify every story satisfies INVEST; note and justify any deliberate exception
- [x] Verify every story has acceptance criteria
- [x] Build the requirement coverage table and confirm every **Must** priority FR maps to at least one story
- [x] Confirm no story depends on a deferred Phase 2 capability
- [x] Confirm no story contains IT/Engineering-specific vocabulary (FR-C-01)
- [x] N/A — user-journey walkthrough section (applied only if Q3 answer were F; Q3 answer is B)
- [x] Verify the Feature-Based grouping has not left workflow gaps between feature areas
- [x] Map personas to stories

## D.7 — Completion
- [x] Write `aidlc-docs/inception/user-stories/stories.md`
- [x] Validate all content per `common/content-validation.md` before file creation
- [x] Mark all checkboxes in this plan `[x]`
- [x] Update `aidlc-docs/aidlc-state.md`
- [x] Log completion and approval prompt in `aidlc-docs/audit.md`
- [x] Present the completion message and await approval
