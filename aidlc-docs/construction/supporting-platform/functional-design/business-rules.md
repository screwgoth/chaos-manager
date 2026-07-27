# Business Rules — `supporting-platform` (Unit 2)

**Unit**: 2 of 2 · **Stage**: Functional Design
**Decisions applied**: Q1:A, Q2→**CQ2:B**, Q3:C, Q4→**superseded by CQ1:A**, Q5:A, Q6:A, Q7:A, Q8:A,
Q9:A, Q10:A, Q11:A, Q12:A, Q13:A, Q14:A, Q15:A

Rules are technology-agnostic. Unit 1's rules are referenced, never restated — where a rule already
exists in `core-domain/functional-design/business-rules.md`, this document points at it.

---

## 1. Authorization — the BR-R series

BR-R-01 to BR-R-07 were defined in Unit 1. Unit 2 changes the **status** of two and adds eight.

| Rule | Statement | Unit 1 status | Unit 2 status |
|---|---|---|---|
| BR-R-01 | Write permitted only for `ADMIN` and `RESOURCE_MANAGER` | Enforced | Enforced, unchanged |
| BR-R-02 | `EXECUTIVE` is offered no write action anywhere | Enforced | Enforced, unchanged |
| BR-R-03 | `TEAM_LEAD` cannot modify assignments directly | Enforced | Enforced, unchanged |
| BR-R-04 | `TEAM_MEMBER` reads only their own profile and assignments | Enforced | Enforced, unchanged |
| **BR-R-05** | `TEAM_LEAD` and `RESOURCE_MANAGER` are confined to their permitted org scope | **NOT enforced** | **ENFORCED — this is the X-1 resolution** |
| BR-R-06 | Decisions derive from the server-resolved session, never from client input | Enforced | Enforced, unchanged |
| **BR-R-07** | Scope filters are applied inside queries; out-of-scope rows are never fetched | Mechanism present, filter permissive | **Filter is now real** |

### New rules

| Rule | Statement | Source |
|---|---|---|
| **BR-R-08** | `TEAM_LEAD` scope is their `home_org_unit_id` **plus its child units**. Org units are exactly two levels (BR-O-01), so the subtree is at most one level deep and needs no recursive query. | FR-R-04, FR-R-07 |
| **BR-R-09** | `RESOURCE_MANAGER` scope is **organisation-wide when their home org unit is a root unit**, and the home unit plus its children otherwise. Attaching a Resource Manager to the root unit is how organisation-wide reach is granted — there is no separate flag. | FR-R-03, FR-R-07, **CQ2:B** |
| **BR-R-10** | `ADMIN` and `EXECUTIVE` scope is unrestricted (`orgUnitIds: 'ALL'`). `EXECUTIVE` is read-only by BR-R-02. | FR-R-02, FR-R-06, FR-R-07 |
| **BR-R-11** | A `TEAM_LEAD` or `RESOURCE_MANAGER` whose `home_org_unit_id` is NULL resolves to an **empty** permitted-org list and therefore sees nothing. Fail closed. The refusal message tells them to ask an administrator; it does not imply the data is absent. | **Q5:A** |
| **BR-R-12** | An assignment is in scope when the caller's scope covers **the member OR the project's owning org unit**. Both sides grant visibility. | FR-R-07, **Q3:C / CQ1:A** |
| **BR-R-13** | Allocation totals for an in-scope member include **every** assignment that member holds, including assignments to projects outside the caller's scope, and the project is **named**. A scoped user never sees a partial capacity total. | **CQ1:A** |
| **BR-R-14** | The role → permission matrix is a **code constant**, exhaustive over 5 roles × 8 resource kinds × {read, write}. There is no `role_permission` table and no runtime editing. | **Q1:A** |
| **BR-R-15** | `TEAM_LEAD` has **no write path anywhere** in Phase 1, and no assignment-change request mechanism exists. FR-R-04's "request assignment changes" is deferred. | **Q6:A** |
| **BR-R-16** | A record outside the caller's scope yields **404 Not Found**, not 403 Forbidden, because 403 confirms the record exists. 403 is reserved for a permitted-resource, forbidden-**operation** refusal. | FR-R-08; continues Unit 1's choice |
| **BR-R-17** | An empty permitted-org list must produce an explicit always-false predicate, never an omitted WHERE clause. A filter that fails open is worse than no filter, because it looks enforced. | FR-R-08, R2-1 rule 1 |

### BR-R-13 is the rule most likely to be got wrong

The tempting implementation filters assignments by scope *and then* sums them, producing "80% booked,
20% free" for a member who is actually at 130%. That tells a Team Lead someone is available when they
are over-booked — the single failure this application exists to prevent. **Scope selects which
members are visible; it must not reduce a visible member's total.**

### Derived consequence of BR-R-12, stated explicitly

