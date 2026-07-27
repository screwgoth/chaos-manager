# Code Generation Summary — `core-domain`

**Unit**: 1 of 2 · **Plan**: `core-domain-code-generation-plan.md`, all 26 steps
**Branch**: `aidlc/construction-core-domain`

---

## 1. What was verified, and how

Every figure below was produced by running the command, not estimated.

| Check | Result |
|---|---|
| `backend: tsc --noEmit` | clean |
| `frontend: tsc --noEmit` | clean |
| `backend: npm test` **with** PostgreSQL 16 | **387 passed / 17 suites**, 0 failures |
| `backend: npm test` **without** a database | 296 passed, 91 skipped (reported as skipped, never as passing) |
| `frontend: npm test` | **63 passed / 5 suites** |
| `backend: npm run build` | `dist/src/server.js` + `dist/migrations/*.js`, no tests in `dist` |
| `frontend: npm run build` | 291 kB JS, 16.8 kB CSS |
| `docker build` | succeeds; **310 MB** runtime image |
| Runtime image | runs as `node` (uid 1000); no `tsc`, `vite` or `jest` present |
| Container end-to-end | `/health` 200, SPA served, client route falls back, **admin login succeeded** |
| Compose config | valid; **only 80 and 443 published** |
| Seed idempotency | two starts → 1 org unit, 7 reference entries, 1 account |
| Secrets in committed files | none (see §6) |

**450 tests total.**

## 2. Inventory

Counted mechanically from `git ls-files`, excluding lockfiles.

| Area | Files | Lines |
|---|---:|---:|
| Backend source | 51 | 9,940 |
| Frontend source | 38 | 5,511 |
| Tests (both workspaces) | 22 | 7,456 |
| Config, deployment, docs at root | 22 | 1,313 |
| **Total** | **133** | **24,220** |

AI-DLC documentation adds 40 files / ~10,800 lines under `aidlc-docs/`.

### Backend

```
backend/
├── migrations/001_initial_schema.ts     9 tables, check constraints, partial unique indexes
├── src/
│   ├── app.ts                          Fastify assembly, logging, error boundary, /health, SPA
│   ├── server.ts                       config → connect → migrate → seed → listen → signals
│   ├── shared/
│   │   ├── config/                      fail-fast validation, secret redaction
│   │   ├── errors/                      ValidationError + ViolationCollector (all reasons)
│   │   ├── types/                       domain types; authorization.ts is the X-1 contract
│   │   ├── util/                        tenths.ts, dates.ts, ids.ts
│   │   └── repository/                  8 repositories, schema, mappers, pg-errors, seed
│   └── core-domain/
│       ├── member/ project/ assignment/ allocation/ org-unit/ reference-data/
│       ├── identity/ session/
│       ├── authorization-standin/        ⚠️ TEMPORARY — delete when Unit 2 lands
│       ├── services/                    S-01…S-08 + composition root
│       └── routes/                      6 route modules, schemas, error mapper, session middleware
└── tests/core-domain/                   11 suites
```

### Frontend

```
frontend/src/
├── shared/          api (client, queries, types) · session · hooks · 11 components
├── core-domain/     auth · members · projects · assignments · views · admin
├── App.tsx          routes, role-based landing
└── main.tsx
```

## 3. Endpoints

**50** — 49 under `/api` plus `/health`. Documented in `api-documentation.md`.

The design specified 37; the extra 13 are reactivate/reopen counterparts, reference-count endpoints,
and `/members/me`, `/members/assignable`, `/projects/open` — needed to make the refusal rules
actionable rather than dead ends.

*(An earlier summary said 47. That was a miscount, corrected here by enumerating the route
registrations mechanically.)*

## 4. Defects found during generation

Seventeen, every one found by running something — a typechecker, a test, a build, or a container.

