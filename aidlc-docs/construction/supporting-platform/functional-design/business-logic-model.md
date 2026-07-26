# Business Logic Model — `supporting-platform` (Unit 2)

**Unit**: 2 of 2 · **Stage**: Functional Design
**Also discharges**: R2 folded-in NFR obligations **4** (server-side authorization enforcement points)
and **5** (client-agnostic API boundary verification)

---

## 1. What This Unit Actually Does

Two things, plus five thin frontend additions.

1. **Replaces the authorization stand-in with real policy** — the X-1 resolution. Nothing in Unit 1
   changes except the one composition-root line and one repository predicate.
2. **Adds bulk import** — the only wholly new capability in the unit.

The five Should-priority extensions are frontend-only or already done (see
`../../plans/supporting-platform-functional-design-plan.md` §0).

---

## 2. C-09 Authorization — Scope Resolution

### 2.1 `resolveScope(identity) → AccessScope`

The one place a session becomes an authorization context. Called once per request, never rebuilt from
anything the client sent (BR-R-06).

```
resolveScope(identity):
  role         := identity.role                 -- from the session, server-side
  ownMemberId  := identity.linkedMemberId       -- may be null

  switch role:
    ADMIN, EXECUTIVE:
        orgUnitIds := 'ALL'                                          -- BR-R-10

    RESOURCE_MANAGER:
        if identity.homeOrgUnitId is null:  orgUnitIds := []          -- BR-R-11, fail closed
        else if homeOrgUnit is a ROOT unit: orgUnitIds := 'ALL'       -- BR-R-09, CQ2:B
        else:                               orgUnitIds := subtree(homeOrgUnitId)

    TEAM_LEAD:
        if identity.homeOrgUnitId is null:  orgUnitIds := []          -- BR-R-11, fail closed
        else:                               orgUnitIds := subtree(homeOrgUnitId)   -- BR-R-08

    TEAM_MEMBER:
        orgUnitIds := 'ALL'          -- irrelevant: restrictToMemberId does the work
                                     -- and BR-R-18 refuses the unlinked case outright

  return { role, orgUnitIds, ownMemberId }
```

`subtree(id)` = the unit itself plus its direct children. Org units are **exactly two levels**
(BR-O-01), so this is one non-recursive query and `OrgUnitComponent.resolveScope` in Unit 1 already
computes it. Unit 1's stand-in deliberately did **not** call it; Unit 2 does.

**Why `[]` and not `'ALL'` for a NULL home org unit.** `'ALL'` is the *unrestricted* sentinel. A
misconfigured account that resolves to `'ALL'` gets everything — the exact opposite of the intent. An
empty array combined with BR-R-17 produces an always-false predicate and the user sees nothing. Fail
closed is the only safe direction, and this is precisely the trap Unit 1 already fell into and
documented for the unlinked `TEAM_MEMBER` case.

**`RESOURCE_MANAGER` is `'ALL'` when rooted, not `subtree(root)`.** These differ: `subtree(root)` is
the root plus its children, which is every unit *today* but silently excludes any unit added later at
another root. `'ALL'` means unrestricted and stays correct.

### 2.2 `toScopeFilter(scope) → ScopeFilter`

```
toScopeFilter(scope):
  if scope.role == TEAM_MEMBER:
      return { orgUnitIds: 'ALL', restrictToMemberId: scope.ownMemberId }   -- BR-R-04
  return { orgUnitIds: scope.orgUnitIds, restrictToMemberId: null }
```

`TEAM_MEMBER` keeps `'ALL'` for org units on purpose: `restrictToMemberId` is strictly narrower than
any org filter, so ANDing an org restriction on top is dead weight — and a `TEAM_MEMBER` whose linked
member sits outside their own `home_org_unit_id` would otherwise see nothing at all, including
themselves.

### 2.3 `canRead` / `canWrite`

