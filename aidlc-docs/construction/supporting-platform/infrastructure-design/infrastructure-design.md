# Infrastructure Design — `supporting-platform` (Unit 2)

**Unit**: 2 of 2 · **Stage**: Infrastructure Design
**Answers**: I-Q1:A, I-Q2:A, I-Q3:A — all by AI recommendation, continuing under the user's instruction.
Rationale in §8.

---

## 1. The Delta, Stated First

Unit 1's `infrastructure-design.md` and `deployment-architecture.md` describe the whole topology. This
document records **only what changes**, and the honest total is small:

| Change | Kind |
|---|---|
| `request_body { max_size 6MB }` on the import path in the Caddyfile | Networking — new |
| `logging:` rotation options on all three compose services | Monitoring — **fixes a pre-existing gap** |
| `IMPORT_MAX_ROWS`, `IMPORT_MAX_BYTES` env vars | Configuration — new |
| Per-route `bodyLimit` of 5 MB on the import route | Application config — new |
| 60 s request timeout on the import route | Application config — new |
| `LOG_REDACT_PATHS` extended for import payload paths | Configuration — hardening |

**Nothing else.** No container, no image, no volume, no port, no network, no migration, no managed
service. Two of the six changes above are fixes to configuration gaps that exist in the deployment
**today** and affect Unit 1.

---

## 2. Component-to-Infrastructure Map

Unchanged from Unit 1. Unit 2's two new components are code inside the existing `app` container:

| Logical component | Infrastructure | New? |
|---|---|---|
| C-09 Authorization | in-process module, `app` container | code only |
| C-10 Import | in-process module, `app` container | code only |
| S-02 AccessControlService | in-process, `app` container | unchanged from Unit 1 |
| S-09 ImportService | in-process, `app` container | code only |
| F-07 Import UI | static asset in `app`'s `/app/public`, served by Fastify | code only |
| Uploaded CSV | **process memory only** (BR-IM-25) | no infrastructure |
| Permission matrix | **compiled constant** (BR-R-14) | no infrastructure |
| Import report | **HTTP response only** (BR-IM-19) | no infrastructure |

The last three rows are the notable ones. A conventional implementation of this unit would have needed
an object store for uploads, a table for the permission matrix and a table for import history. All three
were designed away, and each absence is traceable to a recorded decision (BR-IM-25, Q1:A, Q10:A).

---

## 3. Networking

### 3.1 Proxy request body limit (I-Q1:A)

```
{$CHAOS_HOSTNAME:localhost} {
	# Import uploads a CSV. The app enforces 5 MB itself (BR-IM-02) and returns a message naming
	# both the byte and row limits; this proxy limit is set ABOVE the app's on purpose, so a
	# just-over-limit file still reaches the app and gets the useful error rather than a bare 413.
	# The proxy limit exists to stop the absurd case — a multi-hundred-MB body — from being
	# streamed into Node at all.
	request_body {
		max_size 6MB
	}
	reverse_proxy app:3000
	...
}
```

Two limits at two layers, deliberately **not** the same number:

| Layer | Limit | Purpose |
|---|---|---|
| Caddy | 6 MB | reject the absurd before it reaches the application |
| Fastify (import route only) | 5 MB | the **real** limit, with a message naming rows and bytes |

Making them equal would mean a 5.1 MB file gets Caddy's generic 413 instead of the app's actionable
error — at precisely the boundary a user is most likely to hit.

### 3.2 Confirmed unchanged

| Item | Finding |
|---|---|
| **Caddy response timeout** | Caddy 2's `reverse_proxy` has **no** default response timeout, so a 30 s import completes without proxy intervention. **Verified from the default rather than assumed** — a proxy timeout below the import budget would abort a request mid-transaction. |
| **Published ports** | 80 and 443 only. Unchanged. PostgreSQL's 5432 and the app's 3000 remain unpublished. |
| **CSP** | `default-src 'self'` unchanged. A native `<input type="file">` plus `FormData` needs no CSP relaxation — worth confirming, because a file-upload widget is a common reason CSP gets loosened. |
| **`encode zstd gzip`** | Response-only; no effect on upload handling. |
| **HSTS, `X-Frame-Options`, `Referrer-Policy`, `-Server`** | Unchanged. |

---

## 4. Compute (I-Q2:A)

**No resource limits are added.** The expected footprint is documented instead.

| Service | Steady state | Peak | Note |
|---|---|---|---|
| `app` | ~80–120 MB RSS | **+40–60 MB during an import** | 5 MB file buffer, ~2,000 parsed row objects, validation state, and the batched reference-data maps |
| `db` | per PostgreSQL 16 defaults | +transaction working set for ~2,000 inserts | manages its own memory better than a container limit does |
| `proxy` | ~20 MB | negligible | streams, does not buffer at 6 MB |

**Host requirement**: unchanged from Unit 1 — 2 GB RAM is comfortable, and an import moves the app's
peak by tens of megabytes, not hundreds.

**Why no limit.** Choosing a memory ceiling without a measurement is the same mistake I declined in
N-Q2:A for an index. A limit set too low converts a *successful* import into an OOM kill that presents
as a crash — strictly worse than the unbounded growth it guards against, on a single-host internal tool
with low-tens concurrency (NFR-S-02). Should a leak ever be observed, a limit becomes evidence-based
rather than speculative.

---

## 5. Monitoring and Logging (I-Q3:A)

### 5.1 Log rotation — a fix, not an addition

```yaml
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```

