# Code Generation Plan — `supporting-platform` (Unit 2)

**Stage**: CONSTRUCTION → Code Generation, **Part 1: Planning**
**Branch**: `aidlc/construction-supporting-platform`
**Date**: 2026-07-26
**Predecessor**: Infrastructure Design APPROVED 2026-07-26

> **This plan is the SINGLE SOURCE OF TRUTH for Code Generation.** Part 2 executes exactly these steps
> in this order, ticking each `[x]` in the same interaction the work is completed. No step is added,
> skipped or reordered during execution without recording why.

---

## 1. Unit Context

### 1.1 Stories — 11 outstanding

| Step(s) | Story | Priority | Title |
|---|---|---|---|
| 2, 3, 4, 5, 6 | `US-ACC-05` | Must | See only what my role permits |
| 2, 3, 4, 5, 6 | `US-ENB-01` | Must | Org-scope enforced server-side |
| 7, 8, 14 | `US-ACC-04` | Should | Link a user account to a member record |
| 9, 10, 11, 12, 13 | `US-IMP-01` | Must | Import members from a spreadsheet |
| 9, 10, 11, 12, 13 | `US-IMP-02` | Must | Import projects from a spreadsheet |
| 9, 12, 13 | `US-IMP-03` | Must | Import row-level error report |
| 10, 12, 13 | `US-IMP-04` | Must | Import duplicate conflict report |
| 11, 13 | `US-IMP-05` | Should | Download an import template |
| 15, 16 | `US-MEM-06` | Should | See contracts expiring soon |
| 15, 16 | `US-VIS-06` | Should | See unallocated members |
| 15, 16 | `US-VIS-07` | Should | Review over-allocated members |

**Already complete — no work in this unit** (Q15:A, verified against shipped code):
`US-ASN-04` (project role on assignment) · `US-VIS-05` (member assignment timeline)

**Upheld, not owned** (Correction 2 in `unit-of-work.md`): `US-ENB-03` (replaceable authentication
boundary) and `US-ENB-04` (client-agnostic API) are Unit 1 properties that Unit 2 must not break.
Verified at Step 21.

### 1.2 Cross-unit dependencies

| ID | Nature | Status |
|---|---|---|
| **X-1** | Unit 1 depends on the `IAuthorizationComponent` **interface**; Unit 2 replaces the implementation | **Resolved at Step 4** |
| **X-2** | Unit 2 consumes `IMemberComponent`, `IProjectComponent`, `IOrgUnitComponent`, `IReferenceDataComponent` | Satisfied — Unit 1 complete |
| **X-3** | One shared database schema | No change — Unit 2 adds no migration |

### 1.3 Interfaces and contracts

- **`shared/types/authorization.ts` is FINAL and must NOT be modified.** If any step needs to widen it,
  that is a Unit 1 design defect and Step 21 records it as one.
- Unit 2 publishes the real `IAuthorizationComponent` implementation.
- Import writes **through Unit 1's components** (BR-IM-11), never with direct SQL against Unit 1 tables.

### 1.4 Database entities owned

**None.** No migration. `001_initial_schema.ts` remains the final Phase 1 schema (Q1:A + Q10:A).
The only exception would be an index if Step 19's `EXPLAIN` measurement demands one (N-Q2:A) — which
would make it evidence-based, not speculative.

### 1.5 Code locations

Application code at the **workspace root**, never in `aidlc-docs/`:

```
backend/src/supporting-platform/authorization/       C-09  (new)
backend/src/supporting-platform/import/              C-10  (new)
backend/src/supporting-platform/routes/              import + link endpoints (new)
backend/src/core-domain/services/index.ts            MODIFY — one line (X-1)
backend/src/core-domain/authorization-standin/       DELETE ENTIRELY
backend/src/shared/repository/assignment-repository.ts  MODIFY — BR-R-12
backend/src/shared/config/                           MODIFY — 2 new values
backend/src/app.ts                                   MODIFY — register multipart, per-route limit
backend/tests/supporting-platform/                   tests (new)
frontend/src/supporting-platform/import/             F-07  (new)
frontend/src/supporting-platform/accounts/           US-ACC-04 (new)
frontend/src/supporting-platform/views/              3 pages (new)
frontend/src/App.tsx                                 MODIFY — 5 routes, nav
docker-compose.yml                                   MODIFY — log rotation
docker/Caddyfile                                     MODIFY — request_body
.env.example                                         MODIFY — 2 values
```