```
canRead(scope, resource, target):
  if scope.role == TEAM_MEMBER and scope.ownMemberId is null:  return false   -- BR-R-18
  if not MATRIX[scope.role][resource].read:                    return false   -- BR-R-14
  if target is null:                                           return true    -- collection request
  return targetInScope(scope, resource, target)

canWrite(scope, resource, target):
  if not MATRIX[scope.role][resource].write:                   return false   -- BR-R-14
  if target is null:                                           return true
  return targetInScope(scope, resource, target)

targetInScope(scope, resource, target):
  if scope.orgUnitIds == 'ALL' and scope.restrictToMemberId is null:  return true
  if scope.restrictToMemberId is not null:
      return target.memberId == scope.restrictToMemberId
  if target.orgUnitId is null:  return true          -- non-org-scoped resource
  return target.orgUnitId in scope.orgUnitIds
```

`canWrite` does **not** repeat the `TEAM_MEMBER`-unlinked check, because no role reachable there has
write on anything (`TEAM_MEMBER` writes nothing at all in the matrix). The check would be unreachable,
and an unreachable guard reads as a live one.

### 2.4 Where `canRead` stops being enough

`canRead` guards a **single known target**. Collection endpoints pass `null` and are protected by the
`ScopeFilter` inside the query instead (BR-R-07). Both mechanisms are needed and neither substitutes
for the other:

| Request shape | Mechanism | Failure if omitted |
|---|---|---|
| `GET /api/members/:id` | `assertCanRead` + `findById(id, filter)` | out-of-scope record readable by id |
| `GET /api/members?...` | `ScopeFilter` inside SQL | every member returned |
| `POST /api/assignments` | `assertCanWrite` on the resolved target | scoped user writes outside scope |

**The `findById(id, filter)` call is what makes the single-target path safe even if `assertCanRead` were
forgotten** — the filter is in the query, so the row is never fetched, and the endpoint returns 404 per
BR-R-16. Defence in depth here is deliberate: the repository is the last line and it holds.

---

## 3. R2 Obligation 4 — Enforcement Point Enumeration

Every path by which data leaves the system, and what enforces scope on it. This table is the
obligation; its purpose is to make "did we miss one?" answerable by reading rather than by hoping.

| # | Path | Read enforcement | Write enforcement |
|---|---|---|---|
| 1 | `member` by id | `MemberRepository.findById(id, filter)` | `assertCanWrite(MEMBER, {orgUnitId})` |
| 2 | `member` search / list | `scopePredicates` in SQL | — |
| 3 | `member` `/me` | `restrictToMemberId` | — |
| 4 | `member` `/assignable` | `scopePredicates` | — |
| 5 | `member` `/expiring-contracts` | `scopePredicates` | — |
| 6 | `project` by id | `ProjectRepository.findById(id, filter)` | `assertCanWrite(PROJECT, {orgUnitId})` |
| 7 | `project` search / `/open` | `scopePredicates` | — |
| 8 | `assignment` by id | `AssignmentRepository.findById(id, filter)` | `assertCanWrite(ASSIGNMENT, target)` |
| 9 | `assignment` by member / by project | `scopePredicates` (**member OR project**, BR-R-12) | — |
| 10 | `allocation` current view | member-level `scopePredicates`; **totals unreduced** (BR-R-13) | — |
| 11 | `allocation` availability search | member-level `scopePredicates` | — |
| 12 | `allocation` over-allocated | member-level `scopePredicates` | — |
| 13 | `allocation` unallocated (bench) | member-level `scopePredicates` | — |
| 14 | `allocation` member timeline | `findById` on the member first, then unreduced totals | — |
| 15 | `allocation` historical / as-of | `scopePredicates` on the history query | — |
| 16 | `reference data` | matrix only — not org-scoped | `assertCanWrite(REFERENCE_DATA)` |
| 17 | `org unit` | matrix only — org tree is not itself scoped | `assertCanWrite(ORG_UNIT)` |
| 18 | `user account` | `ADMIN` only via matrix | `ADMIN` only |
| 19 | **account-member link** | `ADMIN` only | `ADMIN` only (BR-L-06) |
| 20 | **import** | `ADMIN` only (BR-IM-22) | `ADMIN` only |
| 21 | `session` sign-in / sign-out | pre-authorization by nature | — |
| 22 | `/health` | unauthenticated by design; exposes no domain data | — |

