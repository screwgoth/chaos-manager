# Security Test Instructions

**Why this file exists even though the Security Baseline extension is disabled.** NFR-SE-01 disables
the extension, but **NFR-SE-02 retains FR-AU-02 (password hashing) and FR-R-08 (server-side
authorization) as mandatory functional requirements**, because they are unrecoverable if wrong. This
document covers those two and the dependency checks that belong in this stage.

---

## 1. Automated security assertions

These run as part of the normal suite; there is no separate command, because inventing one that ran
the same files would be theatre.

```bash
cd backend
export TEST_DATABASE_URL="postgres://chaos:test@127.0.0.1:55432/chaos_test"
npm test
```

| Property | Asserted where |
|---|---|
| Argon2id only; no plaintext or reversible password stored, returned or logged | `identity-component.test.ts` |
| Identical passwords → different hashes | same |
| No username oracle — one rejection message, real dummy hash on the unknown path | same |
| Only a SHA-256 **hash** of a session token is stored; no `findByToken` exists | `session-component.test.ts` |
| Token never in a response body; httpOnly cookie | `api.test.ts` |
| Sign-out is genuine; the same cookie is then refused | same |
| Password change evicts other sessions | same |
| No secret in any log line | `redaction.test.ts` (17 tests) |
| **No import row contents in any log line** | `import.test.ts` — captures `process.stdout` |
| No stack trace or SQL reaches the client | `api.test.ts` |
| Scope applied **inside** SQL; out-of-scope rows never fetched | `authorization-enforcement.test.ts` |
| Empty permitted-org list → always-false predicate, never absent | `repository-sql.test.ts` + component tests |
| All 40 permission-matrix cells | `authorization-component.test.ts` |
| Matrix exhaustiveness — proven by **deleting** a cell | same |
| **Org-scope enforcement — proven by NEUTERING the component** | `authorization-enforcement.test.ts` |

### The one that carries the most weight

```bash
# Revert AuthorizationComponent.resolveScope to return orgUnitIds: 'ALL' for TEAM_LEAD, then:
npm test -- tests/supporting-platform/
# Measured: 16 of 83 tests FAIL. If they all pass, the tests prove nothing.
```

---

## 2. Manual authorization probes

`app.inject` covers the pipeline but not the container or proxy. Run these against a real stack, and
**not as Admin** — the entire point of this release is invisible to an Admin session.

| Probe | Expected |
|---|---|
| `TEAM_LEAD` requests a member outside their org unit by id | **404**, not 403 (403 confirms existence) |
| `EXECUTIVE` attempts any write | **403** |
| `TEAM_MEMBER` requests another member's assignments | empty list, not another's data |
| `TEAM_LEAD` POSTs to `/api/imports/members` | **403** |
| Any non-admin GETs `/api/accounts` | **403** |
| Account with NULL `home_org_unit_id` lists members | **empty** — fails closed |
| Send `orgUnitIds` in a request body or query | **ignored** — no handler accepts it (BR-R-06) |
| Tamper with the session cookie value | 401 |

**The last two are the ones worth doing by hand**, because they test that a bypass *does not exist*
rather than that a rule works. A scope filter is only as good as the absence of a way to supply one.

---

## 3. Dependency advisories — measured 2026-07-26

```bash
cd backend  && npm audit --omit=dev    # production surface
cd backend  && npm audit               # including dev tooling
cd frontend && npm audit
```

### ⚠️ One advisory was ACTED ON during this stage

`@fastify/static@8.3.0` carried **four** advisories, three of them **authorization / route-guard
bypass**:

| Advisory | Class |
|---|---|
| GHSA-pr96-94w5-mx2h | path traversal in directory listing |
| GHSA-x428-ghpx-8j92 | route guard bypass via encoded path separators |
| GHSA-8pvw-jcv7-9cmj | authorization bypass via non-canonical URL paths |
| GHSA-83w8-p2f5-377r | route guard bypass via path traversal |

**This was missed at code generation Step 1**, where only the `kysely` advisories were examined —
`npm audit`'s output was read from the tail, and `@fastify/static` was above the cut. Recording that
plainly: the earlier note claiming the advisories were reviewed was incomplete.