Documentation (markdown only) at `aidlc-docs/construction/supporting-platform/code/`.

---

## 2. Generation Steps

### Backend — Authorization (the X-1 resolution)

- [x] **Step 1 — Dependencies.** ✅ `@fastify/multipart@^10.1.0` and `csv-parse@^7.0.1` added to
      **dependencies** (verified: neither appears in devDependencies).
      **Finding — 3 high-severity Kysely advisories (0.27.5), NONE reachable in this codebase.**
      Verified rather than dismissed: (a) the `Kysely<any>` / silenced-compile-error JSON-path injection —
      no `Kysely<any>`, no `@ts-ignore`, no `@ts-expect-error`, no `as any` anywhere in `backend/src`;
      (b) the `JSONPathBuilder.key()`/`.at()` traversal injection — those APIs are not called at all, and
      the only jsonb column (`attributes`) is unused in Phase 1 per BR-C-09; (c) the `sql.lit(string)`
      backslash-escaping injection is **MySQL-specific**, while this deployment uses `PostgresDialect`,
      and the four `eb.lit(...)` call sites all pass a **boolean**, not a string. Fixing requires
      kysely@0.29.4, a breaking change; pulling that into the middle of this plan would be scope creep
      against a non-reachable advisory. **Recorded for Build and Test.** Noted because the four
      `eb.lit(false)` sites are the fail-closed empty-scope predicate (BR-R-17) — the most
      security-critical expression in the codebase — so their safety was worth establishing explicitly.

- [ ] **Step 2 — C-09 AuthorizationComponent.** `backend/src/supporting-platform/authorization/`:
      the 80-cell permission matrix as a typed constant (BR-R-14), `resolveScope` with the two-level
      subtree and the fail-closed NULL cases (BR-R-08/09/10/11), `toScopeFilter`, `canRead`/`canWrite`,
      `assertCanRead`/`assertCanWrite`. Against the **unchanged** interface.
      *Stories: US-ACC-05, US-ENB-01*

- [ ] **Step 3 — C-09 unit tests.** All 80 matrix cells table-driven, **plus** the exhaustiveness check
      that fails when a `ResourceKind` or role has no entry (N-Q6:C). Scope resolution for every role,
      including: NULL `home_org_unit_id` → empty scope not `'ALL'` (BR-R-11); rooted vs child-unit
      Resource Manager (BR-R-09); unlinked `TEAM_MEMBER` refused (BR-R-18).

- [ ] **Step 4 — X-1 SWITCHOVER.** Repoint `core-domain/services/index.ts` (**one line**), then
      **DELETE `backend/src/core-domain/authorization-standin/` entirely**, including its tests and the
      `STAND_IN_ENFORCEMENT_GAPS` export. Then run `git diff --stat` over `core-domain/` and confirm
      **only `services/index.ts`** changed. Any other change is a Unit 1 design defect — record it.

- [ ] **Step 5 — BR-R-12 scope predicate.** Widen `shared/repository/assignment-repository.ts`
      `scopePredicates` from member-org-only to **member OR project owning org** — an `OR` inside the
      existing `AND` chain. **Rewrite the existing comment**, which currently justifies member-only
      scoping and would otherwise contradict the code beneath it (U2-NFR-M-05).

- [ ] **Step 6 — Enforcement integration tests.** Cover the 22 enforcement points from
      `business-logic-model.md` §3. **Each test that proves the X-1 fix must be confirmed to FAIL if
      Step 4 is reverted** — the method Unit 1 adopted after its BR-A-24 false positive. Tests that pass
      against the stand-in are regression tests and must be labelled as such, not counted as proof.
      Includes the **BR-R-13 assertion**: an in-scope member's total is their **full** total (130%),
      including out-of-scope projects, and this test must fail if the sum is taken after the scope filter.
      *Stories: US-ACC-05, US-ENB-01*

