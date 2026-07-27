# Build and Test Summary

**Date**: 2026-07-26 · **Scope**: both units · **Branch**: `aidlc/construction-supporting-platform`

Every figure below was produced by running the command. Where something was not measured, it says so.

---

## Build Status

| | |
|---|---|
| **Build tools** | `tsc` (backend), Vite (frontend), Docker (image) |
| **Status** | ✅ **Success** |
| **Verified from a CLEAN install** | `rm -rf node_modules` then `npm ci` in both workspaces |

| Step | Time |
|---|---|
| `backend: npm ci` | 11.0 s |
| `frontend: npm ci` | 8.1 s |
| `backend: npm run build` | 5.5 s |
| `frontend: npm run build` | 10.3 s |
| `docker build` | ~4 s warm |

**Artifacts**

| Artifact | Detail |
|---|---|
| `backend/dist/src/**`, `backend/dist/migrations/**` | **no test files** — verified |
| `frontend/dist/` | JS **308.82 kB / 90.33 kB gzipped**; CSS 18.52 kB / 4.22 kB |
| `chaos-manager` image | runs as `node` uid 1000; no `jest`/`tsc`/`vite`; **stand-in absent** |

`npm ci` — not `npm install` — was used deliberately: it fails on a lockfile mismatch, which is how a
missing dependency declaration gets caught. Unit 1 shipped exactly that defect once.

---

## Test Execution Summary

### Unit and component tests

| Suite | Result | Time |
|---|---|---|
| Backend, **with** PostgreSQL 16 | ✅ **501 passed / 21 suites**, 0 failures | 37.0 s |
| Backend, **without** a database | ✅ **343 passed, 158 skipped**, 0 failures | 8.8 s |
| Frontend | ✅ **89 passed / 8 suites** | 6.1 s |
| **Total** | **590 tests** | |

**Determinism verified**: three consecutive runs of each configuration, identical results.

Database-dependent suites **skip** without a database rather than silently passing — a suite that
passed while testing nothing would report green and mean nothing.

**Coverage: no threshold enforced, and none claimed.** NFR-Q-01 defers the CI gate, so there is no
mechanism to enforce one; quoting a percentage would imply a gate that does not exist.

### Integration tests

Not a separate command — the database-backed suites **are** the integration tests, because both units
are modules in one deployable.

| Cross-unit scenario | Tests | Status |
|---|---|---|
| Unit 2 authorization governs Unit 1's reads (X-1) | 17 | ✅ |
| Unit 2 import writes Unit 1's entities through Unit 1's components (X-2) | 29 | ✅ |
| Unit 2 makes Unit 1's dormant `linked_member_id` live | 16 | ✅ |
| Unit 1's own suites, unchanged, against real enforcement | 393 | ✅ |

**The X-1 claim is proven non-vacuously.** Neutering the authorization component turns **16 of 83**
supporting-platform tests red. Role-level refusals are labelled separately as regression tests,
because they passed against the old stand-in too — counting them as proof would be a false claim.

### Performance tests

| Measurement | Target | **Measured** | Status |
|---|---|---|---|
| 2,000-row import | < 30 s | **6.8 s** | ✅ |
| 200-row import | < 5 s | **0.62 s** | ✅ |
| Member list, `ADMIN` | < 500 ms | **15.8 ms** | ✅ |
| Member list, **scoped** `TEAM_LEAD` | < 500 ms | **12.1 ms** | ✅ |
| `resolveScope` + `toScopeFilter` | < 10 ms | **0.18 µs** | ✅ |
| BR-R-12 `EXPLAIN` (1,500 assignments) | — | **2.1 ms** | ✅ no index needed |

**N-Q2:A discharged on evidence: no index warranted, so no migration is needed.** Unit 2 still ships
with `001_initial_schema.ts` as the only migration.

**No load or stress test, deliberately.** A virtual-user ramp would characterise a load this
single-instance, business-hours, low-tens-concurrency deployment cannot receive (NFR-S-02,
NFR-A-01/02/03).

**Error rate and throughput: not measured**, for the same reason. Stating a figure would be inventing
one.

### Security tests

| Category | Status |
|---|---|
| FR-AU-02 Argon2id password hashing | ✅ asserted |
| FR-R-08 server-side authorization on every path | ✅ 22 enforcement points; proven by neutering |
| No secret in any log line | ✅ 17 redaction tests |
| No import **row contents** in any log line | ✅ asserted by capturing `process.stdout` |
| No secret in any committed file | ✅ |
| Container unprivileged, only 80/443 published | ✅ |
| Dependency advisories | ⚠️ **one acted on, one accepted** — see below |

### Contract tests

**N/A, with a reason.** Contract testing exists to protect a boundary between independently deployed
services. This is one deployable; the units share a process and a type system, and `tsc` already fails
if the contract between them breaks. The client-agnostic API property (US-ENB-04) *is* verified — but
by inspection against seven stated properties and by `curl -F` working as a browser does, not by a
contract harness.

