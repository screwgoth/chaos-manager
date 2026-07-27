# Functional Design Plan — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION
**Unit**: `core-domain` (Unit 1 of 2)
**Stage**: Functional Design
**Date**: 2026-07-25
**Status**: All 14 answers received 2026-07-25T11:35:00Z; Step 5 analysis found no ambiguities. Generation COMPLETE — all checklist steps [x].

## Resolved Decisions

Q1=B append-only history table (closes OD-02) · Q2=C mutate in place + history record (makes the model bi-temporal) · Q3=C decimal to one place 0.1-100.0 · Q4=B multiple concurrent assignments to one project permitted · Q5=A auto-end open assignments on deactivate/close · Q6=A transactional check-then-write with row-level member lock · Q7=A application-side computation over fetched rows · Q8=A server-side session records with opaque token · Q9=B sliding 30-minute inactivity window · Q10=A Argon2id · Q11=A reserved attributes column (discharges FR-C-05) · Q12=A structured violations array · Q13=A server-state library + local form state + session context · Q14=A blocking modal for over-allocation

## Unit Context

| Attribute | Value |
|---|---|
| **Stories** | 30 (29 Must, 1 Should) — see `unit-of-work-story-map.md` |
| **Contains Slice 1** | Yes — all six stories |
| **Components** | C-01 Member · C-02 Project · C-03 Assignment · **C-04 Allocation** · C-05 OrgUnit · C-06 ReferenceData · C-07 Identity · C-08 Session · C-11 repositories · C-12 routes · plus a permissive authorization stand-in |
| **Services** | S-01 Auth · S-03 Member · S-04 Project · S-05 Assignment · S-06 AllocationQuery · S-07 ReferenceData · S-08 OrgUnit |
| **Frontend** | F-01 auth · F-02 members · F-03 projects · F-04 assignments · F-05 views · F-06 admin · F-08 shared |
| **Entities owned** | Member · MemberSkill · Project · Assignment · OrgUnit · ReferenceDataEntry · UserAccount · Session |
| **Depends on** | Unit 2 for the real `IAuthorizationComponent` (X-1 — stand-in used here) |

**Scope of this stage**: detailed business logic, domain models, business rules, and validation —
**technology-agnostic**. Database technology (OD-01) and framework selection (OD-03) are decided at NFR
Requirements, which runs *after* this stage. Questions below are therefore framed as design intent, not
technology picks.

## Obligations this stage must discharge

| ID | Obligation | Source |
|---|---|---|
| **OD-02** | Allocation history modeling — date-ranged rows only, or rows plus a history table | Open decision |
| **FR-C-05** | Data model must permit Phase 2 custom fields without restructuring core entities | Uncovered Should requirement, no story |
| **R2-1** | Data access strategy and the allocation-persistence boundary | NFR Design fold |
| **R2-2** | Session handling design | NFR Design fold |
| **R2-3** | Replaceable authentication boundary (US-ENB-03) | NFR Design fold |
| **R2-6** | Performance approach for allocation and availability queries against NFR-S-03 | NFR Design fold |
| **X-1** | `IAuthorizationComponent` interface must be complete and stable despite only a stand-in implementing it | Cross-unit dependency |
| — | Over-allocation concurrency semantics for the check-then-write window | Application Design carry-forward |

---

# Section A — Design Questions

Please answer with the letter after each `[Answer]:` tag.

## Question 1 — Allocation history modeling (closes OD-02)
US-ASN-07 requires allocation to be reconstructible as of any past date. How should that work?

A) **Date-ranged rows only** (recommended) — an assignment row carries its own start and end date, and "as of date X" is a query filtering rows whose range contains X. No separate history table. Simple, and correct as long as edits are handled per Question 2.

B) **Rows plus an append-only history table** — every change to an assignment writes a history record; as-of queries read history. Fully accurate reconstruction of what the record looked like at any past moment, at roughly double the write complexity.