### Two entries that deserve scrutiny

**#17 — the org tree is not itself scoped.** Any signed-in user with `ORG_UNIT` read can list all org
units, including units they cannot see the data of. This is deliberate: org unit names are needed to
render filters and forms, and they are organisational structure, not member data. **It does mean a
Team Lead can enumerate the org chart.** Recorded as accepted, not overlooked.

**#10 and #14 — BR-R-13 lives here.** These are the paths where a scope filter applied one layer too
deep produces a truthful-looking but wrong number. Scope decides **which members** appear; it must not
decide **which of a visible member's assignments** are summed.

### The invariant, stated once

> No route handler builds a `ScopeFilter`. It arrives from `resolveScope(identity)` → `toScopeFilter`,
> both server-side, both derived from the session (BR-R-06). No request body, query parameter, header
> or cookie contributes to it. A handler that accepts an `orgUnitIds` parameter and passes it into a
> filter would defeat the entire unit — so **no handler accepts one.**

---

## 4. Worked Example — the case that decides the design

The scenario from Clarification Question 1, resolved by **CQ1:A**.

```
Org units:  Organisation (root)
              +-- Platform
              +-- Sales

Members:    Ada    in Platform
Projects:   PLAT-1 owned by Platform
            DATA-2 owned by Sales

Assignments: Ada -> PLAT-1  80%   2026-08-01..2026-08-31
             Ada -> DATA-2  50%   2026-08-01..2026-08-31   (override)

Caller:     Lee, TEAM_LEAD, home_org_unit_id = Platform
```

**Scope resolution**: `role=TEAM_LEAD`, `orgUnitIds=[Platform]` (Platform has no children),
`ownMemberId=null` → filter `{ orgUnitIds: [Platform], restrictToMemberId: null }`.

**What Lee sees**, per BR-R-12 and BR-R-13:

| Question | Answer | Rule |
|---|---|---|
| Is Ada visible? | Yes — `member.org_unit_id = Platform` | BR-R-08 |
| Is the PLAT-1 assignment visible? | Yes — member in scope *and* project in scope | BR-R-12 |
| Is the DATA-2 assignment visible? | **Yes — the member side matches** | BR-R-12 |
| Is DATA-2 **named**? | **Yes** | **CQ1:A** |
| Ada's August total? | **130%, over capacity** | BR-R-13 |
| Can Lee modify either assignment? | **No** — `TEAM_LEAD` writes nothing | BR-R-15 |

**And the mirror case.** Sam is a member of Sales, assigned to PLAT-1 which Platform owns:

| Question | Answer | Rule |
|---|---|---|
| Is Sam visible in Lee's member list? | **No** — Sam's org unit is Sales | BR-R-08 |
| Is Sam's PLAT-1 assignment visible to Lee? | **Yes** — the project side matches | BR-R-12 |
| So Lee learns Sam's name? | **Yes, via that assignment** | derived, §BR-R-12 consequence |

That last row is the price of Q3:C, and it is the right price: you cannot staff a project you own
without seeing who is on it. It is recorded rather than discovered later.

### Counter-example — what a wrong implementation produces

Filtering assignments by scope *before* summing, instead of selecting members by scope and summing all
of their assignments:

```
WRONG:  Ada -> 80% booked, 20% free       "Ada has capacity"
RIGHT:  Ada -> 130% booked, over capacity  "Ada is over-booked"
```

The wrong version is not a cosmetic difference. It reports free capacity on a person who has none,
which is the single failure this application exists to prevent. **A test must assert the 130%, and it
must fail if the sum is taken after the scope filter.**

---

## 5. C-10 Import — the Pipeline

Five phases, strictly ordered. Everything before phase 4 is read-only.