Because the project side also grants visibility, a `TEAM_LEAD` can see **members outside their own org
unit** when those members are staffed on a project their org unit owns. This is intended: you cannot
manage a project without seeing who is on it. It does mean a Team Lead can enumerate out-of-org
members to the extent those members work on their projects, and no further.

---

## 2. Account-to-member linkage — the BR-L series

| Rule | Statement | Source |
|---|---|---|
| **BR-L-01** | A user account links to **at most one** member, and a member is linked from **at most one** account. Already enforced by the partial unique index on `user_account.linked_member_id`. | FR-AU-05, US-ACC-04 |
| **BR-L-02** | Attempting to link an account that is already linked is **refused, naming the existing member**. Relinking requires an explicit unlink first — a two-step act, so a mis-click cannot silently repoint whose data someone sees. | US-ACC-04 AC 3 |
| **BR-L-03** | Attempting to link a member who is already linked from another account is refused, naming that account. Symmetric to BR-L-02. | BR-L-01 |
| **BR-L-04** | Unlink is permitted. A `TEAM_MEMBER` account that becomes unlinked loses **all** visibility (BR-R-18 below), which the confirmation must state before the act. | Q14:A |
| **BR-L-05** | Linking does **not** alter the account's `home_org_unit_id`. Role scope and own-data scope are independent axes: `home_org_unit_id` answers "which org unit", `linked_member_id` answers "which person". | Q14:A |
| **BR-L-06** | Linking and unlinking are **ADMIN only**. | US-ACC-04 (admin actor) |
| **BR-L-07** | A member record with no linked account remains complete and fully usable. No login is implied by existence, and none is required for allocation. | US-ACC-04 AC 2, FR-M-02 |
| **BR-R-18** | A `TEAM_MEMBER` whose account has no linked member is **refused entirely** rather than treated as unrestricted. Already enforced by Unit 1's stand-in; the real component must keep enforcing it. | Unit 1 `canRead`; US-VIS-04 |

---

## 3. Import — the BR-IM series

### File and format

| Rule | Statement | Source |
|---|---|---|
| **BR-IM-01** | Only **CSV** is accepted: UTF-8 (BOM tolerated), comma-delimited, RFC 4180 quoting, first row a header. An `.xlsx` or `.xls` upload is refused with a message telling the user to save as CSV. **FR-I-01 is therefore PARTIALLY satisfied — Excel is deferred, not delivered.** | **Q7:A**, FR-I-01 |
| **BR-IM-02** | Hard limits: **2,000 data rows** and **5 MB**. Exceeding either refuses the whole file before any row is parsed, naming the limit and the actual size. Processing is **synchronous** within the request. | **Q13:A** |
| **BR-IM-03** | Columns are matched by **header name**, case-insensitive and order-independent. A missing required column refuses the whole file, listing every missing column at once rather than one per attempt. | US-IMP-05 AC 2 |
| **BR-IM-04** | **Unknown columns are ignored**, and listed once as a file-level notice. This is also what keeps BR-M-09 safe: a `day_rate` or `po_number` column has no field to land in, so commercial data cannot enter through import even if the source spreadsheet carries it. | FR-I-01, **BR-M-09** |
| **BR-IM-05** | An empty file, or one with a header and no data rows, is refused as such rather than reported as a successful import of zero rows. | US-IMP-02 AC 3 |

### Duplicates and natural keys

| Rule | Statement | Source |
|---|---|---|
| **BR-IM-06** | A member's natural key is **`external_ref` when the row supplies one, `email` otherwise**. Both are uniquely indexed in Unit 1's schema. | **Q8:A**, FR-I-04 |
| **BR-IM-07** | A project's natural key is its **project code**, already uniquely indexed. | FR-I-04, FR-P-01 |
| **BR-IM-08** | A row whose natural key matches an **existing** record is reported as a **conflict naming that record**, and creates nothing. Import is **create-only**: it never updates an existing record. A conflict is not an error — it is reported in its own section, because "already there" and "wrong" call for different corrections. | US-IMP-04 AC 1 |
| **BR-IM-09** | When **two rows in the same file** share a natural key, the **first is imported** and each subsequent one is reported as a conflict naming the earlier row's line number. | US-IMP-04 AC 2 |
| **BR-IM-10** | Re-uploading an already-imported file therefore creates nothing and reports every row as a conflict. This is the idempotency property, and it falls out of BR-IM-08 rather than needing its own mechanism. | US-IMP-04 AC 3 |

### Validation and reference data

