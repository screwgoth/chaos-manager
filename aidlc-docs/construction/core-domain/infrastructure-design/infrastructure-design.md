# Infrastructure Design — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` (1 of 2) · **Stage**: Infrastructure Design
**Date**: 2026-07-25

## Decisions Applied

| Q | Decision |
|---|---|
| 1 | **One environment — production only**, plus developers running the same Compose stack locally |
| 2 | **Single Linux VM or physical server** running Docker and Docker Compose |
| 3 | **Build on the host from source** — `docker compose build`; no registry |
| 4 | App 1 vCPU / 1 GB · PostgreSQL 1 vCPU / 2 GB · 20 GB disk |
| 5 | **PostgreSQL in a container** managed by Compose, named volume |
| 6 | **Documented `pg_dump` command and suggested cron schedule** — no tooling built |
| 7 | **Caddy reverse proxy terminating TLS** in front of the app |
| 8 | **Host IP and a specific port** — see §7 for the certificate consequence |
| 9 | Docker log driver + `/health`; no monitoring stack |
| 10 | **Fully shared** infrastructure across both units |
| 11 | **No messaging infrastructure**; import runs synchronously |

---

## 1. Component-to-Infrastructure Map

| Logical component | Infrastructure home |
|---|---|
| C-01…C-08 domain components, C-11 repositories, C-12 routes | **`app` container** — single Node.js process |
| Authorization stand-in (X-1) | **`app` container** — same process; replaced by Unit 2 code in the same image |
| F-01…F-08 frontend | **Static assets built by Vite**, served by Fastify from the `app` container |
| PostgreSQL | **`db` container** |
| Entity data + `AssignmentHistory` + `Session` rows | **Named Docker volume** `chaos_pgdata` |
| TLS termination, HTTP→HTTPS redirect | **`proxy` container** (Caddy) |
| Request logs | **stdout → Docker log driver** |
| Configuration and secrets | **Environment variables** from a host `.env` file, never committed |
| Schema migrations | **Run by the `app` container at startup**, before accepting traffic |

**Three containers, one Node process.** The single-Node-process constraint (unit plan Q3:A) refers to
application processes. Caddy and PostgreSQL are infrastructure, not a second copy of the application.

---

## 2. Container Specifications

### `app`

| Property | Value |
|---|---|
| Base image | `node:22-alpine` |
| Build | Multi-stage: stage 1 builds the frontend with Vite; stage 2 builds the backend TypeScript; stage 3 is a runtime image with production dependencies plus the two build outputs |
| Final image contents | Compiled backend JS, `frontend/dist` static assets, `node_modules` (production only), migration files |
| Process | `node dist/server.js` |
| Exposed port | `3000` — **internal to the Compose network only, not published to the host** |
| Resources | 1 vCPU, 1 GB (Q4:A) |
| Restart policy | `unless-stopped` |
| User | Non-root |
| Health | `GET /health` |
| Depends on | `db` (with a Compose healthcheck condition) |

**Why multi-stage matters here**: it keeps TypeScript, Vite, and dev dependencies out of the runtime
image. A single-stage build would ship the entire toolchain to a production host for no benefit.

### `db`

| Property | Value |
|---|---|
| Image | `postgres:16-alpine` |
| Port | `5432` — **internal only; deliberately not published to the host** |
| Volume | `chaos_pgdata` → `/var/lib/postgresql/data` |
| Resources | 1 vCPU, 2 GB (Q4:A) |
| Restart policy | `unless-stopped` |
| Healthcheck | `pg_isready` |
| Credentials | From environment variables; never defaulted in the compose file |

**Port 5432 is not published.** Nothing outside the Compose network needs direct database access, and
publishing it would expose the database to the host network for no operational gain. Administration is
via `docker compose exec db psql`.

### `proxy`

| Property | Value |
|---|---|
| Image | `caddy:2-alpine` |
| Published ports | `443` (HTTPS) and `80` (redirect to HTTPS) on the host IP |
| Volumes | Caddyfile (read-only), plus named volumes for certificate data and config |
| Resources | No explicit limit — negligible footprint |
| Restart policy | `unless-stopped` |
| Role | TLS termination, HTTP→HTTPS redirect, reverse proxy to `app:3000` |

