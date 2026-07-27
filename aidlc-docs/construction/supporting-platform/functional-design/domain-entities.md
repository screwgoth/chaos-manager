# Domain Entities — `supporting-platform` (Unit 2)

**Unit**: 2 of 2 · **Stage**: Functional Design

---

## 1. Unit 2 Owns No Database Entity

`unit-of-work.md` names `RolePermission` as the one database entity Unit 2 owns. **Q1:A removes it.**
With a code-constant permission matrix there is no table, no seed and no admin screen.

`Q10:A` likewise removes the only other candidate: no `ImportRun` record is persisted.

**Consequence: Unit 2 requires no database migration.** The schema at `001_initial_schema.ts` is the
final Phase 1 schema. This is a genuine simplification, and it is worth stating plainly because a
second migration is the kind of thing that gets written out of habit.

`unit-of-work.md` is corrected accordingly (see §6).

---

## 2. Unit 1 Columns Unit 2 Finally Uses

Two columns exist in Unit 1's schema but are read by nothing today. Unit 2 is what makes them live.

| Column | Table | Unit 1 status | Unit 2 use |
|---|---|---|---|
| `home_org_unit_id` | `user_account` | written at account creation, **never read** | **The org-scope root.** BR-R-08/09 resolve `AccessScope.orgUnitIds` from it. |
| `linked_member_id` | `user_account` | written by nothing, read into `VerifiedIdentity.linkedMemberId` | **US-ACC-04.** The link endpoint writes it; `ownMemberId` derives from it. |

Both are nullable, and both nullable cases are load-bearing:

- `home_org_unit_id` NULL for a `TEAM_LEAD`/`RESOURCE_MANAGER` → **empty scope, fail closed** (BR-R-11).
  Not "unrestricted", which is what a naive `IS NULL → no filter` would produce.
- `linked_member_id` NULL for a `TEAM_MEMBER` → **refused entirely** (BR-R-18).

---

## 3. In-Memory Domain Types

These are computed values and data-transfer shapes, not persisted entities.

### 3.1 The permission matrix (BR-R-14)

A constant, not a table. Exhaustive over 5 roles × 8 `ResourceKind` × {read, write} = **80 decisions**,
each explicit. Exhaustiveness is a design requirement, not a nicety: a matrix with a default branch
silently grants or denies whatever the author forgot.

```
PermissionMatrix : Record<UserRole, Record<ResourceKind, { read: boolean; write: boolean }>>
```

The eight resource kinds are already fixed by the FINAL interface: `MEMBER`, `PROJECT`, `ASSIGNMENT`,
`ALLOCATION_VIEW`, `REFERENCE_DATA`, `ORG_UNIT`, `USER_ACCOUNT`, `IMPORT`.

| Role | Reads | Writes |
|---|---|---|
| `ADMIN` | all 8 | all 8 |
| `RESOURCE_MANAGER` | all 8 except `USER_ACCOUNT`, `IMPORT` | `PROJECT`, `ASSIGNMENT` only |
| `TEAM_LEAD` | `MEMBER`, `PROJECT`, `ASSIGNMENT`, `ALLOCATION_VIEW`, `ORG_UNIT`, `REFERENCE_DATA` | **none** (BR-R-15) |
| `TEAM_MEMBER` | `MEMBER`, `ASSIGNMENT`, `ALLOCATION_VIEW` — own only, via `restrictToMemberId` | **none** |
| `EXECUTIVE` | all 8 except `USER_ACCOUNT`, `IMPORT` | **none** (BR-R-02) |

Note `RESOURCE_MANAGER` cannot write `MEMBER`, `REFERENCE_DATA` or `ORG_UNIT`: FR-R-03 grants them
projects and assignments, and FR-R-02 reserves reference-data and roster administration to Admin.

### 3.2 `AccessScope` and `ScopeFilter`

**Unchanged** — defined in Unit 1's FINAL `shared/types/authorization.ts`. Unit 2 supplies real values
where the stand-in supplied `'ALL'`. That the shapes need no change is the evidence that the X-1
stand-in pattern worked; if Unit 2 had needed to widen them, that would have been a Unit 1 defect.

### 3.3 Import types

```
ImportKind          = 'MEMBER' | 'PROJECT'

ColumnSpec          { header, required, description }   -- drives BOTH parse and template (BR-IM-26)

ParsedRow           { lineNumber, values: Record<string,string> }

RowFailure          { lineNumber, reasons: string[] }   -- ALL reasons (BR-IM-12)
RowConflict         { lineNumber, naturalKey, existing: { kind, id, label } | { lineNumber } }
                                                        -- existing record, or the earlier row (BR-IM-09)

ImportResult        { kind, totalRows, created, failed: RowFailure[],
                      conflicts: RowConflict[], ignoredColumns: string[], outcome }

ImportOutcome       = 'CREATED' | 'NOTHING_CREATED' | 'FILE_REFUSED'
```

`ImportOutcome` exists to keep three states distinct that a naive design collapses into "0 created":

| Outcome | Meaning |
|---|---|
| `CREATED` | at least one row was written |
| `NOTHING_CREATED` | the file was valid and processed, but every row failed or conflicted (BR-IM-18) |
| `FILE_REFUSED` | the file never got as far as row processing — bad format, missing columns, over limits |