"Authorization bypass" in a runtime dependency, in the unit whose entire purpose is authorization
enforcement, is not a finding to defer. **Upgraded to `@fastify/static@10.1.2`** — a semver-major
bump — and verified:

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| Full suite | **501 passed / 21 suites** |
| SPA served from the container | `index=200`, client route falls back `200`, asset `200`, `/api/nope` → `404` JSON |
| Traversal probes (`../`, `..%2f`, `%2e%2e%2f`) | **no file content leaked** — encoded paths fall through to the SPA index |
| Production advisories | **2 → 1** |

The SPA-serving path is **not** covered by the test suite (tests never set `STATIC_DIR`), which is why
this was verified in a running container rather than by the suite alone.

### Remaining: `kysely@0.27.5` — 3 high advisories, all verified NOT REACHABLE

| Advisory | Why not reachable here |
|---|---|
| JSON-path injection via `Kysely<any>` / silenced compile errors | **no** `Kysely<any>`, `@ts-ignore`, `@ts-expect-error` or `as any` anywhere in `backend/src` |
| `JSONPathBuilder.key()` / `.at()` traversal | those APIs are **never called**; the only `jsonb` column (`attributes`) is unused in Phase 1 (BR-C-09) |
| `sql.lit(string)` backslash escaping | **MySQL-specific**; this uses `PostgresDialect`, and all four `eb.lit()` sites pass a **boolean**, not a string |

Verify the claim yourself rather than trusting it:

```bash
grep -rn "Kysely<any>\|@ts-ignore\|@ts-expect-error\|as any" backend/src   # must be empty
grep -rn "\.key(\|\.at(\|jsonPath" backend/src                             # must be empty
grep -rn "\.lit(" backend/src                                              # all must pass booleans
```

**Recommendation for Operations**: plan the `kysely@0.29.4` upgrade deliberately. It is a breaking
change to the layer every authorization filter is built on, so it warrants its own change with the
full suite as the gate — not a rushed `audit fix --force` at the end of a stage.

### Dev-only advisories

The remaining ~21 high advisories are in the `jest` / `babel-plugin-istanbul` chain. **They do not
ship**: verified absent from the runtime image (`node_modules/.bin/jest` → not present). They are a
CI-hygiene item, not a production exposure.

---

## 4. Container and deployment posture

```bash
docker run --rm --entrypoint sh chaos-manager -c 'id'                    # uid=1000(node)
docker compose config | grep -c published                               # 2 — ports 80 and 443 ONLY
docker run --rm --entrypoint sh chaos-manager -c "find /app -iname '*authorization-standin*'"   # empty
git ls-files | xargs grep -l "POSTGRES_PASSWORD=." 2>/dev/null           # must be empty
```

| Property | Status |
|---|---|
| PostgreSQL 5432 not published | ✅ |
| App 3000 not published | ✅ (except via the documented no-TLS override) |
| Runs unprivileged | ✅ uid 1000 |
| No secret in any committed file | ✅ `.env` git-ignored; `.env.example` holds no values; no secret has a default |
| Container logs bounded | ✅ 10 MB × 3 — **fixed this phase**; they were unbounded |
| Proxy body limit | ✅ 6 MB — **added this phase**; there was none |
| TLS | deployment concern (NFR-SE-05); Caddy terminates it |

---

## 5. Findings recorded, not fixed

### A malformed path returns 500 rather than 404

```
GET /../../etc/passwd  →  500
{"error":{"code":"INTERNAL_ERROR","message":"Something went wrong. The problem has been logged.","violations":[]}}
```

**No leak** — the body is the generic envelope, with no stack, no path and no internal detail
(U1-NFR-R-07 holds, and this was verified by reading the response). But it is the same class Unit 1
already fixed once for malformed UUIDs (500 instead of 404), and it will produce error-level log
noise that a probing client can generate at will.

**Recommended**: map an unroutable path to 404. Low severity, no exposure.

### Not attempted, and why

| Not done | Why |
|---|---|
| Penetration test | Out of scope for Phase 1; NFR-SE-01 disables the security extension and NFR-SE-04 puts no compliance regime in scope |
| SAST / DAST tooling | No CI to run it in (NFR-Q-01) |
| Encryption at rest | Deferred (NFR-SE-05) |
| Rate limiting / brute-force lockout | No requirement; Argon2id makes offline cracking expensive but there is **no** online attempt throttle. Worth raising in Operations |
| Session fixation / CSRF token | Same-origin SPA with an httpOnly `SameSite` cookie; no cross-origin form posts exist. Recorded rather than assumed safe forever |