### Backend — Account linkage

- [ ] **Step 7 — Linkage service and routes.** Link, relink-refusal and unlink, Admin-only. Refusals
      **name** the existing link (BR-L-02/03). `home_org_unit_id` untouched (BR-L-05).
      *Story: US-ACC-04*

- [ ] **Step 8 — Linkage tests.** Both refusal directions with the named existing link; unlink revokes a
      `TEAM_MEMBER`'s access entirely (BR-R-18); the database index is the real guarantee (BR-L-01).

### Backend — Import

- [ ] **Step 9 — C-10 Import: column contracts, parse, validate.** The `ColumnSpec` contract driving
      **both** parsing and template generation (BR-IM-26); CSV parse with `relax_column_count: false`;
      file gate (format, 5 MB, 2,000 rows, header, empty-file); unknown columns ignored and named
      (BR-IM-04); per-row validation **reusing Unit 1 components** (BR-IM-11) collecting **all** reasons
      (BR-IM-12); **batched** reference-data resolution, ~4 queries per file regardless of row count
      (BR-IM-14).
      *Stories: US-IMP-01, US-IMP-02, US-IMP-03*

- [ ] **Step 10 — C-10 Import: duplicates and the write.** Natural keys (BR-IM-06/07); conflicts against
      existing records and against **earlier rows in the same file**, in preserved file order
      (BR-IM-08/09); **one transaction for all valid rows** via `createRepositories(tx)` (BR-IM-16); the
      three-way `ImportOutcome`.
      *Story: US-IMP-04*

- [ ] **Step 11 — S-09 ImportService and routes.** Multipart upload with limits at the framework
      boundary and **no temp-file mode** (BR-IM-25); per-route 5 MB `bodyLimit` and 60 s timeout;
      template download generated from the Step 9 contract; **Admin-only** (BR-IM-22).
      *Stories: US-IMP-01, US-IMP-02, US-IMP-05*

- [ ] **Step 12 — Import tests.** CSV edge cases (quoted commas, embedded newlines, CRLF, BOM, wrong
      field count); idempotency — re-upload creates nothing and reports all rows as conflicts
      (BR-IM-10); in-file duplicates; all-invalid → `NOTHING_CREATED`; rollback leaves **nothing**
      created; reference values **never** created (BR-IM-13); commercial columns ignored and named
      (BR-M-09); **and an assertion that no log line contains row contents** (BR-IM-24).
      *Stories: US-IMP-01…05*

### Frontend

- [ ] **Step 13 — F-07 Import screen.** `ImportPage` + `ImportResultReport`. Conflicts and errors as
      **separate** sections; `NOTHING_CREATED` rendered distinctly from zero-created; ignored-columns
      notice; the "this report is not saved" statement (Q10:A); client-side pre-check using the **same
      message** as the server; **no fabricated progress bar** (U2-NFR-U-04). `data-testid` throughout.
      *Stories: US-IMP-01…05*

- [ ] **Step 14 — Accounts screen.** `AccountLinkPage`; unlink confirmation states that a
      `TEAM_MEMBER` loses all access; `MemberDetailPage` gains a read-only linked-account row.
      *Story: US-ACC-04*

- [ ] **Step 15 — Three view pages + routing and nav.** `BenchPage`, `OverAllocatedPage`,
      `ExpiringContractsPage` — all consuming **existing** Unit 1 endpoints. Five new routes; nav
      filtered by the session's permissions; a **403 renders as a forbidden state**, not a generic error
      (U2-NFR-U-02). Positive empty states (U2-NFR-U-07).
      *Stories: US-MEM-06, US-VIS-06, US-VIS-07*

