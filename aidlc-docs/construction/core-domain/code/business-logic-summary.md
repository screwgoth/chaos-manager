# Business Logic Summary — `core-domain`

**Unit**: 1 of 2 · **Plan steps**: 7–13 · **Branch**: `aidlc/construction-core-domain`
**Verification**: `npx tsc --noEmit` clean · `npx jest` **352 passed / 16 suites** with PostgreSQL 16 (296 passed + 56 skipped without a database)

---

## 1. The nine components

All under `backend/src/core-domain/`.

| Component | Directory | Rules | Tests |
|---|---|---|---|
| C-01 Member | `member/` | BR-M-01…18 | 28 |
| C-02 Project | `project/` | BR-P-01…11 | 24 |
| C-03 Assignment | `assignment/` | BR-A-01…23 | 29 (real DB) |
| C-04 Allocation | `allocation/` | BR-A-07/08, BR-V-* | 54 |
| C-05 OrgUnit | `org-unit/` | BR-O-01…06 | 24 |
| C-06 ReferenceData | `reference-data/` | BR-C-01…09 | 21 |
| C-07 Identity | `identity/` | BR-AU-01…07, 13…15 | 31 |
| C-08 Session | `session/` | BR-AU-08…12 | 33 |
| C-09 Authorization **stand-in** | `authorization-standin/` | BR-R-01…04, 06 | 12 |

Plus `worked-examples.test.ts` (17), `redaction.test.ts` (17), and the shared-utility and
repository suites.

## 2. The load-bearing algorithm

`C-04 AllocationComponent` is **pure** — no I/O, no state, no clock (U1-NFR-M-03).
Repositories fetch; C-04 computes. That separation is what makes the highest-risk logic in
the system testable without a database, and it is worth defending: the moment this file
needs a query, the property that makes it verifiable is gone.

A member's total allocation is not one number. It changes on every day an assignment starts
or ends, so the range is cut into segments with a constant total each:

1. Collect boundaries — every assignment start, and every assignment **end + 1 day**.
2. Sort, de-duplicate, clip to the window.
3. Between consecutive boundaries the active set cannot change, so each interval has one
   total, summed as exact integer tenths.
4. Merge adjacent segments with identical totals and contributors.

**The `end + 1` is the crux.** Ranges are inclusive (AS-03): an assignment ending 31 March
still consumes capacity *on* 31 March, so the total changes on 1 April. Using the end date
itself would end each segment a day early and silently drop the final day of every
assignment from every total — a one-day under-count that is very hard to see in a UI.

The §1 worked example from `business-logic-model.md` is encoded verbatim in
`worked-examples.test.ts` and matched on first run.

## 3. Bi-temporality — the part most likely to be broken later

`assignment` holds current values in **valid time**. `assignment_history` holds what the
system believed and when, in **transaction time**.

`findAsOf` (Path B) is the only correct way to answer a historical question. Reading current
rows returns *today's* values labelled with yesterday's dates — a confidently wrong answer,
which is worse than an error because nothing looks broken.

The test pins both sides: an assignment at 50% edited to 80% answers **50%** for 15 March
via Path B, and the test also asserts Path A **would** answer 80%. Without that second
assertion the first could pass for the wrong reason.

Every mutation writes a history revision **in the same transaction** as the assignment row
(BR-A-16), so the current row always equals the revision with `supersededAt IS NULL`
(BR-A-17). The partial unique index `history_one_current_revision` is what actually
guarantees it under concurrency; the application ordering merely satisfies it.

## 4. Decisions taken during construction, with reasons

Recorded because each is a place where the obvious alternative is wrong.

| Decision | Why the alternative fails |
|---|---|
| `savedAsOverride` derived from DETECTION, never the caller's flag (BR-A-11) | BR-A-12 keeps the flag visible forever; a falsely-flagged row never recovers |
| Member and project IMMUTABLE on an assignment | Moving one rewrites two members' capacity history in a single step with no record |
| Deactivation ends assignments BEFORE setting status | A cascade failure must leave the member ACTIVE and retryable, not inactive with dangling assignments |
| Reparenting an org unit REFUSED | It would silently change who can see the members and the scope historical allocations were computed under |
| `resolveScope` fails CLOSED (empty list, never `'ALL'`) | Seeing nothing is a support ticket; seeing everything is a breach |
| `unallocatedMembers` means unallocated for the WHOLE range | Someone booked only in February is not on the bench for Q1 |
| `availabilityFor` reports min AND max | They answer different questions; an average answers neither |
| `memberTimeline.isGap` distinguishes 0% from partial | A UI rendering them alike makes an idle month look busy |
| BR-AU-07 checked AFTER the password | Reporting "inactive" first confirms the username exists — the oracle BR-AU-05 closes |
| `canRead` refuses an UNLINKED TEAM_MEMBER | The spec's `return true` assumes a linked member; unlinked would read everyone |
| Session identity re-read every request | A cached ADMIN role is a privilege-escalation window as wide as the idle timeout |
| Uniqueness left to database indexes | A read-then-write check in application code is a race |
| Argon2id for passwords, SHA-256 for tokens | A 256-bit random token has no guess space to slow down; per-request Argon2id costs ~40 ms for nothing |

