# Repository Layer Summary — `core-domain`

**Unit**: 1 of 2 (`core-domain`)
**Plan steps**: 4 (generation), 5 (tests), 6 (this document)
**Branch**: `aidlc/construction-core-domain`
**Verification**: `npx tsc --noEmit` clean · `npx jest` **68 passed / 5 suites** with PostgreSQL 16; **41 passed, 27 skipped** without a database

---

## 1. What exists

All files under `backend/src/shared/repository/`.

| File | Responsibility |
|---|---|
| `db.ts` | Pool/Kysely construction, the `date` parser override, `lockMemberForUpdate` (BR-A-24) |
| `schema.ts` | Kysely table interfaces — internal, never exported upward |
| `mappers.ts` | Row → domain mapping; omits `password_hash` and `token_hash` |
| `pg-errors.ts` | PostgreSQL constraint violations → `ConflictError` with a named field |
| `org-unit-repository.ts` | Two-level hierarchy, subtree resolution, reference counting (BR-O-05) |
| `reference-data-repository.ts` | Generic over ROLE/SKILL/PROJECT_TYPE; no delete method (BR-C-05) |
| `member-repository.ts` | Scoped search, batched skill fetch, contract windows |
| `project-repository.ts` | Scoped on `owning_org_unit_id`, batched summary lookup |
| `assignment-repository.ts` | **Batched overlap query**, bench anti-join, end-early |
| `assignment-history-repository.ts` | Append-with-supersede (BR-A-17), `findAsOf` (BR-A-22 Path B) |
| `user-account-repository.ts` | Credential lookup isolated to one method |
| `session-repository.ts` | Hash-only session storage (BR-AU-09) |
| `index.ts` | Public surface + `createRepositories(db)` bundle |
| `../util/ids.ts` | `isUuid` / `keepUuids` guards (see §5) |

## 2. The four rules this layer exists to enforce

**R2-1 rule 1 — scope filters inside queries (FR-R-08).** Each repository builds scope as
typed predicate factories applied in the `WHERE` clause. Nothing is fetched and trimmed.

The load-bearing detail: an **empty** permitted-org list compiles to `eb.lit(false)`, not
to an absent filter. "No filter" is precisely the failure mode that would show every row
in the table to a user with zero permitted org units. Both branches are covered by test —
`repository-sql.test.ts` asserts the compiled SQL, `repository-integration.test.ts`
asserts an empty list returns zero rows and a total of zero.

**R2-1 rule 2 — no N+1.** `findOverlapping(memberIds[], range)` takes an array and issues
ONE query. A per-member loop makes a 50-member team view 51 queries and blows the ~1 s
availability budget (U1-NFR-PE-02). Same for `findSkillIds`, `findByIds`,
`findContractWindows`, `findAsOf`, and the bench query, which is an anti-join rather than
fetch-everything-and-difference.

**R2-1 rule 4 — persistence does not leak upward.** `schema.ts` and the Kysely builder
types are not exported from `index.ts`. Nothing above this layer sees a snake_case column.

**U1-NFR-SE-06 — no string-concatenated SQL.** Every value is bound. `ilike` search
patterns wrap the `%` inside the bound *value*; the test asserts that `O'Brien` never
appears in the SQL text.

## 3. Security properties, and how each is checkable

| Property | How it is enforced | Test |
|---|---|---|
| Password hash never returned (NFR-SE-02) | Leaves via `findCredentialByUsername` only; absent from every mapper | integration: `findIdentityById` output contains no `argon2id` |
| Session token never stored (BR-AU-09) | Table holds `token_hash`; lookup is by hash; no `findByToken` exists | integration: `JSON.stringify(session)` excludes the hash |
| Expired sessions never load | `terminated_at IS NULL AND expires_at > now` **in the query** | integration: expired and terminated sessions both resolve to null |
| Deactivation locks users out | `terminateAllForUser` | — (service-layer wiring pending) |

## 4. Bi-temporality — the part most likely to be got wrong later

`assignment` holds current values in **valid time**. `assignment_history` holds what the
system believed and when, in **transaction time**.