- [ ] **Step 16 — Frontend tests.** Per the nine obligations in `frontend-components.md` §10, including:
      a `TEAM_LEAD` sees no Admin nav **and** `/import` shows a forbidden state; the over-allocated page
      shows a scoped user the member's **full** total (BR-R-13); empty states read as good news.

### Configuration and deployment

- [ ] **Step 17 — Configuration.** `IMPORT_MAX_ROWS` and `IMPORT_MAX_BYTES` with fail-fast validation on
      malformed values; extend `LOG_REDACT_PATHS` for import payload paths; refusal logging at warn with
      role, resource kind, operation and outcome — **never the target's identity** (U2-NFR-SE-07);
      update `.env.example`.

- [ ] **Step 18 — Deployment artifacts.** `docker-compose.yml`: `logging` rotation on **all three**
      services (fixes the pre-existing unbounded-log defect) and the two new env passthroughs.
      `docker/Caddyfile`: `request_body max_size 6MB`, deliberately **above** the app's 5 MB.

### Verification and documentation

- [ ] **Step 19 — Discharge the three UNVERIFIED performance claims.** These are recorded as unverified
      in `nfr-requirements.md` §10 and must be **measured**, with actual numbers reported:
      1. Time a real 2,000-row import against the 30 s budget (U2-NFR-P-03). If it exceeds, **do not**
         bypass Unit 1's components — lower the row cap or report the finding.
      2. `EXPLAIN` the BR-R-12 disjunction; add an index **only** if the plan justifies it (N-Q2:A).
      3. **Re-run Unit 1's endpoint timings for a SCOPED role**, not Admin. The originals were measured
         against a permissive filter that added no `WHERE` clause, so they do not transfer.

- [ ] **Step 20 — Documentation.** Update `api-documentation.md` with the new endpoints and the new
      total; write `authorization-summary.md` and `import-summary.md`; update `README.md` with the import
      workflow and the ordering constraint that reference data must exist first.

- [ ] **Step 21 — Full verification and summary.** Run and report **actual output** for: `tsc --noEmit`
      both workspaces, both test suites, both builds, `docker build`, `docker compose config`. Confirm
      the stand-in is absent from the **built image**. Confirm `shared/types/authorization.ts` is
      unmodified. Confirm US-ENB-03 and US-ENB-04 still hold. Write
      `code-generation-summary.md` with verified figures, every defect found, and every gap remaining.

---

## 3. Execution Rules

1. **Tick `[x]` in the same interaction the step is completed.** Not batched at the end.
2. **Report actual command output**, never a description of what output would be. Unit 1's summary
   figures were all produced by running commands, and this unit holds to that.
3. **A test that proves a security guard must be confirmed to fail when the guard is removed.** This is
   not optional here: Unit 1's first BR-A-24 test passed with the lock neutered.
4. **Modify in place.** No `*-new.ts` or `*-v2.ts` files.
5. **Never widen `shared/types/authorization.ts`.** If a step appears to need it, stop and record it as a
   Unit 1 design defect.
6. **No direct SQL against Unit 1's tables from import** (BR-IM-11).
7. **No row contents in any log line** (BR-IM-24), and **no target identity in a refusal log**
   (U2-NFR-SE-07).
8. **Commit at each verified milestone**, not only at the end.

---

## 4. Scope and Expectations

| | |
|---|---|
| Steps | **21** |
| Stories implemented | **11** (2 more already complete from Unit 1) |
| New backend modules | 3 — authorization, import, routes |
| New frontend features | 3 — import, accounts, views |
| Files deleted | the entire `core-domain/authorization-standin/` directory |
| New migrations | **0**, unless Step 19's `EXPLAIN` earns one |
| New dependencies | 2 backend, 0 frontend |
| New endpoints | ~6 — import, template, link, unlink, plus account listing |

**The unit's centre of gravity is Steps 2–6.** Import is more code but lower risk: it is new
functionality whose failures are visible in a report. Authorization is less code and higher risk, because
a mistake is invisible until someone sees data they should not — which is why Step 6 requires each
enforcement test to be proven against a reverted Step 4.