## 5. Defects found during Steps 7–13

Every one was found by running something, not by inspection.

| # | Defect | Found by | Origin |
|---|---|---|---|
| 1 | `Generated<ColumnType<…>>` nesting broke every timestamp write (20 type errors) | `tsc` at Step 4 | Step 3 |
| 2 | Malformed id → raw pg error → unhandled **500** instead of 404 | Integration test at Step 5 | Step 4 |
| 3 | `status = 'ACTIVE'` filter in capacity queries **violated BR-A-07/BR-A-20**, dropping the elapsed portion of ended assignments from historical totals | Reading the rules at Step 9 | Step 4 |
| 4 | N+1 in `ProjectComponent.listOpen` — one query per project | Self-review at Step 8 | Step 8 |
| 5 | Two integration suites dropped each other's schema in parallel (27 spurious failures) | Full test run at Step 9 | Test config |
| 6 | ReferenceData had no `delete`, but BR-C-06 refuses deletion only of *referenced* entries | Reading the rules at Step 7 | Step 4 |
| 7 | **BR-A-24 concurrency test was a FALSE POSITIVE** — passed with the lock neutered | Neutering the lock at Step 10 | Step 10 |
| 8 | `redactSecrets` / `LOG_REDACT_PATHS` had **no tests at all** | Audit at Step 12 | Step 2 |
| 9 | Argon2 parameters **hardcoded** while `.env.example` and `config.argon2` exposed them — a silent no-op on a security control | Audit at Step 12 | Step 11 |

**Defect 7 changed how safety properties are verified here.** The obvious concurrency test —
two `create` calls via `Promise.all`, assert one fails — passed even with
`lockMemberForUpdate` removed, because the calls never interleave at the critical point.
A test named "serialises…" that passes without serialisation is worse than no test. It was
deleted and replaced with one that forces the interleaving explicitly, then **confirmed to
fail with the lock neutered**. Verifying a guard now means removing it and watching the test
go red.

## 6. What is NOT enforced yet — X-1

> ⚠️ While `core-domain` is the only completed unit, a **TEAM_LEAD or RESOURCE_MANAGER sees
> members, projects and allocations across ALL org units.** BR-R-05 is not enforced.

Acceptable only under the single-track, no-external-users assumption (unit plan Q7:A). If
pilot users get access before `supporting-platform` completes, either switch to a
restrictive stand-in or pull C-09 into Unit 1.

What the stand-in **does** enforce: BR-R-01 (write only ADMIN / RESOURCE_MANAGER), BR-R-02
(EXECUTIVE read-only), BR-R-03 (TEAM_LEAD cannot modify assignments), BR-R-04 (TEAM_MEMBER
sees only own data, via `restrictToMemberId`), BR-R-06 (decisions from the server-resolved
session, by construction).

The enforcement **mechanism** is complete and tested — only the policy that populates
`ScopeFilter` is deferred. `authorization-standin.test.ts` deliberately asserts
`orgUnitIds === 'ALL'`, pinning the gap so the tests that must change when Unit 2 lands are
visible in one place.

**Replacement**: implement C-09 in `supporting-platform/authorization/` against the
unchanged interface, repoint the composition root, then **delete the stand-in directory
entirely** — a stand-in left in the tree gets wired up again by accident.

## 7. Interface deviations from `component-methods.md`

Both deliberate, both recorded rather than silently applied.

1. **C-04 takes pre-fetched data.** The designed signatures include `scope: ScopeFilter` and
   `Page<…>` returns, which require I/O — incompatible with U1-NFR-M-03's purity
   requirement. Resolved as the business-logic model specifies: repositories fetch, C-04
   computes. Scoping and pagination belong to `AllocationQueryService`.
2. **C-05/C-06 gained `delete`.** BR-C-06 and BR-O-05 refuse removal of *referenced*
   entries, which necessarily means unreferenced ones must be deletable.

## 8. Carried forward

- **`countReferences` issues one query per referencing table** (four parallel counts).
  Acceptable for admin-only screens; would need consolidating on a hot path.
- **`listAssignable(onDate)` ignores its date parameter.** Phase 1 has no dated activation —
  `status`/`deactivatedOn` are a single current state, so filtering on the date would imply
  a history the schema does not record. Noted in code rather than silently ignored.
- **`findExpiringContracts` filters in application code.** The off-roll set is small; move
  into SQL if the member count reaches a few thousand.