### 3.4 Account link types

```
AccountMemberLink   { accountId, username, memberId, memberName, orgUnitName }
LinkRefusal         { reason: 'ACCOUNT_ALREADY_LINKED' | 'MEMBER_ALREADY_LINKED',
                      existing: { accountId?, username?, memberId?, memberName? } }
```

The refusal **names** the existing link (BR-L-02/03), because "already linked" without saying to what
leaves the admin no next action.

---

## 4. Column Contracts

Single source of truth for parsing **and** template generation (BR-IM-26).

### 4.1 Member import

| Header | Required | Maps to | Notes |
|---|---|---|---|
| `full_name` | ✅ | `member.full_name` | |
| `email` | ✅ | `member.email` | natural key fallback (BR-IM-06) |
| `external_ref` | | `member.external_ref` | preferred natural key when present |
| `org_unit` | ✅ | `member.org_unit_id` | resolved by name (BR-IM-13) |
| `employment_type` | ✅ | `member.employment_type` | `ON_ROLL` \| `OFF_ROLL` |
| `role` | ✅ | `member.role_id` | resolved against `ROLE` reference data |
| `skills` | | `member_skill` | semicolon-separated; each resolved against `SKILL` |
| `vendor_name` | conditional | `member.vendor_name` | required when `OFF_ROLL` (BR-M-06) |
| `contract_start_date` | conditional | `member.contract_start_date` | required when `OFF_ROLL` |
| `contract_end_date` | conditional | `member.contract_end_date` | required when `OFF_ROLL` |
| `contract_status` | conditional | `member.contract_status` | required when `OFF_ROLL` |

**Semicolon**, not comma, separates skills — a comma inside a CSV field forces quoting, and the most
common hand-edit error is an unquoted comma silently shifting every subsequent column.

**No rate, cost, contract-value or PO column exists** (BR-M-09). Per BR-IM-04 such a column in the
source file is ignored and named in the notice, so the omission is visible to the admin rather than
silent.

### 4.2 Project import

| Header | Required | Maps to | Notes |
|---|---|---|---|
| `code` | ✅ | `project.code` | natural key (BR-IM-07) |
| `name` | ✅ | `project.name` | |
| `project_type` | ✅ | `project.project_type_id` | resolved against `PROJECT_TYPE` |
| `owning_org_unit` | ✅ | `project.owning_org_unit_id` | resolved by name |
| `start_date` | ✅ | `project.start_date` | |
| `end_date` | | `project.end_date` | open-ended when absent |
| `status` | | `project.status` | defaults to `OPEN` |

### 4.3 Dates and booleans

`YYYY-MM-DD` only, consistent with AS-03's date-only UTC convention. Locale-dependent formats
(`DD/MM/YYYY` vs `MM/DD/YYYY`) are **refused, not guessed** — a guess silently misreads dates for half
the world, and an allocation system that is wrong about dates is worse than one that refuses the file.

---

## 5. Entity Relationship Impact

No new tables, no new columns, no new constraints. Unit 2 exercises existing relationships:

```
user_account.home_org_unit_id  --> org_unit          BR-R-08/09  (scope root, finally read)
user_account.linked_member_id  --> member            US-ACC-04   (finally written)
org_unit.parent_org_unit_id    --> org_unit          BR-R-08     (subtree, max 2 levels)
member.org_unit_id             --> org_unit          BR-R-12     (assignment scope, member side)
project.owning_org_unit_id     --> org_unit          BR-R-12     (assignment scope, project side)
```

**BR-R-12 is the one repository change with real teeth.** Unit 1's `assignment-repository.ts`
`scopePredicates` currently resolves scope through the member's org unit **alone**, with a comment
justifying exactly that. Under Q3:C it becomes member **OR** project — an `OR` inside the existing
`AND` chain, and the Unit 1 comment must be updated rather than left contradicting the code.

---

## 6. Corrections to Approved Artifacts

| Artifact | Says | Corrected to | Why |
|---|---|---|---|
| `unit-of-work.md` §"Database entities owned" (Unit 2) | "`RolePermission` (configuration)" | **Unit 2 owns no database entity; no migration required** | Q1:A makes the matrix a code constant |
| `unit-of-work.md` Unit 2 story list | 13 stories outstanding | **11 outstanding; US-ASN-04 and US-VIS-05 completed during Unit 1** | Q15:A |
| `core-domain/.../code-generation-summary.md` §8 | "All 30 stories" | **32 stories** — adds US-ASN-04, US-VIS-05 | Q15:A |
| `stories.md`, `aidlc-state.md` unit story counts | 30 / 13 | **32 / 11** | Q15:A |

**FR-I-01 is recorded as PARTIALLY satisfied** (CSV yes, Excel deferred) per Q7:A — the first Must
requirement in the project not fully met, and it is recorded as a gap rather than counted as complete.

**FR-R-07 and FR-R-03 are NOT amended.** CQ2:B keeps them as written: organisation-wide reach for a
Resource Manager comes from attaching them to a root org unit, not from exempting the role.
