# User Stories Assessment

**Project**: C.H.A.O.S (chaos-manager)
**Stage**: INCEPTION → User Stories, Part 1 Step 1 (mandatory assessment)
**Date**: 2026-07-25

## Request Analysis

- **Original Request**: Build a team management application tracking on-roll and off-roll members shuffling across multiple projects; agnostic to team type; enterprise-grade web application with enterprise features in later phases.
- **User Impact**: **Direct** — the entire product is a user-facing interface. Every Phase 1 requirement exists to answer a question a human asks.
- **Complexity Level**: **Complex** — 55 functional requirements across 9 groups, 5 role-based permission scopes, temporal allocation logic.
- **Stakeholders**: Admin, Resource/Delivery Manager, Team Lead/Line Manager, Team Member, Executive. Pilot department is IT & Engineering, with Sales and Ops as subsequent adopters.

## Assessment Criteria Met

- [x] **High Priority — New User Features**: The whole of Phase 1 is new functionality users interact with directly (member directory, project registry, assignment management, allocation views, availability search, CSV import).
- [x] **High Priority — Multi-Persona System**: Five roles with materially different permissions and goals (FR-R-01 through FR-R-07). An Executive's read-only cross-org dashboard need and a Team Member's "just show me my own assignments" need produce entirely different screens from the same data.
- [x] **High Priority — Complex Business Logic**: Allocation is temporal and additive. Over-allocation detection (FR-A-03 to FR-A-06) involves summing percentages across overlapping date ranges, warning rather than blocking, and keeping overrides visibly flagged. Availability (FR-V-02) is the inverse computation over a future window. These rules have multiple scenarios that stories make concrete and testable.
- [x] **High Priority — User Experience Changes**: Replaces an established spreadsheet workflow. Adoption depends on the new flow being faster than the spreadsheet it replaces — a UX risk, not a technical one.
- [x] **Medium Priority — Security/Permissions**: Org-scoped visibility (FR-R-07) means the same screen shows different data to different users. Stories are the clearest way to specify per-role expectations before implementation.
- [x] **Medium Priority — Testing**: The Phase 1 success criterion is behavioral ("a manager can answer 'who is available next month?' in under a minute"), which is a user-acceptance test, not a unit test.

## Benefits Expected

- Converts the behavioral success criterion into concrete, testable acceptance criteria
- Pins down per-role expectations for shared screens before code is written, reducing rework on the permission model
- Forces the ambiguous parts of allocation logic (partial capacity, overlapping ranges, override behavior) into explicit scenarios
- Provides the natural input for Units Generation — story groupings tend to map onto units of work
- Directly supports the thin-vertical-slice delivery approach (DA-01) by identifying which single story constitutes the first end-to-end thread
- Compensates for the disabled automated-test-suite requirement (NFR-Q-01) by at least making expected behavior explicit and reviewable

## Decision

**Execute User Stories**: **Yes**

**Reasoning**: This request meets four separate High Priority criteria, any one of which mandates
execution. It is a new, multi-persona, user-facing product with non-trivial temporal business rules
and a behaviorally-stated success criterion. Skipping stories would leave the allocation rules and
per-role screen expectations to be discovered during code generation, which is the most expensive
place to discover them. The overhead is clearly outweighed by the value.

## Expected Outcomes

- `stories.md` — user stories meeting INVEST criteria, each with acceptance criteria, organized per the breakdown approach selected in `story-generation-plan.md`
- `personas.md` — five user archetypes with goals, frustrations, and characteristics, mapped to their relevant stories
- A clearly identified first vertical slice story satisfying DA-02
- Resolution of open assumptions AS-01 (part-time capacity) and AS-02 (over-allocation override) through concrete scenarios