| # | Defect | Found by | Origin step |
|---|---|---|---|
| 1 | `Generated<ColumnType<…>>` nesting broke every timestamp write (20 errors) | `tsc` | 3 |
| 2 | Malformed id → raw pg error → unhandled **500** instead of 404 | integration test | 4 |
| 3 | `status = 'ACTIVE'` filter **violated BR-A-07/BR-A-20**, dropping the elapsed portion of ended assignments from historical totals | reading the rules | 4 |
| 4 | N+1 in `ProjectComponent.listOpen` | self-review | 8 |
| 5 | Two integration suites dropped each other's schema in parallel (27 spurious failures) | full test run | test config |
| 6 | ReferenceData had no `delete`, but BR-C-06 refuses deletion only of *referenced* entries | reading the rules | 4 |
| 7 | **BR-A-24 concurrency test was a FALSE POSITIVE** — passed with the lock removed | neutering the lock | 10 |
| 8 | `redactSecrets` / `LOG_REDACT_PATHS` had **no tests at all** | Step 12 audit | 2 |
| 9 | Argon2 parameters **hardcoded** while `.env.example` exposed them — a silent no-op on a security control | Step 12 audit | 11 |
| 10 | `setNotFoundHandler` registered **twice**; Fastify throws. **Production-only failure** | self-review | 15 |
| 11 | `member-service.ts` silently never written — a failed `cd` short-circuited an `&&` chain | listing the directory | 14 |
| 12 | Fastify overloads resolved to the HTTP/2 instance type, breaking every route registration | `tsc` | 15 |
| 13 | `@fastify/cookie` type augmentation absent without importing the module | `tsc` | 15 |
| 14 | `@fastify/cookie`'s dynamic `import()` fails under Jest's CJS VM — all 35 API tests failed | running the suite | 16 |
| 15 | Test stub used `new Response(...)`; **jsdom has no `Response`**. The ReferenceError surfaced as the component's fallback message, so the test appeared to prove a bug that did not exist | probe test | 21 |
| 16 | `@testing-library/user-event` in `node_modules` but **not declared in `package.json`** — a fresh clone or container build fails | `docker build` | 21 |
| 17 | Production `tsc -b` typechecked test files, coupling the build to devDependencies | `docker build` | 18 |

### The three worth reading twice

**Defect 7 changed how safety properties are verified here.** The obvious concurrency test — two
`create` calls via `Promise.all`, assert one fails — passed *with `lockMemberForUpdate` removed*,
because the calls never interleave at the critical point. A test named "serialises…" that passes
without serialisation is worse than no test. It was deleted, replaced with one that forces the
interleaving, and **confirmed to fail with the lock neutered**. Verifying a guard now means removing
it and watching the test go red.

**Defect 10 would only have failed in production.** Development runs without built frontend assets,
so `STATIC_DIR` is absent and the duplicate handler never registers. The server would have started
cleanly on a developer's machine and refused to start on the deployment host.

**Defect 15 shows why diagnosis beats assumption.** My first hypothesis — a downlevel-target
`instanceof` failure — was plausible and wrong. A five-line probe that logged the actual thrown
constructor disproved it in one run. A test that fails for the wrong reason sends the fix into the
wrong file.

## 5. Interface deviations from the design

All three deliberate and recorded, not silently applied.

1. **C-04 takes pre-fetched data.** The designed signatures include `scope` and `Page<…>`, which
   require I/O — incompatible with U1-NFR-M-03's purity requirement. Resolved as the business-logic
   model specifies: repositories fetch, C-04 computes. Scoping and pagination live in
   `AllocationQueryService`.
2. **C-05/C-06 gained `delete`.** BR-C-06 and BR-O-05 refuse removal of *referenced* entries, which
   necessarily means unreferenced ones must be deletable.
3. **The eight-step assignment flow stayed in C-03**, not the service. The lock and transaction must
   span the capacity check *and* the write (BR-A-24), so it belongs where the transaction boundary
   is.

## 6. Security posture