```
  [1] FILE GATE          format, size, row count, header  ---> FILE_REFUSED
        |                                                       (BR-IM-01,02,03,05)
        v
  [2] PARSE              CSV -> ParsedRow[] with line numbers
        |                unknown columns noted and ignored     (BR-IM-04)
        v
  [3] VALIDATE           per row, read-only:                   (BR-IM-11..15)
        |                  a. required fields present
        |                  b. reference data / org unit resolved from ONE batched lookup
        |                  c. Unit 1 component validation reused
        |                  d. natural key vs existing records  -> conflicts
        |                  e. natural key vs earlier rows      -> conflicts
        |                ALL reasons collected per row, never just the first
        v
      partition: valid[] | failed[] | conflicts[]
        |
        +-- valid is empty ------------------------> NOTHING_CREATED  (BR-IM-18)
        |
        v
  [4] WRITE              ONE transaction, all valid rows       (BR-IM-16)
        |                any DB failure -> full rollback, nothing created
        v
  [5] REPORT             counts + failed[] + conflicts[] + ignoredColumns
                         response only, no persisted record    (BR-IM-19)
                         log counts and reasons, NEVER contents (BR-IM-24)
```

### 5.1 Why validation is a separate read-only pass

It makes BR-IM-17 true by construction: the transaction contains writes only, so it is short, and a
validation failure cannot roll back work that already succeeded. It also means the conflict check in
3d sees a stable pre-import state — checking conflicts *during* the write would have each row
conflicting against rows inserted earlier in the same transaction, which is what 3e handles
deliberately and in memory instead.

### 5.2 Batched reference-data resolution (BR-IM-14)

```
collect the distinct set of every org-unit name, role name, project-type name and
skill name across ALL rows
  -> ONE query per reference kind, by lower(name)
  -> build name -> id maps
  -> resolve every row from the maps, no further queries
```

A 2,000-row file therefore issues about **four** lookup queries, not thousands. Naive per-row
resolution here is the textbook N+1 and is prohibited by R2-1 rule 2. It would also be *slow enough to
look like a hang* in a synchronous request, which is how this particular N+1 gets shipped.

### 5.3 Duplicate detection (BR-IM-06 to BR-IM-10)

```
existing := ONE batched query per kind:
              members  where lower(email) IN (...) OR external_ref IN (...)
              projects where lower(code)  IN (...)

seen := empty map                        -- natural key -> first line number

for each row in file order:
    key := naturalKey(row)               -- external_ref if present else email; code for projects
    if key in existing:  conflict(row, existing record)          -- BR-IM-08
    else if key in seen: conflict(row, earlier line seen[key])   -- BR-IM-09
    else:                seen[key] := row.lineNumber; valid.push(row)
```

**File order matters and is preserved.** BR-IM-09 says the *first* occurrence wins, so a
non-deterministic iteration order would make a re-run of the same file import a different row. The
report names the earlier line number, which is what lets the admin find and delete the right duplicate.

### 5.4 Writing through Unit 1 (X-2)

Import must **not** write member and project rows directly, or every BR-M-* and BR-P-* rule would need
a second implementation that drifts from the first (BR-IM-11).

Unit 1's components take repositories by constructor injection, and `createRepositories(dbOrTx)`
accepts a transaction. So the transaction-scoped write is:

```
db.transaction().execute(async (tx) => {
    repos := createRepositories(tx)              -- same bundle, bound to the transaction
    comp  := MemberComponent(repos.members, repos.orgUnits, refData(repos), autoEnder(repos))
    for each valid row: await comp.create(row, ADMIN_SCOPE)
})
```

No Unit 1 code changes for this. The seam already exists because Unit 1 put transaction boundaries in
the service layer (R2-1 rule 3) rather than inside components.

**BR-A-24's member lock is not involved**: import creates members and projects, never assignments, so
no capacity check and no lock contention arises. Stated because the absence of a lock in a bulk write
path is otherwise the kind of thing that looks like an oversight.

### 5.5 Failure modes and what each returns

