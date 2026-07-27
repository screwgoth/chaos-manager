# Functional Design Plan — `supporting-platform` (Unit 2)

**Stage**: CONSTRUCTION → Functional Design (per-unit loop, unit 2 of 2)
**Branch**: `aidlc/construction-supporting-platform`
**Date**: 2026-07-26
**Predecessor**: Unit 1 `core-domain` complete — 26/26 plan steps, 450 tests, 50 endpoints, commit `b17efad`

---

## 0. Scope Reconciliation — READ FIRST

Before planning the design I checked each of Unit 2's 13 stories against what Unit 1 actually
shipped, rather than against what Unit 1 was *scoped* to ship. Unit 1 over-delivered on the
Should-priority extensions, because the allocation component produced those endpoints as a natural
by-product of BR-A segmentation work.

**This changes Unit 2's real scope materially and must be settled before design proceeds.**

| Story | Priority | Backend | Frontend | Actual remaining work |
|---|---|---|---|---|
| US-ACC-05 | Must | stand-in only | — | **Full** — C-09 policy component |
| US-ENB-01 | Must | mechanism present, filter permissive | — | **Full** — real `ScopeFilter`, enforcement tests |
| US-ACC-04 | Should | `user_account.linked_member_id` column exists; no endpoint | none | **Most** — service, endpoint, admin screen |
| US-IMP-01…05 | Must ×4, Should ×1 | none | none | **Full** — C-10 Import, S-09, routes, F-07 |
| US-ASN-04 | Should | `assignment.project_role_id` column, service, validation | `AssignmentFormPage.tsx:209` renders "Role on this project" | **None — already complete** |
| US-VIS-05 | Should | `GET /api/allocations/members/:id/timeline` | `MemberDetailPage.tsx:47` renders the segment strip | **None — already complete** |
| US-VIS-06 | Should | `GET /api/allocations/unallocated` | query key exists at `queries.ts:48`; **no screen consumes it** | Frontend only |
| US-VIS-07 | Should | `GET /api/allocations/over-allocated` | banner on `AllocationViewPage.tsx:152`; no dedicated review list | Frontend only |
| US-MEM-06 | Should | `GET /api/members/expiring-contracts` | **no reference anywhere** | Frontend only |

**Honest consequence**: two Unit 2 stories (US-ASN-04, US-VIS-05) were incidentally satisfied during
Unit 1. Unit 1's summary claimed 30 stories; it in fact also completed these two. Three more
(US-VIS-06, US-VIS-07, US-MEM-06) need frontend only. Unit 2's genuine design burden is therefore
concentrated almost entirely in **authorization** and **import** — which is where this plan puts it.

See **Question 15** for how you want the already-complete stories recorded.

---

## 1. Plan Steps

**All steps complete 2026-07-26.** Answers applied: Q1:A, Q2→**CQ2:B**, Q3:C, Q4→**superseded by CQ1:A**, Q5:A, Q6:A, Q7:A, Q8:A, Q9:A, Q10:A, Q11:A, Q12:A, Q13:A, Q14:A, Q15:A.

### Part A — Authorization (C-09, S-02) — the X-1 resolution

- [x] A1. Define the role → permission matrix for all 5 roles × 8 `ResourceKind` values × read/write
- [x] A2. Define org-scope resolution: session identity → `AccessScope` (two-level org unit subtree)
- [x] A3. Define `AccessScope` → `ScopeFilter` derivation per role, including fail-closed cases
- [x] A4. Define the governing org unit for each resource kind (member, project, assignment, allocation)
- [x] A5. Define allocation-total behaviour when a member has assignments outside the caller's scope
- [x] A6. Define the 404-vs-403 rule for out-of-scope records (Unit 1 chose 404; confirm it holds)
- [x] A7. Specify the stand-in deletion procedure and the "no Unit 1 caller changed" verification
- [x] A8. Specify `RolePermission` persistence (or its deliberate absence) and any migration needed

### Part B — Account-to-member linkage (US-ACC-04)