### End-to-end tests

⚠️ **Partially done, and the gap is the largest open risk in the project.**

| Done | Not done |
|---|---|
| Full pipeline via `app.inject` (501 tests) | **No browser has rendered any screen** |
| Container serves the SPA, client routes fall back, assets resolve, `/api` 404s as JSON | No UI automation — Playwright has no Chromium in this environment |
| `/health` reports database connectivity through the container | Five new Unit 2 screens have never been looked at |

The frontend typechecks, builds, is unit-tested and is served correctly. **The first person to see
these screens will be a user.**

---

## ⚠️ Security action taken during this stage

`@fastify/static@8.3.0` carried four advisories, **three of them authorization / route-guard bypass**
(GHSA-x428-ghpx-8j92, GHSA-8pvw-jcv7-9cmj, GHSA-83w8-p2f5-377r) plus a directory-listing traversal
(GHSA-pr96-94w5-mx2h).

**This was missed at code generation Step 1**, where only the `kysely` advisories were examined
because `npm audit`'s output was read from the tail. The earlier claim to have reviewed the
advisories was incomplete, and that is recorded rather than quietly corrected.

An authorization-bypass class advisory in a runtime dependency, in the unit whose whole purpose is
authorization enforcement, is not a finding to defer. **Upgraded to `@fastify/static@10.1.2`** (semver
major) and verified: `tsc` clean, 501/501 tests pass, and the SPA still serves correctly **from a
running container** — which the test suite does not cover, because tests never set `STATIC_DIR`.
Traversal probes leak no file content. Production advisories dropped **2 → 1**.

**Accepted, with reachability verified**: `kysely@0.27.5`'s three high advisories are all
unreachable here — no `Kysely<any>` / `@ts-ignore` / `as any` anywhere, no `JSONPathBuilder` calls,
and the `sql.lit` advisory is MySQL-specific while all four `eb.lit()` sites pass booleans under
`PostgresDialect`. The fix is a breaking change to the layer every authorization filter is built on,
so it belongs in its own deliberate change with the full suite as the gate — **carried to Operations**,
not rushed here.

**Dev-only advisories** (~21, the `jest`/`babel` chain) do not ship — verified absent from the runtime
image.

---

## Overall Status

| | |
|---|---|
| **Build** | ✅ Success, from a clean install |
| **All tests** | ✅ **590 passed, 0 failures**, deterministic |
| **Ready for Operations** | ✅ **Yes — with the caveats below stated, not buried** |

### Carried into Operations

| # | Item | Severity |
|---|---|---|
| 1 | **No screen has been visually verified.** Five new screens plus Unit 1's, never rendered in a browser | **Highest open risk** |
| 2 | Plan the `kysely@0.29.4` upgrade deliberately | Medium — advisories not reachable, but the layer is load-bearing |
| 3 | **This release changes what existing users can see.** Run the pre-deployment query in `deployment-architecture.md` §3.2 first: any `TEAM_LEAD`/`RESOURCE_MANAGER` with a NULL `home_org_unit_id` will see **nothing** — correct fail-closed behaviour that looks exactly like a broken account | Medium — operational surprise |
| 4 | FR-I-01 **partially satisfied** — CSV only, Excel deferred | Recorded requirement gap |
| 5 | No import audit trail; a 2,000-row bulk write leaves only counts | Accepted (Q10:A) |
| 6 | A malformed path returns 500 rather than 404 (generic body, **no leak**) | Low |
| 7 | No online brute-force throttle on sign-in | Low — worth raising |
| 8 | A new **root** org unit needs a restart before a Resource Manager attached to it becomes organisation-wide | Low — under-grants, never over-grants |
| 9 | No CI gate (NFR-Q-01) — tests pass but nothing stops a commit that breaks them | Low for Phase 1 |
| 10 | ~200 React `act` warnings; not suppressed, because suppression would hide real failures | Cosmetic |

**Enforce verification with a scoped account, not Admin.** The entire point of this release is
invisible to an Admin session.

---

## Instruction files generated

| File | Covers |
|---|---|
| `build-instructions.md` | prerequisites, clean-install build, container build, image verification, troubleshooting |
| `unit-test-instructions.md` | both configurations, the `npm test` vs `npx jest` trap, the neutering standard, known noise |
| `integration-test-instructions.md` | the three cross-unit scenarios, setup, `maxWorkers: 1` warning, manual end-to-end |
| `performance-test-instructions.md` | the six measurements with real numbers, what is deliberately not measured |
| `security-test-instructions.md` | automated assertions, manual probes, the advisory analysis, findings recorded not fixed |
| `build-and-test-summary.md` | this document |

## Story and requirement position

**43 of 43 stories** implemented across both units. **FR-I-01 is the only Must requirement not fully
delivered** (CSV only), annotated in `requirements.md` rather than counted as complete.
