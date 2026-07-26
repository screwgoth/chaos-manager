# Integration Test Instructions

## Purpose, and an honest framing

This project is **one deployable containing two modules**, not two services. So "integration between
units" does not mean network calls between processes — it means:

1. Unit 2's authorization policy governing **Unit 1's** data paths.
2. Unit 2's import writing **Unit 1's** entities through **Unit 1's** components.
3. Unit 1's screens changing behaviour because Unit 2 is present.

All three are covered by automated suites that run against a real PostgreSQL 16. There is no separate
`test:integration` script, because the integration tests *are* the database-backed suites — inventing
a second command that ran the same files would be theatre.

```bash
cd backend
export TEST_DATABASE_URL="postgres://chaos:test@127.0.0.1:55432/chaos_test"
npm test    # 501 passed / 21 suites, measured
```

---

## Cross-unit scenarios, and where each is covered

### Scenario 1 — Unit 2 authorization governs Unit 1's reads (X-1)

**File**: `tests/supporting-platform/authorization-enforcement.test.ts` (17 tests)

| Step | Expected |
|---|---|
| Build the org tree Organisation → {Platform, Sales} | — |
| Ada in Platform: 80% on a Platform project, 50% on a Sales project (override) | 130% total |
| Sam in **Sales**, staffed on a **Platform** project | the BR-R-12 project side |
| Platform lead lists members | sees Ada, **not** Sam; `total: 1` |
| Platform lead reads Sam by id | **404**, not 403 (BR-R-16 — 403 confirms existence) |
| Lead with **no** org unit lists anything | **empty**, fails closed (BR-R-11) |
| Resource Manager at a **root** unit | sees everything (BR-R-09) |
| Resource Manager at a **child** unit | confined |
| Lead at the **root** unit | sees members in **child** units — subtree, not just the root |
| Platform lead views Ada's total | **130%**, not 80% (**BR-R-13**) |

**BR-R-13 is the scenario that matters most.** The wrong implementation filters assignments by scope
and *then* sums, reporting "80% booked, 20% free" for someone at 130% — free capacity on a person who
has none, which is the single failure this application exists to prevent.

**Proven non-vacuous**: neutering the component turns 16 of 83 tests red. See
`unit-test-instructions.md` §4 for the procedure.

### Scenario 2 — Unit 2 import writes Unit 1's entities through Unit 1's components (X-2)

**File**: `tests/supporting-platform/import.test.ts` (29 tests)

The integration property being tested is **BR-IM-11**: import must not reimplement a single
validation rule, because a second copy drifts from the first and imported data would then obey
different rules from hand-entered data.

| Step | Expected |
|---|---|
| Import an OFF_ROLL row missing `vendor_name` | row fails — Unit 1's **BR-M-06** refused it, not import |
| Import a mixed file | valid rows land, invalid ones are reported, in ONE operation |
| Import 2,000 rows | one transaction; **6.8 s** measured |
| Force a mid-write database failure | **nothing** created — full rollback (BR-IM-16) |
| Re-upload the same file | nothing created, every row a conflict (**idempotent**, BR-IM-10) |
| Import referencing an unknown skill | row fails; reference data is **never** created (BR-IM-13) |
| Import a file with a `day_rate` column | ignored **and named**; no commercial data lands (BR-M-09) |

### Scenario 3 — Unit 2 makes Unit 1's dormant columns live

**File**: `tests/supporting-platform/account-link.test.ts` (16 tests)

`user_account.linked_member_id` was written by nothing in Unit 1. Unit 2 writes it, and the
integration consequence is severe enough to be the headline test:

| Step | Expected |
|---|---|
| Link account `ada` to member Ada | `/api/members/me` returns Ada |
| Link the same account to a different member | **409**, naming the current member |
| Link a different account to Ada | **409**, naming the account that holds the link |
| The two refusals | carry **different** machine-readable reason codes |
| **Unlink a TEAM_MEMBER** | `accessRevoked: true`, and the account can then see **nothing** |
| Unlink a RESOURCE_MANAGER | `accessRevoked: false` — their access comes from their org unit |
| Relink | access restored |

---

## Setup

```bash
# 1. A disposable database. Do NOT publish the deployment's own db port to run tests.
docker run -d --name chaos-test-db \
  -e POSTGRES_PASSWORD=test -e POSTGRES_USER=chaos -e POSTGRES_DB=chaos_test \
  -p 127.0.0.1:55432:5432 postgres:16-alpine
sleep 8 && docker exec chaos-test-db pg_isready -U chaos -d chaos_test

# 2. Run
cd backend
export TEST_DATABASE_URL="postgres://chaos:test@127.0.0.1:55432/chaos_test"
npm test
```

**Each database-backed suite drops and recreates the `public` schema in its own `beforeAll`**, then
runs migrations. That is why `jest.config.js` sets `maxWorkers: 1` when `TEST_DATABASE_URL` is
present — Unit 1 lost an afternoon to two suites dropping each other's schema in parallel, producing
27 spurious failures. **Do not raise that worker count.**

### Cleanup

```bash
docker rm -f chaos-test-db
```

The container is disposable; there is nothing to preserve. If you reuse an existing one, **check its
credentials** — a stale container with a different password produces
`password authentication failed`, which reads like a code failure and is not.

---

## Manual end-to-end verification against the real stack

The automated suites use `app.inject`, which exercises the full Fastify pipeline but **not** the
container, the proxy, or a browser. Run this once per release:

```bash
cp .env.example .env       # fill in POSTGRES_PASSWORD and INITIAL_ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f app # expect: migrations applied → seed → scope roots loaded → listening
curl -sk https://localhost/health    # {"status":"ok","database":true}
```

Then, **signed in as a scoped account, not as admin**:

| Check | Why |
|---|---|
| Sign in as a `TEAM_LEAD` and list people | The entire point of this release is invisible to an Admin session |
| Upload a small CSV via **Import** | Exercises multipart through Caddy, which `app.inject` bypasses |
| Upload a >6 MB file | Must be refused **by Caddy** before reaching Node |
| Upload a 5.1 MB file | Must reach the app and get the message naming **both** limits |
| Open **Bench**, **Over capacity**, **Contracts** | Five new screens; **no browser has rendered them** |

> ⚠️ **The last row is the largest open risk in the project.** Playwright has no Chromium in the
> development environment, so no screen has been visually verified. It typechecks, builds, is
> unit-tested and is served correctly — but the first person to look at it will be a user.

### Before deploying over an existing installation

This release **changes what current users can see**. Run the pre-deployment query in
`../supporting-platform/infrastructure-design/deployment-architecture.md` §3.2 first: any
`TEAM_LEAD` or `RESOURCE_MANAGER` with a NULL `home_org_unit_id` will see **nothing** afterwards,
which is correct fail-closed behaviour and looks exactly like a broken account.