- [x] B1. Define link, relink and unlink rules, including the one-account-per-member constraint
- [x] B2. Define the interaction between `linked_member_id`, `home_org_unit_id` and `ownMemberId`
- [x] B3. Define what a TEAM_MEMBER account with no link can and cannot do (currently refused)

### Part C — Import (C-10, S-09)

- [x] C1. Define accepted file formats, encoding, size and row limits
- [x] C2. Define the member column contract and the project column contract
- [x] C3. Define natural keys and duplicate detection, including in-file duplicates
- [x] C4. Define per-row validation reusing Unit 1's business rules rather than restating them
- [x] C5. Define reference-data resolution by name and the unmatched-value report
- [x] C6. Define transaction granularity and the partial-success guarantee
- [x] C7. Define the result report structure — counts, per-row errors, per-row conflicts
- [x] C8. Define the template contract (US-IMP-05) and its coupling to C2
- [x] C9. Define who may import, and the org scope applied to imported rows
- [x] C10. Define logging obligations — row counts and failure reasons, **never row contents**

### Part D — Frontend (F-07 import + three Should extensions)

- [x] D1. Import screen: upload, progress, result report, template download
- [x] D2. Bench screen (US-VIS-06) — consumes the existing endpoint
- [x] D3. Over-allocated review list (US-VIS-07) — beyond the existing banner
- [x] D4. Expiring-contracts surface (US-MEM-06)
- [x] D5. Define role-conditional UI rendering, and state that it is presentation only, never the control

### Part E — Cross-cutting obligations

- [x] E1. R2 obligation 4: enumerate every enforcement point and prove none is bypassable
- [x] E2. R2 obligation 5: verify Unit 2's endpoints uphold the client-agnostic API invariant (US-ENB-04)
- [x] E3. Confirm FR-C-01 vocabulary discipline in all new import and authorization vocabulary
- [x] E4. Confirm BR-M-09 — no contractor commercial field enters via import

### Part F — Artifact generation

- [x] F1. `business-logic-model.md`
- [x] F2. `business-rules.md`
- [x] F3. `domain-entities.md`
- [x] F4. `frontend-components.md`

---

## 2. Questions

Please answer each by putting a letter after the `[Answer]:` tag. If none fits, choose the last
option and describe what you want.

---

### Authorization

## Question 1
`unit-of-work.md` says Unit 2 owns a `RolePermission` entity described as "configuration", but
FR-R-01…FR-R-06 fix the five roles and their permissions in the requirements. Should the permission
matrix be runtime-configurable?

A) **Code constant** — a typed, exhaustive table in the authorization component. No migration, no
admin screen. Changing a permission is a code change and a code review, which is appropriate for a
security control. `RolePermission` becomes a documented non-entity.

B) **Database table, seeded, no admin UI** — the matrix lives in a `role_permission` table seeded at
migration time. Editable only by direct SQL. Gives an audit surface without an attack surface.

C) **Database table with an admin screen** — Admins can grant and revoke permissions per role at
runtime. Maximum flexibility; also means a misconfiguration can lock everyone out or open
everything up, so it needs its own guard rails.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2
FR-R-03 grants a Resource/Delivery Manager rights "within their permitted org scope", while FR-R-07
says only Executive and Admin see across all units. Org units are exactly two levels deep. How
broad is a Resource Manager's scope?

A) **Same as Team Lead** — their home org unit plus its children. A Resource Manager attached to a
child unit sees only that child.

B) **Root-wide if attached to a root unit, subtree otherwise** — attaching a Resource Manager to the
root org unit is how you grant them organisation-wide reach, using the existing hierarchy rather
than a new flag.

C) **Organisation-wide always** — the role is inherently cross-org and `home_org_unit_id` is
informational only for this role.

D) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 3
An assignment links a member (in one org unit) to a project (owned by possibly another). Which org
unit governs whether a scoped user may read or write that assignment?

A) **The member's org unit** — assignment is fundamentally about a person's time, and the people
manager is the accountable party.

B) **The project's owning org unit** — assignment is fundamentally about staffing a project, and the
delivery owner is the accountable party.

