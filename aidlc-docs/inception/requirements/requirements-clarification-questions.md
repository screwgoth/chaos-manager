# Requirements Clarification Questions

**Project**: C.H.A.O.S — Centralized Hub for Aligning Organizational Squads (chaos-manager)
**Stage**: INCEPTION → Requirements Analysis (clarification round 1)
**Source**: Analysis of answers in `requirement-verification-questions.md`

Your 24 answers are internally consistent on the big picture: a small-scale (≤200 members, ≤50
projects), single-department-first, on-premises, Node.js/TypeScript + React web application, built as
a thin vertical slice, whose Phase 1 job is allocation visibility. Six items need resolution before I
can write the requirements document — each one changes what gets built, not just how it's described.

Please answer with the letter after each `[Answer]:` tag.

---

## Contradiction 1: Contractor rates are in Phase 1, but data is classified low-sensitivity

You selected **Q2: H** — Vendor/contractor management including *contracts, rates, and contract end
dates* — as a Phase 1 capability. You also selected **Q14: A** — "Names, roles, skills, and
allocations only — low sensitivity" — and declined option **B** (contractor commercial data —
confidential). Contractor rates and contract values are commercial data; they are the single most
sensitive field in this system, and they are typically restricted to a much narrower audience than
allocation data.

### Clarification Question 1
How should contractor commercial data (rates, contract value, PO numbers) be handled in Phase 1?

A) Keep vendor/contractor management in Phase 1 but **exclude rates and commercial values** — track only vendor name, contract start/end dates, and contract status (this keeps Q14: A accurate)

B) Keep rates in Phase 1 and treat them as **confidential** — restricted to Admin and HR/Vendor Coordinator roles only, excluded from general dashboards and exports

C) Keep rates in Phase 1 with **no special restriction** — anyone who can see a member can see their rate

D) **Defer** all vendor/contractor commercial fields to a later phase — Phase 1 tracks off-roll members and their contract end dates only

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Contradiction 2: Allocation history is in Phase 1, but audit trail is deferred

You selected **Q2: G** — "Allocation history / audit trail (who was where, when, and who changed
it)" — as a Phase 1 capability. But in **Q17** you selected only **A** (role-based access control),
which excludes **B** (full audit trail of all data changes). These two answers point in opposite
directions on the same underlying mechanism.

There is a meaningful distinction available here, so this may not be a real conflict:

- **Allocation history** = the domain-level record of assignments over time. Answers "where was Priya in March?" It is a natural consequence of assignments having date ranges.
- **Full change audit** = a system-wide log of every create/update/delete on every entity, with actor and timestamp. Answers "who deleted this project and when?" It is infrastructure that touches every table.

### Clarification Question 2
Which of these does Phase 1 need?

A) **Allocation history only** — assignments are date-ranged and historical assignments are queryable and viewable; no system-wide change log (Q17: A stands as answered)

B) **Allocation history + change tracking on assignments only** — additionally record who created or modified each assignment and when

C) **Both** — allocation history plus a full system-wide audit log of all data changes (this promotes Q17: B into Phase 1)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Contradiction 3: CSV import is the data-entry mechanism, but no migration is needed

**Q11: D** says people data arrives via "bulk import via CSV/Excel upload, maintained manually
thereafter." **Q22: B** says you're replacing spreadsheets but "no migration needed — we'll start
fresh." If nothing is being migrated, it's unclear whether the CSV importer is needed in Phase 1 at
all, or whether it's simply how you'd prefer to do initial onboarding of ~200 members.

### Clarification Question 3
Is a CSV/Excel import feature required in Phase 1?

A) **Yes** — it's how we'll load the initial ~200 members and ~50 projects, even though we're not migrating historical allocations

B) **Yes, for members only** — projects and assignments will be created through the UI

C) **No** — manual entry through the UI is sufficient for Phase 1; add import later

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Ambiguity 1: "Team-agnostic via configurable fields" versus a minimal Phase 1