C) **Event-sourced assignments** — the assignment is a fold over an event log. Maximum fidelity, substantially more machinery than a 200-member tool needs.

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 2 — What happens when an assignment is edited
This interacts directly with Question 1 and is the subtlest decision in the unit. If a manager changes an assignment's percentage from 50% to 80% today, what should "allocation as of last month" report?

A) **Mutate in place** — the row is updated. As-of queries for past dates then report the *new* percentage, because the old value no longer exists. Simplest, but "what was Priya allocated in March?" answers with today's number, not March's.

B) **Close and re-open** (recommended if Q1:A) — editing an assignment ends the existing row at the edit date and creates a new row from that date forward with the new values. History is preserved using only date-ranged rows, and as-of queries are automatically correct. Costs one extra row per edit and makes "one assignment" a chain of rows.

C) **Mutate in place, with a history table recording the previous values** — requires Q1:B.

D) **Mutate in place and accept that as-of queries reflect current values** — explicitly narrow US-ASN-07 to "which assignments existed and overlapped that date", not "what were their values then".

X) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 3 — Allocation percentage rules
FR-A-01 and AS-01 fix capacity at 100% per member. What constrains a single assignment's percentage?

A) **Integers 1–100** (recommended) — whole percentages only; a single assignment cannot exceed a member's full capacity, though several together can (which is what triggers the over-allocation warning)

B) **Integers 1–100, but a single assignment may exceed 100** — allows recording a deliberately over-committed single engagement

C) **Decimals allowed to one place, 0.1–100** — supports fine-grained splits like 12.5%

D) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 4 — Multiple assignments to the same project
Can one member hold two concurrent assignments to the same project?

A) **No — one active assignment per member-project pair at a time** (recommended) — a second overlapping assignment to the same project is rejected as a duplicate; changing the allocation means editing the existing assignment. Cleaner data, and it makes project staffing views unambiguous.

B) **Yes** — a member may hold several concurrent assignments to one project, summing together

C) **No, but allow it if the date ranges do not overlap** — sequential re-engagement on the same project is fine, concurrent is not

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 5 — Deactivating a member or closing a project with active assignments
US-MEM-05 and US-PRJ-02 preserve history, but what happens to assignments that extend into the future?

A) **Auto-end open assignments at the deactivation or closure date** (recommended) — the member's or project's future allocation is released, and the elapsed portion stays in history. The user is told how many assignments were ended.

B) **Leave assignments untouched** — they remain and continue to consume allocation even though the member is inactive, until someone ends them manually

C) **Refuse the deactivation or closure until assignments are ended manually** — forces explicit handling, at the cost of a blocking error

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6 — Over-allocation concurrency (Application Design carry-forward)
Two managers assigning the same member simultaneously could each pass the over-allocation check and both write, producing an unflagged over-allocation.

A) **Transactional check-then-write with row-level locking on the member** (recommended) — the second writer waits, re-checks, and gets the warning. Correct, and the contention cost is irrelevant at this scale.

B) **Optimistic concurrency with a version column on the member** — the second writer is rejected and retries

C) **Accept the race** — over-allocation is a warning rather than a hard rule, and the over-allocated list (US-VIS-07) will surface the result anyway

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 7 — Allocation computation strategy (discharges R2-1 and R2-6)
Q2:A of Application Design fixed that the *rules* live in C-04. Where does the *computation* happen?

A) **Fetch overlapping assignment rows, compute segments in application code** (recommended) — C-04 receives rows from the repository and does the segmentation and summation in TypeScript. Easiest to reason about and to verify by hand, which matters with no automated test suite. At 200 members and 50 projects the row counts are trivial.

B) **Push aggregation into the database** — SQL computes totals per member per period; C-04 interprets results. Faster at scale, splits the logic across two languages.

C) **Application-side computation now, with a documented path to SQL aggregation if performance requires it** — same as A plus a written escape hatch

