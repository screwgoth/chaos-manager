# Deployment Architecture — `supporting-platform` (Unit 2)

**Unit**: 2 of 2 · **Stage**: Infrastructure Design

Unit 1's `deployment-architecture.md` remains the authoritative document for topology, build,
first-run setup, upgrade, rollback, backup and the operational runbook. This document records the Unit 2
deltas and the one procedure Unit 2 introduces: **deploying a change that removes a security stand-in.**

---

## 1. Topology — Unchanged

```
                    Internet / LAN
                          |
                    :80  :443            <-- the ONLY published ports
                          |
                  +---------------+
                  |     proxy     |   Caddy 2 — TLS, security headers,
                  |               |   NEW: request_body max_size 6MB
                  +-------+-------+
                          | app:3000  (never published)
                  +-------+-------+
                  |      app      |   Node 22 — Fastify + SPA assets
                  |               |   Unit 1 + Unit 2 modules, ONE process
                  +-------+-------+
                          | db:5432   (never published)
                  +-------+-------+
                  |      db       |   PostgreSQL 16, named volume
                  +---------------+

Three containers. Same three as Unit 1. Unit 2 adds code to `app`, not a service.
```

---

## 2. Compose Deltas

Two changes, both small, one of them a fix to something already broken.

### 2.1 Log rotation — added to **all three** services

```yaml
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```

**This fixes a pre-existing defect.** Docker's default `json-file` driver applies no size cap, so the
running deployment has been accumulating logs without bound since Unit 1 shipped. Unit 2's refusal
logging accelerates it; it did not cause it.

### 2.2 Two new environment values on `app`

```yaml
      IMPORT_MAX_ROWS: ${IMPORT_MAX_ROWS:-2000}
      IMPORT_MAX_BYTES: ${IMPORT_MAX_BYTES:-5242880}
```

Non-secret, defaulted, and validated at startup — a malformed value fails fast rather than silently
refusing every import.

### 2.3 Explicitly NOT changed

`image` · `build` · `depends_on` and its health conditions · `healthcheck` definitions ·
`volumes` · `networks` · `ports` · `restart` policies · every existing environment variable.

---

## 3. The Deployment That Removes a Security Stand-In

Unit 2's deployment is not an ordinary upgrade. It is the deployment where **org-scope enforcement
begins**, and it will visibly change what existing users can see. That needs saying before it happens
rather than being discovered as a bug report.

### 3.1 What users will notice immediately

| Role | Before Unit 2 | After Unit 2 |
|---|---|---|
| `ADMIN` | everything | everything — **no change** |
| `EXECUTIVE` | everything, read-only | everything, read-only — **no change** |
| `RESOURCE_MANAGER` attached to a **root** org unit | everything | everything — **no change** |
| `RESOURCE_MANAGER` attached to a **child** org unit | everything | **only their unit and its children** |
| `TEAM_LEAD` | **everything** | **only their unit and its children** |
| `TEAM_LEAD` with NULL `home_org_unit_id` | everything | **nothing** — fails closed (BR-R-11) |
| `TEAM_MEMBER` | own data only | own data only — **no change** |

**The two rows to act on before deploying:**

1. **A `TEAM_LEAD` or child-unit `RESOURCE_MANAGER` will lose visibility they currently have.** That is
   the intended fix, not a regression — but it will be reported as one if nobody is told.
2. **An account with a NULL `home_org_unit_id` will see nothing at all.** This is correct fail-closed
   behaviour, and it will look exactly like a broken account.

### 3.2 Pre-deployment check — run this first

```sql
-- Accounts that will lose ALL visibility after Unit 2 deploys.
-- Fix these BEFORE deploying, not after the support call.
SELECT username, role
FROM user_account
WHERE role IN ('TEAM_LEAD', 'RESOURCE_MANAGER')
  AND home_org_unit_id IS NULL
  AND is_active;

-- Team members whose account is not linked to a member record: these already see
-- nothing (Unit 1 enforces BR-R-18), but confirm the list has not grown.
SELECT username FROM user_account
WHERE role = 'TEAM_MEMBER' AND linked_member_id IS NULL AND is_active;
```

If the first query returns rows, **assign each a home org unit before deploying**. There is no migration
to do this automatically, and deliberately so: guessing which org unit a manager belongs to is not
something a migration should decide.

### 3.3 Deployment procedure