C) **Either** — visible if the caller's scope covers the member **or** the project. Maximises useful
visibility for cross-org staffing.

D) **Both** — visible only if the caller's scope covers the member **and** the project. Most
restrictive; a cross-org assignment becomes invisible to both sides.

E) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 4
This is the most consequential question in the unit. A Team Lead scoped to org unit "Platform" views
a member who is 80% on a Platform project and 50% on a Sales project the Team Lead cannot see. The
member is over-allocated at 130%. What does the Team Lead see?

A) **Full total, redacted detail** — "130% booked, over capacity", with the Sales 50% shown as
"50% on a project outside your visibility". The number is always truthful; only the project identity
is withheld.

B) **Only the visible portion** — "80% booked, 20% free". Strictly scope-respecting, but it tells the
Team Lead a member is available who is in fact over-booked. Silently wrong in exactly the situation
the application exists to prevent.

C) **Visible portion plus an unattributed remainder** — "80% visible, 50% elsewhere, 130% total"
without labelling the remainder as a project at all.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5
A user account with role TEAM_LEAD or RESOURCE_MANAGER but a NULL `home_org_unit_id` is a
misconfiguration the schema currently permits. What should happen?

A) **Fail closed** — the account resolves to an empty scope and sees nothing, with a message telling
them to ask an administrator. Matches the fail-closed choice Unit 1 already made for an unlinked
TEAM_MEMBER.

B) **Refuse at sign-in** — the session is not created at all, so the state cannot be reached.

C) **Fail closed, and add a migration making `home_org_unit_id` NOT NULL for these roles** —
prevents the state existing rather than handling it.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6
FR-R-04 says a Team Lead may "request assignment changes", with direct modification not granted in
Phase 1. No story covers a request mechanism. How should this be treated?

A) **Out of scope for Phase 1** — Team Leads have no write path and no request feature. Record the
gap explicitly in the design as deferred.

B) **Read-only plus a note field** — Team Leads can attach a comment to an assignment that a
Resource Manager sees. Minimal implementation of "request".

C) **Full request workflow** — a request entity with pending/approved/rejected states. Substantially
more work than the remaining Should stories combined, and no story or requirement specifies it.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Import

## Question 7
FR-I-01 says "CSV/Excel uploads". Excel parsing needs a third-party library with a meaningfully
larger dependency and attack surface than CSV. Which formats for Phase 1?

A) **CSV only** — plus explicit guidance to "Save As CSV" in the template and the error message when
an `.xlsx` is uploaded. Smallest surface; a partial satisfaction of FR-I-01 that must be recorded as
such.

B) **CSV and Excel (.xlsx)** — full FR-I-01. Adds a parsing dependency; `.xls` (legacy binary) still
refused.

C) **CSV and Excel, Excel converted client-side** — the browser parses the sheet to CSV before
upload, so the server keeps the smaller surface. Moves the dependency to the frontend bundle.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 8
FR-I-04 requires duplicate detection on a natural key. Members have `external_ref` (optional,
uniquely indexed) and `email` (required, uniquely indexed). Which is the import natural key for a
member?

A) **`external_ref` when present, `email` otherwise** — uses the employee ID when the organisation
has one, and always has a fallback.

B) **`email` only** — always present and always unique, so behaviour is uniform across every file.

C) **Both independently** — a row conflicts if *either* matches an existing record. Catches the case
where a file gives a new email to an existing employee ID.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 9
US-IMP-03 requires valid rows to import while invalid rows do not, "in a single operation". What is
the transaction boundary?

A) **One transaction for all valid rows** — either every valid row commits or none does. If the
database rejects one row unexpectedly, the whole import rolls back and nothing partially lands.

B) **One transaction per row** — a row that fails at the database level fails alone; everything else
stands. Maximum partial success, but the import can end in a half-applied state that the report must
describe precisely.

C) **Batched** — commit in chunks of, say, 100 rows. A middle ground whose failure semantics are the
hardest of the three to explain to a user.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 10
Should an import produce a persisted record, or only a response?

A) **Response only** — validation and conflict reports are returned once, in the HTTP response. No
new entity, no migration. If the admin closes the tab, the report is gone.