D) **Maintain a denormalized allocation-by-period table updated on every assignment write** — fastest reads, adds a consistency burden

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 8 — Session handling (discharges R2-2)
C-08 owns session lifecycle. What shape should a session take?

A) **Server-side session records with an opaque session id in an HTTP-only cookie** (recommended) — sessions are rows the server owns, so sign-out and forced expiry actually terminate access; supports `terminateAllForUser`. Requires a session store.

B) **Stateless signed token (JWT) in an HTTP-only cookie** — no session store, but genuine sign-out and forced termination need a revocation list, which re-introduces state

C) **Server-side sessions in memory** — simplest, but every restart signs everyone out and it precludes running more than one instance

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 9 — Session expiry behaviour
FR-AU-04 requires expiry after inactivity. What exactly?

A) **Sliding inactivity window, configurable, defaulting to 8 hours** (recommended for a business-hours internal tool) — activity extends the session; a full working day without re-authenticating

B) **Sliding inactivity window defaulting to 30 minutes** — tighter, more re-authentication

C) **Absolute lifetime regardless of activity** — the session dies at a fixed age

D) **Sliding window plus an absolute maximum lifetime** — both

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 10 — Password hashing (US-ENB-02)
FR-AU-02 mandates salted hashes from a current algorithm. Which family?

A) **Argon2id** (recommended) — current best-practice memory-hard algorithm, winner of the Password Hashing Competition

B) **bcrypt** — older but extremely well-understood and widely available; adequate

C) **scrypt** — memory-hard, available in the Node standard library with no extra dependency

D) **No preference — pick one and record the rationale**

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 11 — Phase 2 custom fields extension point (discharges FR-C-05)
The model must permit admin-defined custom fields later without restructuring core entities.

A) **Reserve a schema-less attributes column on Member and Project now, unused in Phase 1** (recommended) — a single JSON-typed column per entity plus a documented convention. Phase 2 adds field definitions and validation on top; no core table changes needed.

B) **Design the full field-definition tables now but build no UI or validation** — more forward work, less Phase 2 risk

C) **Document the intended approach only, add nothing to the schema** — a migration adds the column in Phase 2

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 12 — Validation error response shape
Six stories require field-level feedback with all reasons reported, not just the first (US-MEM-07, US-PRJ-05, US-ASN-06 in this unit).

A) **A structured error object with a list of field-level violations** (recommended) — `{ code, message, violations: [{ field, rule, detail }] }`, so the frontend can place each message next to its input and the same payload serves any client

B) **A flat list of human-readable messages** — simpler, but the frontend cannot attach messages to specific fields

C) **First error only** — contradicts the "all reasons" acceptance criteria; listed for completeness

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 13 — Frontend state management (for `frontend-components.md`)
F-01 through F-08 need a state approach.

A) **Server-state library for data fetching and caching, plus React local state for forms** (recommended) — e.g. TanStack Query for reads and mutations, `useState`/`useReducer` for form state, a small context for the session. No global store; allocation data is server-owned and benefits from cache invalidation on mutation.

B) **Global client store (Redux Toolkit or Zustand) holding fetched data** — one place for everything, more boilerplate, and cache staleness becomes your problem

C) **Plain `fetch` in `useEffect` with local state only** — no dependencies, most hand-written glue

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 14 — Over-allocation warning interaction (F-04)
US-ASN-05 is a two-step confirm. How should it appear?

A) **Blocking modal naming the member, the specific over-allocated sub-period, and the resulting total, with Proceed and Cancel** (recommended) — matches the acceptance criteria directly and makes the override deliberate

B) **Inline warning banner above the form's submit control, requiring a second click to confirm**

C) **Inline warning plus an explicit "allow over-allocation" checkbox the user must tick before saving**

D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

# Section B — Mandatory Artifacts