---

## 3. Storage

| Store | Mechanism | Persistence |
|---|---|---|
| Application data | Named volume `chaos_pgdata` | Survives container recreation and host restart |
| TLS certificates | Named volumes `caddy_data`, `caddy_config` | Survives restart; avoids re-issuing certificates |
| Uploaded CSV files (Unit 2) | **Not persisted** — parsed in memory within the request, then discarded | By design; the import report is returned, the file is not kept |
| Logs | Docker log driver, `json-file` with rotation | Rotated; not archived |
| Sessions | `Session` table in PostgreSQL | **Survives app restart** — the reason for Q8:A of Functional Design |

**Disk sizing** (20 GB, Q4:A): at the design target the entire dataset is a few megabytes. `AssignmentHistory`
grows one row per change. 20 GB is dominated by the PostgreSQL installation and WAL, not by data, and
gives room for years of history and backup files on the same disk.

---

## 4. Networking

```
Host (single Linux VM)
  |
  |-- published :80  --> proxy (redirect to :443)
  |-- published :443 --> proxy --> app:3000
  |
  +-- Docker bridge network "chaos_net" (internal)
        proxy  <-> app     (HTTP, internal)
        app    <-> db      (PostgreSQL wire protocol, internal)
        db                 (no external exposure)
```

| Rule | Detail |
|---|---|
| Published to host | Only `80` and `443`, and only on the proxy |
| Internal only | `app:3000` and `db:5432` |
| Load balancing | None — single instance (U1-NFR-A-02) |
| API gateway | None — the proxy is a reverse proxy, not a gateway. No rate limiting, no auth at the edge; authorization is server-side in the app (U1-NFR-SE-03) |
| Egress | None required — the application makes no outbound calls (NFR-IN-01) |

---

## 5. Configuration Contract

All configuration is environment variables (U1-NFR-O-06), supplied from a host `.env` file that is
**git-ignored and never committed**.

| Variable | Purpose | Secret | Default |
|---|---|---|---|
| `NODE_ENV` | Runtime mode | no | `production` |
| `PORT` | App listen port | no | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | **yes** | none — startup fails without it |
| `POSTGRES_USER` | DB user (db container) | no | none |
| `POSTGRES_PASSWORD` | DB password (db container) | **yes** | none — no default, deliberately |
| `POSTGRES_DB` | Database name | no | `chaos` |
| `SESSION_COOKIE_NAME` | Session cookie name | no | `chaos_session` |
| `SESSION_IDLE_MINUTES` | Sliding inactivity window | no | `30` (Q9:B of Functional Design) |
| `SESSION_COOKIE_SECURE` | `Secure` flag on the cookie | no | `true` |
| `CONTRACT_EXPIRY_WARN_DAYS` | Window for US-MEM-06 | no | `30` |
| `ARGON2_MEMORY_KIB`, `ARGON2_ITERATIONS`, `ARGON2_PARALLELISM` | Hashing parameters | no | tuned defaults |
| `LOG_LEVEL` | pino level | no | `info` |
| `INITIAL_ADMIN_USERNAME` | First-run admin bootstrap | no | none |
| `INITIAL_ADMIN_PASSWORD` | First-run admin bootstrap | **yes** | none |

### Rules

1. **Startup fails fast** on any missing required variable, with the variable named (U1-NFR-O-03). No degraded start.
2. **No secret has a default.** A missing `POSTGRES_PASSWORD` must stop the deployment, not silently become empty.
3. **No secret is ever logged**, including in startup diagnostics or error traces (U1-NFR-O-04). Connection strings are redacted before any log line.
4. `INITIAL_ADMIN_PASSWORD` is consumed **once** at first run and should be removed from `.env` afterwards; the deployment guide says so explicitly.

---

## 6. Logging and Health