| Rule | Statement | Source |
|---|---|---|
| **BR-IM-11** | Per-row validation **reuses Unit 1's component validation**. Import must not restate BR-M-* or BR-P-* rules, because a second copy will drift from the first. | R2-1; FR-I-02 |
| **BR-IM-12** | **All** failure reasons for a row are collected and reported, never only the first. Unit 1's `ViolationCollector` already does this. | US-IMP-03 AC 3 |
| **BR-IM-13** | Reference data (skills, roles, project types) and org units are resolved by **exact name, case-insensitive**. An unmatched value **fails the row** and is reported. Values are **never created** by import. | **Q11:A**, US-IMP-01 AC 3 |
| **BR-IM-14** | Reference-data and org-unit lookups are **batched once per file**, not once per row. A 2,000-row file must not issue 2,000 lookups. | R2-1 rule 2 |
| **BR-IM-15** | Off-roll rows must carry vendor and contract fields, per Unit 1's BR-M-06. Enforced by reuse, not restatement. | BR-M-06, US-IMP-01 AC 2 |

### Transaction and result

| Rule | Statement | Source |
|---|---|---|
| **BR-IM-16** | All valid rows are written in **one transaction**. If any write fails unexpectedly at the database level, the entire import rolls back and **nothing** is created. There is no half-applied state. | **Q9:A** |
| **BR-IM-17** | Invalid and conflicting rows are excluded **before** the transaction opens. Validation is a read-only pass; the transaction contains writes only. | Q9:A, US-IMP-03 AC 1 |
| **BR-IM-18** | An import with **zero** valid rows creates nothing and reports explicitly that the import produced nothing — distinct from a successful import of zero rows, and distinct from a refused file. | US-IMP-02 AC 3 |
| **BR-IM-19** | The result report is returned in the **HTTP response only**. No `ImportRun` record is persisted. **Accepted gap: a bulk write leaves no audit trail beyond log lines.** Revisitable in Phase 2. | **Q10:A** |
| **BR-IM-20** | The report identifies every failed and conflicting row by its **1-based line number in the file including the header**, so the number matches what a spreadsheet shows. | US-IMP-03 AC 2 |
| **BR-IM-21** | Correcting failed rows and re-uploading **only those rows** imports them without duplicating the successes, which follows from BR-IM-08 and BR-IM-10. | US-IMP-03 AC 4 |

### Authorization and logging

| Rule | Statement | Source |
|---|---|---|
| **BR-IM-22** | Import is **ADMIN only**. No other role may reach the endpoint, and the refusal is a 403 — the resource is permitted to exist, the operation is not. | **Q12:A** |
| **BR-IM-23** | Imported rows are **not scope-restricted**, because only Admin can import and Admin is unrestricted. Any org unit named in the file is permitted. | Q12:A, BR-R-10 |
| **BR-IM-24** | Import logging records **counts and failure reasons only — never row contents**. No name, email, external reference or vendor may appear in a log line. | Security constraint in force |
| **BR-IM-25** | The uploaded file is held in memory for the duration of the request and **never written to disk**. Nothing to clean up, nothing left behind on the host. | BR-IM-02, BR-IM-24 |

---

## 4. Template

| Rule | Statement | Source |
|---|---|---|
| **BR-IM-26** | The template is **generated from the same column contract used to parse the upload**, not maintained as a static file. A hand-maintained template drifts from the parser, and the drift is discovered by a user whose correct file is rejected. | US-IMP-05, Q7:A |
| **BR-IM-27** | The template carries every column with its name and whether it is required, and downloads without authentication beyond an active session. | US-IMP-05 AC 1 |

---

## 5. Vocabulary Discipline (FR-C-01)

Every term introduced by this unit is checked against the domain-agnostic requirement. No term names
an IT, Sales or Operations concept:

`role`, `permission`, `scope`, `org unit`, `import`, `row`, `column`, `conflict`, `template`,
`natural key`, `member`, `project`, `account`, `link`.

The role **names** (`ADMIN`, `RESOURCE_MANAGER`, `TEAM_LEAD`, `TEAM_MEMBER`, `EXECUTIVE`) are fixed by
FR-R-01 and are already domain-neutral.

---

## 6. Rules Deliberately NOT Added

Stated so their absence is a decision rather than an omission.

| Not added | Why |
|---|---|
| Permission inheritance or role hierarchy | Five flat roles, fixed by FR-R-01. A hierarchy would be machinery with nothing to carry. |
| Per-record ACLs / sharing | No requirement. Scope is org-unit-based only. |
| Assignment-change request workflow | Q6:A defers it. FR-R-04's "request" is unimplemented and recorded as such. |
| Import update/upsert mode | BR-IM-08 makes import create-only. An upsert that silently overwrites 200 records on a re-run is far more dangerous than a conflict report. |
| Import rollback-after-commit | BR-IM-16 makes it unnecessary; there is no partially-applied state to undo. |
| Background job processing | Q13:A chose synchronous within a 2,000-row cap. |
| `role_permission` table | Q1:A. Unit 2 owns **no** database entity. |