- [x] Generate `aidlc-docs/construction/core-domain/functional-design/domain-entities.md`
- [x] Generate `aidlc-docs/construction/core-domain/functional-design/business-logic-model.md`
- [x] Generate `aidlc-docs/construction/core-domain/functional-design/business-rules.md`
- [x] Generate `aidlc-docs/construction/core-domain/functional-design/frontend-components.md` (unit includes frontend)

---

# Section C — Execution Checklist

## C.1 — Preparation
- [x] Re-read `unit-of-work.md` Unit 1 scope and `unit-of-work-story-map.md` Unit 1 stories
- [x] Re-read `application-design/component-methods.md` for the established signatures
- [x] Re-read the 30 Unit 1 stories' Given/When/Then criteria — they are the behavioural specification
- [x] Confirm the Section A answers and restate the decisions
- [x] Confirm no extension rules apply (all three disabled)

## C.2 — Domain entities
- [x] Define each entity: attributes, types, optionality, defaults
- [x] Define entity relationships and cardinalities
- [x] Define identity and natural keys used for duplicate detection
- [x] Define lifecycle states and permitted transitions for Member, Project, Assignment
- [x] Apply the OD-02 and Question 2 decisions to the Assignment entity
- [x] Apply the FR-C-05 extension point per Question 11
- [x] Verify all entity and attribute names are domain-neutral (FR-C-01)
- [x] Write `domain-entities.md`

## C.3 — Business logic model
- [x] Model the allocation algorithm in full: overlap detection, range segmentation, summation, availability inversion
- [x] Model over-allocation detection including sub-period identification
- [x] Model the assignment create and edit workflows including the two-step override
- [x] Model the as-of-date historical reconstruction query
- [x] Model authentication and session establishment, keeping the C-07/C-08 boundary separable (R2-3)
- [x] Document the data access strategy and allocation-persistence boundary (R2-1)
- [x] Document the performance approach against NFR-S-03 (R2-6)
- [x] Document session handling design (R2-2)
- [x] Specify the complete, stable `IAuthorizationComponent` interface and the permissive stand-in's exact behaviour (X-1)
- [x] Write `business-logic-model.md`

## C.4 — Business rules
- [x] Enumerate validation rules per entity with their error conditions
- [x] Enumerate cross-entity constraints: contract windows, member active periods, project open state
- [x] Enumerate allocation and over-allocation rules
- [x] Enumerate reference data and org unit integrity rules
- [x] Enumerate deactivation and closure cascade rules per Question 5
- [x] Define the concurrency rule for the check-then-write window per Question 6
- [x] Define the validation error shape per Question 12
- [x] Trace every rule to the story or FR that requires it
- [x] Write `business-rules.md`

## C.5 — Frontend components
- [x] Define the component hierarchy per feature folder (F-01 to F-08)
- [x] Define props and state for each significant component
- [x] Define user interaction flows, including the over-allocation confirm per Question 14
- [x] Define form validation rules and how field-level errors are surfaced
- [x] Map each component to the API endpoints it consumes
- [x] Define the state management approach per Question 13
- [x] Specify `data-testid` naming convention for automation-friendly markup
- [x] Write `frontend-components.md`

## C.6 — Validation and completion
- [x] Verify every one of the 30 Unit 1 stories is addressed by entities, rules, or components
- [x] Verify all four assigned R2 obligations (R2-1, R2-2, R2-3, R2-6) are visibly discharged — if any is not, the R2 fold has failed and NFR Design must be reinstated
- [x] Verify OD-02 is closed and FR-C-05 has a designed extension point
- [x] Verify the design remains technology-agnostic — no database product, framework, or library mandated except where Section A explicitly chose one
- [x] Validate all content per `common/content-validation.md`
- [x] Mark all checkboxes in this plan `[x]`
- [x] Update `aidlc-docs/aidlc-state.md`
- [x] Log completion and approval prompt in `aidlc-docs/audit.md`
- [x] Present the standardized 2-option completion message