| Property | How it holds |
|---|---|
| No plaintext password stored, returned or logged | Argon2id only; the hash leaves `UserAccountRepository` through **one** method and appears in no mapper |
| Identical passwords → different hashes | Argon2id's embedded salt; asserted by test |
| No username oracle | One rejection message for both failure modes, plus a **real** dummy hash comparison on the unknown-username path; the inactive-account message comes only *after* the password verifies |
| No session token stored | Only a SHA-256 hash; there is no `findByToken` method |
| Token unreadable by page JavaScript | httpOnly cookie; never in a response body (tested) |
| Sign-out is genuine | `terminatedAt` set server-side; the same cookie is then refused (tested) |
| Password change evicts other sessions | `terminateAllForUser`, plus the caller's own cookie cleared |
| No secret in any log line | `LOG_REDACT_PATHS` structurally + `redactSecrets` on messages and connection URLs |
| No stack trace or SQL to the client | Unrecognised errors → generic 500, real error logged (tested) |
| Scope applied inside SQL | Out-of-scope rows are never fetched; an empty permitted-org list yields `eb.lit(false)`, never an absent filter |
| Container runs unprivileged | `USER node` (uid 1000), verified in the built image |
| Only 80/443 published | Verified from `docker compose config` |
| No secret committed | `.env` git-ignored, `.env.example` holds no values, no secret has a default |

## 7. What is NOT done

- ⚠️ **Org-scope visibility (BR-R-05) is not enforced.** A `TEAM_LEAD` or `RESOURCE_MANAGER` sees all
  org units. The *mechanism* is built and tested; only the policy is deferred to
  `supporting-platform`. Replacement is **one line** in `services/index.ts`, then delete
  `core-domain/authorization-standin/` entirely.
- **No screen has been visually verified.** Playwright has no Chromium in this environment. The SPA
  typechecks, builds, is unit-tested and is served correctly — but nobody has looked at it. This is
  the largest open risk in the unit.
- **React `act` warnings** in the frontend suite (~one per keystroke). Four fixes attempted, none
  worked; tests pass deterministically. Not suppressed, because that would hide real failures.
- **No CI gate** (NFR-Q-01 defers it). Tests pass but nothing stops a commit that breaks them.
- **`availability`'s `total`** is the unfiltered member count when `minimumAvailablePercentage` is
  used — documented rather than silently wrong.
- **`disableRequestLogging`** is deprecated in Fastify 5 and moves to a `logController` class in v6.
- **`overAllocated` and `unallocated`** fetch up to 5,000 members unpaginated. Over-allocation is a
  whole-population question, so paginating would hide problems on page two.
- **Frontend bundle is unsplit** (291 kB / 86 kB gzipped). Fine for an internal tool on a LAN.

## 8. Story coverage

**32 stories** are implemented end to end (corrected 2026-07-26 at Unit 2 Functional Design, Q15:A —
this section previously said 30). All stories assigned to this unit are implemented end to end — domain rule, API endpoint, and
screen. Marked `[x]` in the code generation plan §1.

`US-ACC-01/02/03` · `US-MEM-01/02/03/04/05/07` · `US-PRJ-01/02/03/04/05` ·
`US-ASN-01/02/03/05/06/07` · `US-VIS-01/02/03/04` · `US-ADM-01/02/03` · `US-ENB-02/03/04`

Plus two stories **originally assigned to Unit 2** that this unit in fact completed, because the
allocation component produced them as a by-product:

- **US-ASN-04** — role on a project. Schema column, service validation, and the form field.
- **US-VIS-05** — member assignment timeline. Endpoint plus the segment strip on the member detail page.

Three further Unit 2 stories have tested backend endpoints here but **no consuming screen**, so they
remain Unit 2 work: US-VIS-06 (bench), US-VIS-07 (over-allocated review), US-MEM-06 (expiring
contracts). Recorded so the two units' story counts reconcile against what was actually built.