**Q6: B** asks for admin-configurable custom fields, roles, and skill taxonomies per team type. That
is genuinely the right long-term answer to "must work for Sales and Ops too" — but it is also the
single most expensive thing on your Phase 1 list. Configurable custom fields mean a dynamic schema, a
field-definition admin UI, dynamic form rendering, and validation driven by metadata rather than
code. It typically costs more than the entire member/project/assignment core combined.

Meanwhile **Q9: A** scopes Phase 1 to a single department of ~200 people, and **Q17: A** strips Phase
1 down to RBAC only. Building full field configurability for one IT team of 200 is a lot of machinery
serving one configuration.

There is a middle path: build the *core domain* with deliberately generic vocabulary and
configurable **reference data** (roles, skills, project types, org units are all admin-managed lookup
tables, not hardcoded enums). That makes the system genuinely usable by Sales or Ops on day one
without a dynamic-schema engine, and leaves the door open for true custom fields later.

### Clarification Question 4
How much configurability does Phase 1 need?

A) **Generic core + configurable reference data** (recommended) — no IT-specific vocabulary; admins manage roles, skills, project types, and org units as editable lists; custom user-defined fields deferred to Phase 2

B) **Full configurability in Phase 1** — admin-defined custom fields with dynamic forms, as answered in Q6: B, accepting the added Phase 1 cost

C) **Generic core only** — fixed field set with neutral naming; even reference data is seeded rather than admin-managed

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Ambiguity 2: "Visibility right now" versus "who is available next month"

**Q1: A** names allocation visibility — "who is on which project, at what percentage, **right
now**" — as the must-work capability. But **Q21: B** defines Phase 1 success as managers answering
"**who is available next month?**" in under a minute. The second is a forward-looking capacity query,
not a current-state view. Since assignments carry date ranges (**Q5: A**), the data supports it — but
a future-availability view is a distinct screen with distinct logic, and I need to know whether it's
in the Phase 1 build or a Phase 2 consequence.

### Clarification Question 5
Does Phase 1 include a forward-looking availability view?

A) **Yes** — Phase 1 needs both a current-state allocation view and a "who is free in a given future period" view; the latter is the success metric

B) **Current state only** — Phase 1 shows present allocations and assignment end dates; managers infer future availability from end dates themselves

C) **Yes, as a simple date-range filter** — one view that answers both, driven by an "as of date" or date-range selector rather than two separate screens

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Concern 1: All security rules and all automated testing are switched off

I want to flag this plainly once, then build exactly what you decide. Two of your answers combine
into real risk for something you've described as enterprise-grade:

- **Security extension: B (skip all security rules)** — while **Q13: C** has us building local username/password authentication. Authentication is the one component where getting it wrong is unrecoverable: password hashing, session handling, brute-force protection, and access-control enforcement. "Skip all security rules" is a reasonable answer for a throwaway prototype; it is a poor fit for a system that will hold your organization's staffing data and later gain SSO and multi-department isolation (**Q10: B**).
- **Q17: A only** — which excludes **C (automated test suite and CI)**. The AI-DLC Construction phase always runs a Build and Test stage, so tests will be produced regardless; what Q17: A signals is that no CI pipeline and no test-coverage discipline are required. On a codebase you intend to extend across multiple phases, that cost tends to arrive later with interest.

I'll proceed either way — this is your call, and I'd rather it be a deliberate one than an accident
of two checkbox answers.

### Clarification Question 6
How would you like to handle security and testing rigor for Phase 1?

A) **Confirm as answered** — skip the security extension, no CI, minimal testing; treat Phase 1 as a working prototype to validate the workflow

B) **Enable the security extension** (it becomes a blocking constraint on every stage), keep Q17 as answered — get authentication and access control right, stay lean elsewhere

C) **Enable the security extension and add automated tests + CI to Phase 1** — the fuller enterprise-grade footing

D) **Keep security extension off, but add automated tests + CI to Phase 1**

X) Other (please describe after [Answer]: tag below)

[Answer]: A
