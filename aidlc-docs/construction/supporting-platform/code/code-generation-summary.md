# Code Generation Summary — `supporting-platform`

**Unit**: 2 of 2 · **Plan**: `supporting-platform-code-generation-plan.md`, all 21 steps
**Branch**: `aidlc/construction-supporting-platform`

---

## 1. What was verified, and how

Every figure below was produced by running the command, not estimated.

| Check | Result |
|---|---|
| `backend: tsc --noEmit` | clean |
| `frontend: tsc --noEmit` | clean |
| `backend: npm test` **with** PostgreSQL 16 | **501 passed / 21 suites**, 0 failures |
| `frontend: npm test` | **89 passed / 8 suites** |
| `backend: npm run build` | `dist/src/server.js`; **no test files in `dist`** |
| `frontend: npm run build` | 308 kB JS / 90 kB gzipped, 18.5 kB CSS |
| `docker build` | succeeds — both new dependencies install **from the manifest alone** |
| Runtime image | runs as `node` (uid 1000); no `jest`, `tsc` or `vite` present |
| **Stand-in absent from the built IMAGE** | `find /app -iname '*authorization-standin*'` → **empty** |
| `shared/types/authorization.ts` | **unmodified** — `git diff main` is empty |
| `docker compose config` | valid; **only 80 and 443 published** |
| Migrations | **still one** — `001_initial_schema.ts` |

**590 tests across both workspaces.** Unit 2 added 118 backend + 26 frontend.

## 2. The X-1 gap is closed, and the proof is not vacuous

`core-domain/authorization-standin/` and its test are **deleted**. BR-R-05 and BR-R-07 move from
*"NOT enforced in Unit 1"* to enforced.

**Step 4's verification passed**: `git diff --stat` over `core-domain/` shows only
`services/index.ts`.

**Step 6's neutering requirement was executed, not asserted.** The component was edited to return
`orgUnitIds: 'ALL'` for `TEAM_LEAD` and `RESOURCE_MANAGER` — reproducing the deleted stand-in — and the
suite re-run: **16 of 83 supporting-platform tests turned red.** The component was then restored and
the suite re-run green.

This matters because Unit 1's first BR-A-24 concurrency test passed with the lock removed and had to
be discarded. The equivalent trap here would be a scope test that had been passing against the
permissive stand-in all along. The file also carries an executable
`assertScopeIsGenuinelyRestricted` guard-on-the-guard, so a future revert fails loudly rather than
quietly.

Role-level refusals (`EXECUTIVE` read-only, `TEAM_LEAD` no writes) are labelled as **regression
tests**, because they passed against the stand-in too. Counting them as evidence for the X-1 fix
would be a false claim about what was verified.

## 3. Measurements — the three claims that were UNVERIFIED at NFR Requirements

| Claim | Budget | **Measured** |
|---|---|---|
| 2,000-row import (U2-NFR-P-03) | < 30 s | **6.8 s** |
| 200-row import (U2-NFR-P-04) | < 5 s | **0.62 s** |
| BR-R-12 disjunction (N-Q2:A) | — | **2.1 ms** over 1,500 assignments |
| Member list, **scoped** role (U2-NFR-P-02) | < 500 ms | **12.1 ms** (admin 15.8 ms) |
| `resolveScope` + `toScopeFilter` (U2-NFR-P-01) | < 10 ms | **0.18 µs** |

**N-Q2:A is discharged on evidence: no index is warranted.** The member side uses
`Index Scan using member_org_status_idx`; the outer sequential scan over `assignment` is the correct
plan when 1,500 of 1,500 rows match. **Unit 2 therefore still requires no migration.**

The import write phase came in at roughly a third of the estimated worst case, so the 2,000-row cap
stands and no background job is needed.

**The scoped-vs-admin comparison is honest about its own limits**: the scoped query measured *faster*
than the admin one, which at 12–16 ms is noise, not a finding. What it does establish is that the
subtree expansion is not an order-of-magnitude regression — which is what U2-NFR-P-02 asked.

## 4. Inventory

```
backend/src/supporting-platform/
├── authorization/
│   ├── permission-matrix.ts        40 cells / 80 decisions; typed- AND runtime-exhaustive
│   └── authorization-component.ts  C-09 — the FR-R-08 enforcement point
├── accounts/account-link-service.ts
├── import/
│   ├── column-contracts.ts         drives BOTH parsing and template (BR-IM-26)
│   ├── csv-reader.ts               file gate + parse
│   ├── import-types.ts             the three-way ImportOutcome
│   └── import-component.ts         C-10 — five-phase pipeline
└── routes/{account-routes, import-routes}.ts

frontend/src/supporting-platform/
├── import/{ImportPage, ImportResultReport, api}.ts(x)
├── accounts/AccountLinkPage.tsx
└── views/{BenchPage, OverAllocatedPage, ExpiringContractsPage}.tsx
```

**Modified in `shared/` and Unit 1** — each for a recorded reason:

| File | Why |
|---|---|
| `shared/repository/db.ts` | `orgScopeMatches` — the U1-D01 subtree expansion |
| `shared/repository/{member,project,assignment}-repository.ts` | scope-filter application (assigned to Unit 2 by `unit-of-work.md`) + BR-R-12 |
| `shared/repository/user-account-repository.ts` | `findByLinkedMemberId`, `setLinkedMember` |
| `shared/config/index.ts` | import ceilings; extended `LOG_REDACT_PATHS` |
| `core-domain/services/index.ts` | the X-1 line |
| `core-domain/routes/error-mapper.ts` | surface `ConflictError.detail` (R2 obligation 5) |
| `core-domain/member/member-component.ts` + `member-service.ts` | expiring-contracts payload (see §6) |
| `app.ts`, `server.ts` | Unit 2 wiring, multipart, refusal logging, startup root load |

**6 new endpoints**, total **56** method+path combinations (Unit 1 had 50).

## 5. Defect U1-D01 — and the honest verdict on the X-1 pattern

`IAuthorizationComponent.resolveScope` is **synchronous**, but BR-R-08 needs the home org unit's
children and BR-R-09 needs to know whether it is a root — both database reads. Work **stopped** at
Step 2 per the plan's execution rule 5 rather than widening a FINAL interface.

Measured blast radius: **90 call sites across 7 service files** if made async, which would have broken
Step 4's verification. The user chose Option B: `orgUnitIds` carries scope **roots** and the subtree
expands inside SQL via a parameterized `orgScopeMatches` (`sql.ref` for the identifier, `sql.val` for
the bound array — no concatenation, U1-NFR-SE-06). Interface untouched, zero service call sites
changed, **zero extra queries per request**.

### The transferable lesson

**The X-1 stand-in pattern was only partially successful.** It achieved its primary purpose — Unit 1
built, ran and demonstrated without Unit 2. It did **not** validate that the interface could support
the real implementation, because *a permissive stand-in returns a constant and therefore never needs
the data the real component needs.* It exercises an interface's **shape**, never its
**requirements**.

Unit 1's own stand-in comment named the exact call the real component must make — *"OrgUnitComponent
.resolveScope already computes exactly that"* — without noticing that method is **async** and the
interface it sat behind could not call it.

A **restrictive** stand-in (plan option Q6:B) would have had to compute a real scope and would have
hit this wall during Unit 1, while the interface was still cheap to change.

## 6. Defects found during generation

Nine. Every one found by running something — a typechecker, a test, a build, or a container.

| # | Defect | Found by |
|---|---|---|
| 1 | **U1-D01**: synchronous `resolveScope` cannot resolve a real org scope | writing Step 2 |
| 2 | `targetInScope` read `restrictToMemberId`, which is on `ScopeFilter`, not `AccessScope` — would have silently skipped the `TEAM_MEMBER` branch | `tsc` |
| 3 | `targetInScope` returned **403** where the design requires 200+`[]`, and 403 also contradicts BR-R-16's 404-not-403 choice | **Unit 1's existing tests** |
| 4 | The same method **wrongly DENIED** a Team Lead access to a child unit, because scope roots exclude children | Unit 1's existing tests |
| 5 | My own arithmetic: "80-cell matrix" is wrong — 5 × 8 = **40 cells / 80 decisions**. Propagated through several approved documents | a test expecting 80 rows, receiving 40 |
| 6 | The BR-IM-24 logging test patched `app.log.info` and captured **nothing** — Fastify gives each request a **child** logger, so its "no row contents" assertions were passing vacuously against an empty string | reading the failure |
| 7 | The BR-IM-16 atomicity test branched on the outcome and merely warned, so it could pass **without exercising rollback** | self-review |
| 8 | The BR-R-12 `EXPLAIN` ran against an **empty** assignment table — "Seq Scan rows=0" answers nothing | reading the output |
| 9 | Unit 1's `/api/members/expiring-contracts` returned `MemberSummary[]`, **omitting the contract end date**, so the story it appeared to serve could not be built on it | writing the screen |

### The four worth reading twice

**Defects 3 and 4 came from the same instinct** — trying to decide per-record access in a synchronous
component. One made it too strict in the wrong way (403 instead of 404), the other made it wrongly
deny legitimate access. `targetInScope` now decides only what is decidable without I/O, which is what
the design already specified.

**Defect 6 is the false-positive shape this project keeps meeting.** A test whose absence-assertions
run against an empty capture passes for the wrong reason. It now asserts the capture **works**
(`toContain('import complete')`) *before* asserting what must be absent.

**Defect 8 is the same failure in a measurement.** A plan measured against no data is not evidence,
and reporting it as a discharged verification would have been worse than leaving the claim open.

**Defect 9 corrects this plan's own §0.** The plan claimed US-MEM-06 needed "frontend only", on the
strength of the endpoint existing. It existed and was inadequate — the contract window was being
fetched and discarded one line before the caller needed it.

### Also found

- **Test configs use `as AppConfig` casts**, which defeat the type system: adding a required config
  field broke 4 suites at **runtime** instead of at compile time. Fixed by adding the field; the cast
  remains a latent trap.