An as-of-past query MUST use `AssignmentHistoryRepository.findAsOf` (Path B). Reading
current rows for a historical question returns *today's* values labelled with yesterday's
date — a confidently wrong answer, which is worse than an error.

The integration test proves the distinction rather than assuming it: an assignment created
at 100, then edited to 900, returns **100** when queried as of an instant between the two
revisions and **900** as of now. If someone later "simplifies" `findAsOf` to read the
`assignment` table, that test fails.

`append()` closes the previous revision *before* inserting, so the new row can claim the
`superseded_at IS NULL` slot that the partial unique index `history_one_current_revision`
protects. Under a race, one writer gets a `ConflictError` telling it to retry; the
alternative — trusting application ordering — silently produces two "current" revisions
and makes every as-of query ambiguous.

## 5. Two defects found during this step

Both were found by running things, not by inspection. Recording them because each is the
kind of bug that would have been expensive to diagnose later.

**Defect 1 — nested `ColumnType` broke every timestamp write.** `schema.ts` declared
timestamps as `Generated<ColumnType<...>>`, nesting one `ColumnType` inside another. This
defeats Kysely's select/insert/update type extraction: 20 type errors, all reported at the
call sites rather than at the declaration. Origin was Step 3; it stayed invisible until
Step 4 wrote against those columns. `Timestamp` is now a plain `Date` — `Generated`
already supplies insert-optionality.

**Defect 2 — a malformed id produced a 500 instead of a 404.** The integration test passed
`'missing-id'` to `findActiveIdsOfType` and PostgreSQL raised
`invalid input syntax for type uuid`. Ids reach repositories from client input — a path
parameter, or a submitted skill-id list — so any malformed id was an unhandled 500.

Fixed with `isUuid` / `keepUuids` guards on every id-accepting read. Dropping a
syntactically-invalid id is *correct*, not merely lenient: such an id cannot identify a
row, so excluding it yields the same result set, minus the crash. Callers compare the
returned set against what they requested, so every dropped id is still reported missing.

## 6. Test coverage

| Suite | Needs a DB | Covers |
|---|---|---|
| `tenths.test.ts` | no | Integer-tenths arithmetic, order-independence |
| `dates.test.ts` | no | Date-only UTC, inclusive ranges, boundary cases |
| `ids.test.ts` | no | UUID guards, including the exact value that failed |
| `repository-sql.test.ts` | no | Compiled SQL shape: scope in-query, bound parameters, inclusive operators |
| `repository-integration.test.ts` | **yes** | Migration, date round-trip, conflict mapping, scope exclusion, overlap boundaries, bi-temporal as-of, session lifecycle |

### Running the integration suite

```bash
docker run -d --rm --name chaos-test-db \
  -e POSTGRES_PASSWORD=testpw -e POSTGRES_DB=chaos_test \
  -p 55432:5432 postgres:16-alpine

TEST_DATABASE_URL='postgres://postgres:testpw@127.0.0.1:55432/chaos_test' npx jest
```

Without `TEST_DATABASE_URL` the suite is **skipped and reported as skipped** — never as
passing. It drops and recreates the `public` schema in `beforeAll`, so it must only ever
point at a throwaway database.

## 7. Carried forward

- **X-1 remains open.** The permissive authorization stand-in means `ScopeFilter` is
  currently `{orgUnitIds: 'ALL', restrictToMemberId: null}` in practice. The enforcement
  *mechanism* is built and tested here; only the policy that populates the filter is
  deferred to Unit 2. When Unit 2 lands, org-scope tests already exist to prove the
  filters bite.
- **Transaction boundaries are not yet exercised.** `createRepositories(tx)` supports them
  and `lockMemberForUpdate` exists, but no service composes them yet — that is Step 11
  onward. The BR-A-24 lock is therefore *present but unproven under concurrency*; a
  concurrent over-allocation test belongs with the assignment service.
- **`countReferences` uses one query per referencing table.** Four parallel counts, not a
  batch. Acceptable for an admin-only screen; it would need consolidating if it ever moved
  onto a hot path.
