# Business Rules — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` · **Stage**: Functional Design
**Date**: 2026-07-25

Every rule traces to the story or functional requirement that demands it. Rules are enforced in the
**domain and service layer only** — never in the route layer, never only in the browser (Q4:A of
Application Design, US-ENB-04).

## Validation Error Shape (Q12:A)

All rule violations surface in one structure, so the frontend can place each message beside its input and
any client receives the same payload:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "The member could not be saved.",
  "violations": [
    { "field": "email",             "rule": "DUPLICATE",        "detail": "Already used by member M-104 (Anita Desai)." },
    { "field": "contractEndDate",   "rule": "DATE_ORDER",       "detail": "Contract end date must be on or after the start date." },
    { "field": "vendorName",        "rule": "REQUIRED_OFF_ROLL", "detail": "Required when employment type is off-roll." }
  ]
}
```

**Rules for this structure**

- **Every** violation is reported, never only the first (US-MEM-07, US-PRJ-05, US-ASN-06 criteria)
- `field` is the client-facing field name; `null` for whole-record violations
- `detail` names the conflicting record where one exists — "already used by member M-104" is actionable, "duplicate" is not
- Warnings (over-allocation, date conflicts) use a **separate** channel from violations, because they do not block a save

---

## 1. Member Rules

| ID | Rule | Trace |
|---|---|---|
| BR-M-01 | `fullName`, `email`, `orgUnitId`, `employmentType`, `roleId` are required | FR-M-01, US-MEM-07 |
| BR-M-02 | `email` unique case-insensitively; violation names the conflicting member | US-MEM-07 |
| BR-M-03 | `externalRef` unique when present; used as the import natural key | FR-I-04 |
| BR-M-04 | `orgUnitId` must reference an existing **active** org unit | FR-O-03 |
| BR-M-05 | `roleId` must reference an active `ReferenceDataEntry` of type `ROLE` | FR-M-01, FR-C-02 |
| BR-M-06 | When `employmentType = OFF_ROLL`: `vendorName`, `contractStartDate`, `contractEndDate`, `contractStatus` all required | FR-M-03, US-MEM-02 |
| BR-M-07 | When `employmentType = ON_ROLL`: contract fields are not requested and not required | US-MEM-02 |
| BR-M-08 | `contractEndDate` ≥ `contractStartDate` | US-MEM-07 |
| BR-M-09 | **No rate, contract value, or purchase-order field may exist** on the member record in Phase 1 | CQ1:A, US-MEM-02 |
| BR-M-10 | Changing `OFF_ROLL` → `ON_ROLL` **retains** contract fields as history; it does not clear them | US-MEM-02 |
| BR-M-11 | Skills must reference active `SKILL` reference data; free-text skills are rejected with a message directing the user to add reference data first | US-MEM-03 |
| BR-M-12 | Removing one skill leaves the member's other skills and all assignments untouched | US-MEM-03 |
| BR-M-13 | Deactivation sets `status = INACTIVE` and `deactivatedOn`, and **auto-ends all open assignments** at that date, reporting the count | US-MEM-05, Q5:A |
| BR-M-14 | Deactivated members are excluded from assignable lists but retained in all historical views | US-MEM-05 |
| BR-M-15 | Reactivation restores assignability but **does not** restore auto-ended assignments | Q5:A consequence |
| BR-M-16 | Member capacity is fixed at 100.0% — no per-member capacity attribute exists in Phase 1 | AS-01, Q10:B |
| BR-M-17 | Search results never include members outside the caller's scope, whatever the search term | US-MEM-04, FR-R-07 |
| BR-M-18 | A filter combination matching nothing returns an explicit empty result, distinguishable from an error | US-MEM-04 |

---

## 2. Project Rules

| ID | Rule | Trace |
|---|---|---|
| BR-P-01 | `code`, `name`, `owningOrgUnitId`, `projectTypeId`, `startDate`, `plannedEndDate`, `status` required | FR-P-01, US-PRJ-05 |
| BR-P-02 | `code` unique case-insensitively; violation names the conflicting project | US-PRJ-05, FR-I-04 |
| BR-P-03 | `plannedEndDate` ≥ `startDate` | US-PRJ-05 |
| BR-P-04 | `projectTypeId` must reference active `PROJECT_TYPE` reference data — never a hardcoded list | FR-P-02, FR-C-02 |
| BR-P-05 | `owningOrgUnitId` must reference an existing active org unit | FR-O-03 |
| BR-P-06 | Closing a project with assignments extending past the closure date **requires explicit confirmation**; the response first returns the affected assignments | US-PRJ-02 |
| BR-P-07 | On confirmed closure, open assignments are auto-ended at `closedOn` and the count is reported | US-PRJ-02, Q5:A |
| BR-P-08 | Closed projects are excluded from assignment targets but retained in historical views | US-PRJ-02 |
| BR-P-09 | A project with no assignments is shown as explicitly unstaffed, not as an empty table | US-PRJ-04 |
| BR-P-10 | Project staffing distinguishes current from past assignments by date, not by `status` | US-PRJ-04 |
| BR-P-11 | Where a member holds several concurrent assignments to one project, staffing views group them under the member with a subtotal | Q4:B consequence, US-PRJ-04 |

---

## 3. Assignment Rules

| ID | Rule | Trace |
|---|---|---|
| BR-A-01 | `memberId`, `projectId`, `allocationPercentage`, `startDate`, `endDate` required | FR-A-01 |
| BR-A-02 | `allocationPercentage` in **0.1 – 100.0**, at most one decimal place; zero and negatives rejected | Q3:C, US-ASN-06 |
| BR-A-03 | Percentages are computed as **integer tenths**; floating-point arithmetic is prohibited in allocation logic | Q3:C consequence |
| BR-A-04 | `endDate` ≥ `startDate`; both bounds inclusive | AS-03, US-ASN-06 |
| BR-A-05 | Member must be `ACTIVE`; project must be `ACTIVE` | US-ASN-01, US-ASN-06 |
| BR-A-06 | **Multiple concurrent assignments to the same project are permitted** and sum normally | Q4:B |
| BR-A-07 | Total allocation for a date = exact sum of percentages of all assignments whose inclusive range contains that date | FR-A-03 |
| BR-A-08 | Over-allocation = total > 100.0% for any sub-period; detection returns **each offending sub-period**, not just a flag | FR-A-04, US-ASN-05 |
| BR-A-09 | Over-allocation is a **warning permitting explicit override**, never a hard block | FR-A-06, AS-02 |
| BR-A-10 | Cancelling at the warning persists **nothing** | US-ASN-05 |
| BR-A-11 | Proceeding sets `savedAsOverride = true`, derived from the detection result rather than from the user's flag | FR-A-06 |
| BR-A-12 | Overridden over-allocations stay visibly flagged in every allocation and availability view | FR-A-06, US-ASN-05 |
| BR-A-13 | Assigning an off-roll member beyond `contractEndDate` raises a `CONTRACT_WINDOW` **warning** naming the contract end date — it does not block | FR-A-09, US-ASN-06 |
| BR-A-14 | Assigning outside the member's active period raises a `MEMBER_INACTIVE_PERIOD` warning | FR-A-09, US-ASN-06 |
| BR-A-15 | When editing, the assignment's **own current row is excluded** from its over-allocation check | US-ASN-05 correctness |
| BR-A-16 | Every mutation writes an `AssignmentHistory` revision and closes the prior revision in the **same transaction** | Q1:B, Q2:C |
| BR-A-17 | **Invariant**: the current `Assignment` row always equals the history revision whose `supersededAt IS NULL` | Q2:C consistency |
| BR-A-18 | `AssignmentHistory` is append-only — never updated except to set `supersededAt`, never deleted | Q1:B |
| BR-A-19 | Ending early sets `endDate` to the effective date, releases allocation from that date forward, and preserves the elapsed portion | US-ASN-03 |
| BR-A-20 | `status = ENDED` means administratively terminated; a merely past `endDate` leaves status `ACTIVE`. **Currency is derived from dates, never from status** | Design decision |
| BR-A-21 | `projectRoleId` is optional; an assignment without one is valid and complete | FR-A-10, US-ASN-04 |
| BR-A-22 | As-of-date queries resolve against `AssignmentHistory` (transaction time + valid time), never against current rows | US-ASN-07, Q1:B + Q2:C |
| BR-A-23 | As-of-date queries include assignments of members since deactivated | US-ASN-07 |

### BR-A-24 — Concurrency (Q6:A)

The over-allocation check and the write **must be atomic**. The transaction acquires a row-level lock on
the **member** before checking, and holds it through the write.

*Failure mode this prevents*: two managers assign the same member concurrently; both read the pre-existing
80% total, both see their own 40% as taking it to 120%, both are warned, both override — or worse, both see
a compliant total and neither is warned. The result is an over-allocation nobody approved and no
`savedAsOverride` flag. The lock serialises them, so the second writer re-checks against the first's
committed row.

---

## 4. Allocation and Availability Rules

| ID | Rule | Trace |
|---|---|---|
| BR-V-01 | Segment boundaries fall at every assignment start and every `end + 1 day` within the query range | §1 of business-logic-model |
| BR-V-02 | Adjacent segments with identical totals and contributors are merged, so callers see the coarsest correct view | Presentation quality |
| BR-V-03 | Available capacity = 100.0% − total; **may be negative**, and negative means over-allocated | FR-V-02 |
| BR-V-04 | Availability results distinguish three states: available, fully allocated, and over-allocated. Over-allocated is never collapsed into "unavailable" | US-VIS-02 |
| BR-V-05 | Availability is ordered most-available-first, then by name | US-VIS-02 |
| BR-V-06 | A member free for only part of the queried range shows availability for that part, not an average | US-VIS-02 |
| BR-V-07 | Every view is driven by a caller-supplied as-of date or range, defaulting to today | FR-V-04 |
| BR-V-08 | Empty results are explicit, never an unexplained blank | US-VIS-03, US-MEM-04, US-PRJ-03 |
| BR-V-09 | All views are paginated | NFR-S-03 |
| BR-V-10 | A Team Member's own-assignments view exposes no other member's data by any route, including direct API calls | US-VIS-04, FR-R-05 |
| BR-V-11 | Upcoming assignments not yet started are shown and visually distinguished from active ones | US-VIS-04 |

---

## 5. Organizational Structure Rules

| ID | Rule | Trace |
|---|---|---|
| BR-O-01 | Exactly two levels: `parentOrgUnitId = null` is a department, set is a team. A team may not parent another unit | FR-O-01 |
| BR-O-02 | Unit names unique among siblings, case-insensitive | US-ADM-03 |
| BR-O-03 | Every member and project belongs to exactly one org unit | FR-O-03 |
| BR-O-04 | Cross-org assignment permitted — both org units are visible on the assignment | FR-O-04 |
| BR-O-05 | An org unit referenced by any member, project, or child unit cannot be removed; the refusal reports what references it | FR-O-04, US-ADM-03 |
| BR-O-06 | Org units are admin-managed data — addable and renamable without code change or redeployment | FR-C-02, FR-C-03 |

---

## 6. Reference Data Rules

| ID | Rule | Trace |
|---|---|---|
| BR-C-01 | Roles, skills, and project types are admin-managed records, never hardcoded enumerations | FR-C-02 |
| BR-C-02 | New entries become immediately selectable with no redeployment | FR-C-03, US-ADM-01 |
| BR-C-03 | Names unique per reference type, case-insensitive | US-ADM-01 |
| BR-C-04 | Renaming propagates automatically, because references are by identifier and never by name | US-ADM-01 |
| BR-C-05 | Deactivation removes an entry from new selections while existing references stay intact and readable | FR-C-04, US-ADM-02 |
| BR-C-06 | Hard deletion of a referenced entry is **refused**, reporting the reference count and offering deactivation | FR-C-04, US-ADM-02 |
| BR-C-07 | Deactivated entries can be reactivated | US-ADM-02 |
| BR-C-08 | No entity name, field name, or label may contain team-type-specific vocabulary | FR-C-01, US-ADM-01 |
| BR-C-09 | The reserved `attributes` column on Member and Project is **unused in Phase 1** — no read, no write, no validation | FR-C-05, Q11:A |

---

## 7. Authentication and Session Rules

| ID | Rule | Trace |
|---|---|---|
| BR-AU-01 | Passwords stored only as **Argon2id** hashes with embedded salt; algorithm and parameters recorded | FR-AU-02, US-ENB-02, Q10:A |
| BR-AU-02 | No plaintext or reversible password form is persisted, returned, or logged anywhere | FR-AU-02, US-ENB-02 |
| BR-AU-03 | Identical passwords for different users produce different hashes | US-ENB-02 |
| BR-AU-04 | Wrong password and unknown username return the **same** rejection message | US-ACC-03 |
| BR-AU-05 | The unknown-username path performs a dummy hash comparison so timing does not reveal which usernames exist | US-ACC-03 |
| BR-AU-06 | Empty username or password is caught before any authentication attempt | US-ACC-03 |
| BR-AU-07 | An inactive account cannot sign in; the message states the account is not active | US-ACC-01 |
| BR-AU-08 | Session establishment resolves and attaches role and scope | US-ACC-01 |
| BR-AU-09 | Only the session token's **hash** is stored | Q8:A |
| BR-AU-10 | Sliding inactivity expiry, 30 minutes, configurable | FR-AU-04, Q9:B |
| BR-AU-11 | Sign-out sets `terminatedAt` — genuine server-side termination, not merely clearing a cookie | US-ACC-02 |
| BR-AU-12 | An expired or unknown session is rejected and no state from it carries into a new session | US-ACC-02 |
| BR-AU-13 | At most one user account per member, enforced both directions; a second link attempt is rejected naming the existing link | FR-AU-05, US-ACC-04 |
| BR-AU-14 | A member without a linked account is complete and usable; no login is implied | US-ACC-04 |
| BR-AU-15 | No code outside credential verification may read `passwordHash`, and no authorization decision may inspect *how* the user authenticated | US-ENB-03, R2-3 |

---

## 8. Access Control Rules — stand-in scope (X-1)

Full RBAC is Unit 2. These are what the **permissive stand-in enforces in Unit 1**.

| ID | Rule | Stand-in | Trace |
|---|---|---|---|
| BR-R-01 | Write permitted only for `ADMIN` and `RESOURCE_MANAGER` | **Enforced** | FR-R-02, FR-R-03 |
| BR-R-02 | `EXECUTIVE` is offered no write action anywhere | **Enforced** | FR-R-06 |
| BR-R-03 | `TEAM_LEAD` cannot modify assignments directly | **Enforced** | FR-R-04 |
| BR-R-04 | `TEAM_MEMBER` reads only their own profile and assignments | **Enforced** via `restrictToMemberId` | FR-R-05, US-VIS-04 |
| BR-R-05 | `TEAM_LEAD` and `RESOURCE_MANAGER` restricted to their own org unit | **NOT enforced in Unit 1** | FR-R-07 |
| BR-R-06 | Authorization decisions derive from the server-resolved session, never from client-supplied values | **Enforced** | FR-R-08, US-ENB-01 |
| BR-R-07 | Scope filters are applied inside queries; out-of-scope rows are never fetched | Mechanism present, filter permissive | FR-R-08, US-ENB-01 |

> **⚠️ BR-R-05 is deliberately unenforced while `core-domain` is the only completed unit.** A Team Lead or
> Resource Manager sees all org units. Acceptable only under the single-track, no-external-users assumption
> (unit plan Q7:A). Revisit trigger in `unit-of-work-dependency.md` §3.

---

## 9. Rule Coverage Check

| Story group | Rules | Complete |
|---|---|---|
| US-ACC-01/02/03 | BR-AU-04 … BR-AU-12 | ✅ |
| US-MEM-01…05, 07 | BR-M-01 … BR-M-18 | ✅ |
| US-PRJ-01…05 | BR-P-01 … BR-P-11 | ✅ |
| US-ASN-01/02/03/05/06/07 | BR-A-01 … BR-A-24 | ✅ |
| US-VIS-01/02/03/04 | BR-V-01 … BR-V-11 | ✅ |
| US-ADM-01/02/03 | BR-C-01 … BR-C-09, BR-O-01 … BR-O-06 | ✅ |
| US-ENB-02 | BR-AU-01 … BR-AU-03 | ✅ |
| US-ENB-03 | BR-AU-15 | ✅ |
| US-ENB-04 | Enforced structurally — rules live in domain and service layer only | ✅ |

**Note on verification**: with no automated test suite in Phase 1 (NFR-Q-01), these rules together with the
Given/When/Then criteria in `stories.md` constitute the acceptance checklist. **BR-A-07, BR-A-08, BR-A-17,
BR-A-22, and BR-A-24 are the five worth checking by hand most carefully** — they are where a subtle error
would be least visible and most damaging.