B) **Persisted `ImportRun` with a downloadable report** — who imported what, when, how many rows
succeeded and failed, retrievable afterwards. Adds an entity and a migration; gives an audit trail
for a bulk write path, which is the highest-privilege operation in the system.

C) **Response only, plus a downloadable error CSV generated client-side** — the admin can save the
failed rows, correct them and re-upload, with no server-side storage.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 11
US-IMP-01's acceptance criteria require unmatched skills, roles and org units to be "reported rather
than silently created". Should there be an opt-in to create them anyway?

A) **No** — unmatched values always fail the row. Keeps reference vocabulary under deliberate
administrative control, which is the point of FR-C-01.

B) **Yes, an explicit opt-in checkbox** — "create reference values found in this file", off by
default, reported in the result. Convenient for first-load; risks importing typos as vocabulary.

C) **Yes, but only for org units** — skills and roles stay controlled; org structure is bulk-loaded
alongside people because it is tedious to pre-create.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 12
Who may run an import, and what scope applies to the rows they import? `ResourceKind` already
includes `'IMPORT'`.

A) **Admin only, unrestricted** — import is a system-administration act. Simplest and matches every
US-IMP story, which names the admin as the actor.

B) **Admin unrestricted, Resource Manager within their scope** — a Resource Manager may bulk-load
into their own org units only; rows naming an org unit outside their scope fail as errors.

C) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 13
What limits should the import enforce, given the stated need to load "two hundred people"?

A) **2,000 rows / 5 MB, processed synchronously** — an order of magnitude above the stated need,
completes inside a normal request, no background job machinery.

B) **10,000 rows / 20 MB, synchronous with a raised request timeout** — more headroom; a large file
holds a request open long enough to need care.

C) **Unbounded, processed as a background job with polling** — scales indefinitely; adds job state,
polling endpoints and a substantially more complex screen for a stated need of 200 rows.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Frontend and record-keeping

## Question 14
Three Should stories need frontend only (US-VIS-06 bench, US-VIS-07 over-allocated review, US-MEM-06
expiring contracts). How should they be surfaced?

A) **Three dedicated pages** under the existing views/members sections, each with its own route and
navigation entry. Most discoverable; three more screens to maintain.

B) **Filters and tabs on existing pages** — bench and over-allocated become filter modes on the
allocation view; expiring contracts becomes a filter on the member list. Fewest new surfaces, and
each finding stays in context.

C) **A single "Attention" page** aggregating all three as sections — one place an operator checks for
anything needing action.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 15
US-ASN-04 and US-VIS-05 were already implemented during Unit 1 (see §0). How should this be
recorded?

A) **Mark both complete in Unit 2, credited to Unit 1, and correct Unit 1's story count from 30 to
32** — the artifacts say what actually happened, and both units' counts reconcile.

B) **Leave them as Unit 2 stories and re-verify them with Unit 2 tests** — no count changes; Unit 2
adds acceptance tests proving the behaviour rather than rebuilding it.

C) **Both** — correct the counts *and* add the verifying tests.

D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 3. Constraints Carried Into This Design

Non-negotiable, restated so they are visible while answering:

- **FR-R-08 and FR-AU-02 remain mandatory** despite all three AI-DLC extensions being disabled
  (NFR-SE-02). This unit *is* the FR-R-08 work.
- **`IAuthorizationComponent` is FINAL.** If Unit 2's design needs to widen it, that is a Unit 1
  design defect and must be recorded as one, not silently absorbed.
- **Scope filters apply inside SQL**, never post-fetch (FR-R-08, R2-1 rule 1).
- **Authorization decisions never derive from client input** (BR-R-06).
- **Import logs row counts and failure reasons, never row contents.**
- **No contractor commercial data** — rates, contract values, PO numbers (BR-M-09).
- **No N+1 queries** (R2-1 rule 2) — import validation must batch its reference-data lookups.
- **FR-C-01 vocabulary discipline** — no IT-, Sales- or Ops-specific terms in any new vocabulary.