- **Zod validation runs before authorization**, so an incomplete body from an unauthorized caller
  yields 400 rather than 403. No data leak, but it reveals the request schema. Recorded, not
  reordered — a write's authorization check needs the parsed target.
- **Kysely 0.27.5 carries 3 high-severity advisories, none reachable here**: no `Kysely<any>`,
  `@ts-ignore` or `as any` anywhere; no `JSONPathBuilder.key()/.at()` calls; and the `sql.lit`
  advisory is MySQL-specific while the four `eb.lit()` sites pass **booleans** under
  `PostgresDialect`. Carried to Build and Test rather than pulling a breaking upgrade mid-plan.

## 7. Two PRE-EXISTING deployment defects fixed

Both predate Unit 2 and affected the running Unit 1 deployment.

1. **Container logs were unbounded.** Docker's default `json-file` driver applies no size cap and no
   `logging:` options were ever set, so the stack had been accumulating logs since Unit 1 shipped.
   Now 10 MB × 3 per service. **`shared-infrastructure.md` §6 rule 5 already asserted the log was
   "rotated"** — an approved artifact stating a safety property the deployment did not have.
2. **No proxy request-body limit.** Caddy 2's default is unlimited, so an arbitrarily large POST would
   stream into Node before refusal. Now 6 MB — deliberately **above** the app's 5 MB, so a
   just-over-limit upload still reaches the app and gets the message naming both limits rather than a
   bare 413 at exactly the boundary users hit.

## 8. Security posture

| Property | How it holds |
|---|---|
| Org scope enforced on every path | 22 enumerated enforcement points; scope filters **inside SQL** |
| Fail-closed on misconfiguration | NULL home org unit → **empty** root list → always-false predicate, never `'ALL'` |
| Scope never from client input | `resolveScope` takes one argument; no handler accepts an org-unit parameter |
| Out-of-scope record | **404**, not 403 — a 403 confirms existence |
| Policy not runtime-editable | code constant; no `role_permission` table |
| Refusals observable | warn line with role, method and **route pattern** — never the target id, never the query string |
| No row contents in logs | asserted by capturing `process.stdout` during a real import |
| No commercial data via import | no such column; unknown columns ignored **and named** (BR-M-09) |
| Upload never touches disk | in-memory buffer; verified in the container |
| 5 MB limit is import-route-only | per-route `bodyLimit`; every other route keeps 1 MB |
| CSV treated as data | no formula evaluation; a cell beginning `=` is a string |
| Import is create-only | never updates an existing record; re-runs are idempotent |
| Container unprivileged | `USER node` (uid 1000), verified in the built image |

## 9. What is NOT done

- **FR-I-01 partially satisfied** — CSV only, Excel deferred (Q7:A). The first Must requirement in
  this project not fully delivered; annotated in `requirements.md` rather than counted as complete.
- **No import audit trail** (Q10:A). A 2,000-row bulk write leaves only log counts.
- **FR-R-04's "request assignment changes" unimplemented** (Q6:A).
- **A new *root* org unit needs a restart** before a Resource Manager attached to it becomes
  organisation-wide. Under-grants, never over-grants; wiring an automatic refresh would have meant
  modifying Unit 1's org-unit service, which Step 4's diff check exists to prevent.
- **Org tree readable by all roles.** A Team Lead can enumerate the org chart, though not the data in
  it. Accepted, §3 of the business logic model.
- **Team Leads can learn out-of-org member names** via assignments to projects their unit owns — the
  intended consequence of Q3:C, bounded to that case.
- **Org-scope enforcement is exercised by two roles only** (`TEAM_LEAD`, and `RESOURCE_MANAGER` when
  not rooted). Narrow blast radius, and both are tested.
- **No screen has been visually verified.** Playwright has no Chromium here. Five new screens
  typecheck, build and are unit-tested, but no browser has rendered them. **Still the largest open
  risk.**
- **React `act` warnings** persist in the frontend suite (carried from Unit 1, four fixes attempted).
  Not suppressed, because that would hide real failures.
- **No CI gate** (NFR-Q-01 defers it).

## 10. Story coverage

All **11** outstanding stories implemented end to end:

`US-ACC-04` · `US-ACC-05` · `US-ENB-01` · `US-IMP-01` · `US-IMP-02` · `US-IMP-03` · `US-IMP-04` ·
`US-IMP-05` · `US-MEM-06` · `US-VIS-06` · `US-VIS-07`

`US-ASN-04` and `US-VIS-05` were completed during Unit 1 and are credited there (Q15:A).

**US-ENB-03 and US-ENB-04 are upheld, not owned**: the authentication boundary is untouched, and
Unit 2's endpoints were checked against the client-agnostic invariant — enumerated error codes rather
than prose, `curl -F` works as a browser does, and the two departures from all-JSON (a multipart
upload and a `text/csv` template) are warranted because a file *is* the payload.

**Both units complete. 43 of 43 stories.**