```bash
# 1. Run the pre-deployment check above. Resolve any rows it returns.

# 2. Back up first. This deployment changes no schema, but a rollback is only
#    as good as the backup that precedes it.
docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > pre-unit2.sql

# 3. Build and deploy.
git checkout aidlc/construction-supporting-platform
docker compose build app
docker compose up -d app proxy      # proxy too — the Caddyfile changed

# 4. Verify the stand-in is gone from the IMAGE, not just the source tree.
docker compose exec app find /app -name '*authorization-standin*'   # must be empty

# 5. Verify no migration ran. Unit 2 adds none.
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SELECT name FROM kysely_migration ORDER BY timestamp;'        # still only 001

# 6. Smoke-test enforcement with a real scoped account, not with admin.
#    Signing in as admin proves nothing — admin was unrestricted before and after.
```

**Step 6 is the one people skip.** The entire point of this deployment is a change that is invisible to
an Admin session. Verifying with Admin credentials tests nothing that changed.

### 3.4 Rollback

Unit 2 adds **no migration**, which makes rollback unusually clean:

```bash
git checkout aidlc/construction-core-domain
docker compose build app && docker compose up -d app proxy
```

No schema to reverse, no data to migrate back. **The cost of rolling back is that org-scope enforcement
turns off again** and every Team Lead sees everything — so a rollback must be a deliberate decision
about a security control, not a reflex response to an unrelated bug.

`linked_member_id` values written by US-ACC-04 while Unit 2 was deployed survive a rollback harmlessly:
the column exists in Unit 1's schema and Unit 1 reads it into `VerifiedIdentity` already.

---

## 4. First-Run and Import Operations

### 4.1 Bulk-loading a new deployment

Import exists for exactly this, and the order matters because BR-IM-13 refuses unmatched reference data:

```
1. Sign in as admin.
2. Create org units             (Admin > Org units)      — import resolves them by name
3. Create roles and skills      (Admin > Reference data) — import NEVER creates these (BR-IM-13)
4. Download the member template (Import)
5. Upload members
6. Download the project template, upload projects
7. Create assignments in-app — import does NOT load assignments (FR-I-05: no historical migration)
```

Steps 2 and 3 cannot be skipped. An import run before reference data exists fails **every row**, each
with a resolvable reason — which is correct behaviour but a poor first experience, so the import screen
should be reached from a populated system.

### 4.2 Operational notes

| Situation | What to do |
|---|---|
| Import appears to hang | Expected for a large file — it is synchronous (Q13:A). A 2,000-row file may take up to 30 s. |
| Import fails at 30+ s | Check `docker compose logs app` for the transaction rollback. **Nothing was created** (BR-IM-16); re-upload after investigating. |
| Every row reports a conflict | The file was already imported. This is idempotency working (BR-IM-10), not a failure. |
| Every row fails on org unit or role | Reference data or org units do not exist yet. See §4.1. |
| An admin needs the import report later | **It is not retrievable** (Q10:A). The report exists only in the response. Accepted gap. |
| Commercial columns were in the file | They were ignored and named in the result notice (BR-IM-04, BR-M-09). Nothing to clean up. |

---

## 5. Monitoring

Unchanged in kind — `docker compose logs` and the existing `/health` endpoint. NFR-Q-02 still defers
aggregation and alerting.

What Unit 2 adds is **one signal worth watching manually**:

```bash
# Authorization refusals. A steady trickle is normal. A sudden burst from one account
# is either a misconfigured user or someone probing ids.
docker compose logs app | grep -i 'refus'
```

Per U2-NFR-SE-07 these lines carry role, resource kind, operation and outcome — never the target's
identity, so the log cannot be mined for the data the refusals withheld.

---

## 6. Validation

| Check | Result |
|---|---|
| Topology unchanged | **Pass** — same three containers |
| Only 80 and 443 published | **Pass** |
| No new volume | **Pass** — nothing written to disk during import |
| No migration | **Pass** — `001` remains the only one |
| Rollback procedure has no schema step | **Pass** — and its security consequence is stated |
| Pre-deployment check for accounts that will lose access | **Pass** — §3.2, with the SQL |
| Stand-in deletion verified in the **image** | **Pass** — §3.3 step 4 |
| Enforcement smoke-tested with a **scoped** account, not Admin | **Pass** — §3.3 step 6, flagged as the commonly skipped step |
| Pre-existing defect fixed | **1** — unbounded container logs |
| No secret in a committed file | **Pass** |