| Situation | Outcome | Created | HTTP |
|---|---|---|---|
| `.xlsx` uploaded | `FILE_REFUSED` | 0 | 400, "save as CSV" |
| over 2,000 rows or 5 MB | `FILE_REFUSED` | 0 | 413, names limit and actual |
| required column missing | `FILE_REFUSED` | 0 | 400, **all** missing columns listed |
| header only, no data rows | `FILE_REFUSED` | 0 | 400 |
| all rows invalid | `NOTHING_CREATED` | 0 | **200** with the report |
| all rows conflict (re-run) | `NOTHING_CREATED` | 0 | **200** with the report |
| mixed | `CREATED` | n | 200 with the report |
| DB error mid-write | rollback | **0** | 500, generic message, real error logged |
| non-ADMIN caller | — | 0 | **403** (permitted resource, forbidden operation) |

A processed-but-fruitless import is **200, not 4xx**: the request was well-formed and the answer is a
report. Returning 4xx there would make the client treat a legitimate result as a protocol failure and
discard the report the user needs.

---

## 6. US-ACC-04 — Account-to-Member Linkage

```
link(accountId, memberId, callerScope):
  assertCanWrite(callerScope, USER_ACCOUNT, null)         -- ADMIN only (BR-L-06)

  account := userAccounts.findById(accountId)   or 404
  member  := members.findById(memberId, UNRESTRICTED)  or 404   -- Admin is unrestricted

  if account.linkedMemberId is not null:
      refuse ACCOUNT_ALREADY_LINKED, naming that member          -- BR-L-02
  if some other account has linkedMemberId == memberId:
      refuse MEMBER_ALREADY_LINKED, naming that account          -- BR-L-03

  set account.linkedMemberId := memberId                          -- BR-L-01 index enforces
  -- home_org_unit_id deliberately untouched                      -- BR-L-05
```

`unlink` clears the column and is permitted (BR-L-04). Because a `TEAM_MEMBER` account with no link is
refused everything (BR-R-18), **unlinking a team member's account revokes all their access**. The
confirmation must say so in those terms before the act, not describe it as "removing a link".

The partial unique index on `linked_member_id` already makes BR-L-01 a database guarantee, so the
in-application check exists to produce a *useful message*, not to be the enforcement. If the check and
the index ever disagree, the index wins and the user gets a conflict error — which is the correct
direction for the two to fail in.

---

## 7. The X-1 Resolution — Exact Procedure

Unit 1's stand-in header specifies four steps. Executed here:

1. Implement `AuthorizationComponent` at `backend/src/supporting-platform/authorization/` against the
   **unchanged** `IAuthorizationComponent`.
2. Repoint the composition root — **one line** in `backend/src/core-domain/services/index.ts`:
   ```
   -  const AUTHORIZATION: IAuthorizationComponent = new PermissiveAuthorizationStandIn();
   +  const AUTHORIZATION: IAuthorizationComponent = new AuthorizationComponent(orgUnits);
   ```
3. **DELETE `backend/src/core-domain/authorization-standin/` entirely**, including its tests and the
   `STAND_IN_ENFORCEMENT_GAPS` export. A stand-in left in the tree is a stand-in that gets wired up
   again by accident.
4. **Verify no Unit 1 caller changed.** `git diff --stat` over `core-domain/` must show only
   `services/index.ts`.

### The one legitimate exception to step 4

`shared/repository/assignment-repository.ts` **does** change, for BR-R-12 (member OR project). This is
not an interface change and not a Unit 1 caller change — it is the scope-filter application that
`unit-of-work.md` explicitly assigns to Unit 2 as "C-11 extensions — scope-filter application inside
queries". Its existing comment justifies member-only scoping and **must be rewritten**, not left
contradicting the code beneath it.

If **anything else** under `core-domain/` needs to change, that is a Unit 1 design defect and must be
recorded as one — not quietly absorbed into Unit 2.

### Verification that the gap actually closed

The claim "org-scope is now enforced" must be proven by tests that **fail against the stand-in**. The
method Unit 1 established after the BR-A-24 false positive applies directly: a test that passes with
the guard removed is worse than no test.