| Concern | Design |
|---|---|
| Destination | `stdout` → Docker `json-file` driver with size and file-count rotation |
| Format | pino default; one line per request: method, path, status, duration (U1-NFR-O-01) |
| Level | `info` in production; `debug` available via `LOG_LEVEL` |
| Redaction | Session tokens, cookies, `DATABASE_URL`, and any password field are redacted at the logger, not at each call site |
| `GET /health` | Returns `200` with `{status, uptime, database: 'ok'\|'unreachable'}`; returns `503` when the database is unreachable |
| Health auth | **Unauthenticated** — it is a liveness probe and exposes no data |
| Monitoring stack | **None** (Q9:A). Diagnosis is `docker compose logs`. |

**Deliberately not built** (U1-NFR-O-05): structured JSON log shipping, metrics, tracing, alerting,
dashboards, and a Compose-level auto-restart-on-unhealthy policy. Q9:A chose plain logs and health over
option B's self-restarting container.

---

## 7. TLS and the Q8 Certificate Consequence

**Q7:A** puts Caddy in front terminating TLS. **Q8:B** accesses the service by **host IP and port** rather
than a DNS name. These two work together, but with one consequence worth stating plainly rather than
discovering at deployment.

**TLS certificates are normally issued to hostnames.** With IP-based access, the options are:

| Option | Result |
|---|---|
| **Internal CA certificate with an IP SAN** (recommended) | Clean HTTPS with no browser warning, provided the internal CA is already trusted on user machines — usually true in a corporate environment |
| **Caddy's self-signed local certificate** | Works immediately with zero configuration, but **every browser shows a certificate warning** on first visit until the user accepts it |
| **Switch to an internal DNS name later** | A one-line Caddyfile change plus a DNS record; the application needs no change |

**Design position**: Caddy is configured with the site address as the host IP. If your organization has an
internal CA, issue a certificate with an IP SAN and mount it. Otherwise Caddy's self-signed certificate
works and users will see a first-visit warning.

**`SESSION_COOKIE_SECURE=true` is correct either way** — HTTPS over an IP still satisfies the `Secure`
flag. The cookie is not weakened by the IP-based access; only the certificate trust story is.

> **Recommendation, not a blocker**: if an internal DNS name is available, using it removes the
> certificate friction entirely and costs nothing. This is the one loose end in an otherwise settled
> infrastructure design.

---

## 8. Async Processing Determination (Q11)

**No messaging infrastructure. No broker, no queue, no worker container.**

| Unit | Async need | Determination |
|---|---|---|
| `core-domain` | **None.** Every operation is synchronous request/response. The heaviest — the availability query — is budgeted at ~210 ms server time. | No async required |
| `supporting-platform` | CSV import of up to ~200 member rows with per-row validation | **Runs synchronously within the request** (Q11:A) |

**Justification for the import decision**: 200 rows with per-row validation and a single batched insert is
a few seconds at worst. A job queue would introduce a broker, a worker process, job state, and a polling
protocol — infrastructure serving a problem that does not exist at this scale. If the import ever grows to
thousands of rows and becomes uncomfortably slow, Q11:B (in-process background task with client polling)
is the next step and still requires no broker.

**Recorded explicitly** because the rules require the messaging category to be evaluated rather than
skipped: it was evaluated, and the answer is that none is needed.

---

## 9. Validation

| Check | Result |
|---|---|
| Nothing requires a cloud managed service (NFR-T-04) | **Pass** — three containers on one host, no external dependency |
| Single Node application process (unit plan Q3:A) | **Pass** — `app` is the only Node process; Caddy and PostgreSQL are infrastructure |
| Restart safety, no in-memory state (U1-NFR-A-03) | **Pass** — sessions are database rows; no application state outside PostgreSQL |
| Database persistence across restart (U1-NFR-A-04) | **Pass** — named volume `chaos_pgdata` |
| No secret committed to the repository (U1-NFR-O-06) | **Pass** — host `.env`, git-ignored, no defaults for secrets |
| No credential or token can reach a log line (U1-NFR-O-04) | **Pass** — redaction configured at the logger |
| Database not reachable from outside the host (U1-NFR-SE-*) | **Pass** — port 5432 not published |
| Backup possible (Q6:A) | **Pass** — documented in `deployment-architecture.md` §6 |
| Both units share the same infrastructure (Q10:A) | **Pass** — see `construction/shared-infrastructure.md` |