Applied to **all three** services. This addresses a gap that exists in Unit 1's deployment today:
Docker's default `json-file` driver has **no size cap**, so container logs grow until the disk fills.
The stack has been running unbounded.

**Unit 2 makes it matter more**, because N-Q5:A adds a warn line per authorization refusal, but the risk
is pre-existing and would eventually have taken down a long-running deployment. Bounded at ~30 MB per
service, ~90 MB total.

This does **not** contradict NFR-Q-02. That requirement defers log **aggregation and monitoring
infrastructure** — a collector, a dashboard, alerting. Rotation is three lines of compose and introduces
no infrastructure at all.

### 5.2 What is logged, and what must never be

| Event | Level | Contains | Must NOT contain |
|---|---|---|---|
| Authorization refusal | `warn` | role, resource kind, operation, outcome | **the target record's id, name or any content** (U2-NFR-SE-07) |
| Import start | `info` | kind, row count, byte size | file name is acceptable; **no row contents** |
| Import complete | `info` | created, failed, conflicted counts | **no row contents** (BR-IM-24) |
| Import row failure | `warn` | line number, reason codes | **no field values** — a reason may say "email is invalid", never *which* email |
| Import file refused | `warn` | reason, limit, actual size | — |

**The refusal log is the subtle one.** Logging the target id would leak through the log exactly what the
refusal withheld from the response. A log line reading "TEAM_LEAD refused read on MEMBER" is useful; one
naming the member defeats the control it was added to observe.

`LOG_REDACT_PATHS` is extended to cover import payload paths, so a stray future log of a parsed row is
structurally redacted rather than relying on every call site remembering.

---

## 6. Configuration Contract Additions

| Variable | Default | Secret? | Purpose |
|---|---|---|---|
| `IMPORT_MAX_ROWS` | `2000` | No | BR-IM-02 row ceiling; lowerable if U2-NFR-P-03's measurement demands it |
| `IMPORT_MAX_BYTES` | `5242880` | No | BR-IM-02 byte ceiling, enforced at the multipart boundary |

Both carry safe defaults and are passed through compose as `${VAR:-default}` like every other non-secret.
**No new secret is introduced**, so `.env.example` gains no value-bearing key — it gains two documented
numbers, which is a different thing.

The application must **fail fast** on a malformed value (non-numeric, zero, negative), consistent with
Unit 1's existing config validation. A row cap of `0` silently refusing every import is the failure mode
that validation prevents.

---

## 7. Verification

| Check | Command or method |
|---|---|
| Stand-in is absent **from the built image** | `docker compose exec app find /app -name '*authorization-standin*'` → empty |
| New dependencies install from the manifest alone | `docker build` — the check that caught Unit 1's undeclared `user-event` |
| Proxy rejects an over-large body at the edge | POST 8 MB → Caddy 413, request never reaches Node |
| App returns the **useful** error at 5.1 MB | POST 5.1 MB → app's message naming both limits |
| 5 MB limit is import-route-only | POST a 2 MB body to `/api/auth/sign-in` → refused at 1 MB |
| Log rotation is active | `docker inspect` shows `max-size` on all three services |
| No refusal log contains a target id | grep the log after a refusal sequence |
| No import log contains row contents | grep the log for a seeded member's email after an import |
| Still only two published ports | `docker compose config` |
| No new volume | `docker volume ls` → the same three |
| No migration ran | migration table unchanged after deploying Unit 2 |
| Import writes nothing to disk | container filesystem diff across a 5 MB import |

The first check exists because verifying the stand-in's deletion in the **source tree** does not prove it
is gone from a deployed image built before the deletion.

---

## 8. Rationale for the Three Recommended Answers

| Q | Chosen | Why |
|---|---|---|
| **1** | **A — proxy limit above the app's** | Two layers with two different numbers, on purpose. The proxy stops the absurd case cheaply; the app owns the *real* limit and the message that names it. B's single number costs the user a useful error exactly at the boundary they are most likely to hit; C leaves a single enforcement point and lets an arbitrarily large body stream into Node before refusal. |
| **2** | **A — no limits, document the footprint** | Picking a memory ceiling without a measurement is the same speculation I declined for the index in N-Q2:A, and it has a worse failure mode: a limit set too low turns a successful import into an OOM kill that looks like a crash. C (app only) was the runner-up and is the right *next* step if a leak is ever observed — but it would still be a guessed number today. |
| **3** | **A — rotation on all services** | This is a genuine pre-existing defect, not a Unit 2 need: Docker's default `json-file` has no size cap, so the deployment has been growing logs without bound since Unit 1 shipped. Three lines of compose, no new infrastructure, and it does not contradict NFR-Q-02 — which defers log *aggregation*, not rotation. C's lower log level was rejected because raising it to debug a live problem then needs a restart. |

---

## 9. Validation

| Check | Result |
|---|---|
| Every logical component mapped to infrastructure | **Pass** — §2, including the three that map to *no* infrastructure |
| All seven infrastructure categories evaluated | **Pass** — with written justification for the four marked no-change or N/A, in the plan §0 |
| No new managed service | **Pass** — NFR-T-04 upheld; still no cloud dependency |
| Deployment target unchanged | **Pass** — on-premises Docker Compose (NFR-T-01) |
| Only 80 and 443 published | **Pass** |
| No secret added to a committed file | **Pass** — both new variables are non-secret numbers |
| Async/messaging infrastructure | **Correctly absent** — Q13:A chose synchronous import |
| Unit 2 requires no migration | **Pass** — `001_initial_schema.ts` remains final |
| Pre-existing gaps found and fixed | **2** — unbounded container logs; implicit proxy body policy |