| Test | Must fail against the stand-in |
|---|---|
| Team Lead lists members → sees only their subtree | ✅ stand-in returns all |
| Team Lead reads out-of-scope member by id → 404 | ✅ stand-in returns 200 |
| Executive attempts any write → 403 | ❌ stand-in already enforces this |
| Team Member reads another's assignments → refused | ❌ stand-in already enforces this |
| Team Lead sees in-scope member's **full 130%** total | ✅ new behaviour either way |
| Resource Manager rooted at a child unit is confined | ✅ stand-in returns all |

The two ❌ rows are already-enforced rules; they are regression tests, and labelling them as proof of
the X-1 fix would be a false claim about what was verified.

---

## 8. R2 Obligation 5 — Client-Agnostic API Boundary (US-ENB-04)

Verification that Unit 2's new endpoints uphold the invariant Unit 1 established.

| Property | Import endpoints | Link endpoints |
|---|---|---|
| No session state beyond the session cookie | ✅ | ✅ |
| Request fully describes itself | ✅ multipart file + kind | ✅ two ids |
| Response is complete, needs no prior call to interpret | ✅ counts + line numbers + reasons | ✅ named refusals |
| No HTML, no redirect, no frontend-shaped payload | ✅ JSON report | ✅ JSON |
| Usable by a script with no browser | ✅ `curl -F` | ✅ |
| No presentation concern in the payload | ✅ line numbers and reasons, not markup | ✅ |
| Errors are machine-readable | ✅ typed outcome + reason codes | ✅ typed reason codes |

`ImportOutcome` and `LinkRefusal.reason` are **enumerated codes, not prose**, precisely so a
non-browser client can branch on them. The human-readable text accompanies the code; it never replaces
it.

The multipart upload is the one departure from Unit 1's all-JSON surface. It is warranted — a file *is*
the payload — and a `curl -F file=@members.csv` invocation is as client-agnostic as a JSON POST. The
template download is likewise a `text/csv` response rather than JSON, for the same reason.

---

## 9. Interface Deviations from Application Design

| # | Design says | Built as | Why |
|---|---|---|---|
| 1 | Unit 2 owns `RolePermission` (configuration) | **No entity, no migration** | Q1:A — a code-constant matrix. Documented in `domain-entities.md` §1. |
| 2 | S-02 AccessControlService "full implementation" | Real policy in **C-09**; S-02 stays the thin per-request resolver Unit 1 built | The policy belongs with the component that owns the matrix; S-02 resolving scope per request is already correct and needs no change. |
| 3 | C-11 extensions for "import transaction handling" | Import owns its own transaction via `createRepositories(tx)`; **no repository change** | The seam already exists. Only `assignment-repository.ts` changes, and for BR-R-12, not for import. |

---

## 10. Open Design Gaps Carried Forward

Stated rather than left to be discovered.

| Gap | Consequence | Decided by |
|---|---|---|
| **FR-I-01 partially satisfied** — CSV only, no Excel | An admin with an `.xlsx` must save-as first. First Must requirement in the project not fully met. | Q7:A |
| **No import audit trail** | A bulk write of 2,000 records leaves only log counts. Who imported what is not reconstructable. | Q10:A |
| **FR-R-04 "request assignment changes" unimplemented** | A Team Lead has no in-application route to ask for a change. | Q6:A |
| **Org tree readable by all roles** | A Team Lead can enumerate the org chart, though not the data inside it. | §3, accepted |
| **Team Lead can learn out-of-org member names** via assignments to projects their unit owns | Intended consequence of Q3:C, bounded to members on their own projects. | Q3:C / CQ1:A |
| **Org-scope enforcement exercised by two roles only** (`TEAM_LEAD`, and `RESOURCE_MANAGER` when not rooted) | Narrow blast radius, but also narrow test coverage unless deliberately tested. Both must be tested. | CQ2:B |
| **Synchronous 2,000-row import** | A large file holds a request open for its duration. Acceptable at the stated need of ~200 rows. | Q13:A |
