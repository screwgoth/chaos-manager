# Infrastructure Design Plan — `supporting-platform` (Unit 2)

**Stage**: CONSTRUCTION → Infrastructure Design (per-unit loop, unit 2 of 2)
**Branch**: `aidlc/construction-supporting-platform`
**Date**: 2026-07-26
**Predecessor**: Unit 2 NFR Requirements APPROVED 2026-07-26

---

## 0. Honest Scoping — This Stage Is Genuinely Small

Unit 2 adds **no new container, no new managed service, no new database, no new network path and no
migration**. Unit 1's Infrastructure Design already specified the entire topology, and Unit 2 runs inside
it unchanged:

| Infrastructure element | Unit 2 impact |
|---|---|
| Containers (`db`, `app`, `proxy`) | **None** — same three |
| Database | **None** — no migration (Q1:A + Q10:A removed both entity candidates) |
| Published ports (80, 443 only) | **None** |
| Volumes | **None** — nothing written to disk during import (BR-IM-25) |
| Network topology | **None** |
| Compute sizing | Marginal — one request may hold a 5 MB buffer |

I am stating this plainly rather than padding the stage. **But "small" is not "nothing"** — reviewing
the running deployment against Unit 2's two new behaviours (a 5 MB upload and refusal logging) surfaced
three real gaps in the existing configuration, all of which predate Unit 2 and two of which affect Unit 1
today. Those are §2's questions.

### Category applicability — evaluated, not skipped

The rules require every category to be evaluated with justification rather than skipped silently.

| Category | Applicable? | Justification |
|---|---|---|
| Deployment Environment | **No change** | On-premises Docker Compose, fixed at NFR-T-01 and detailed in Unit 1's `deployment-architecture.md`. Unit 2 introduces no new target. |
| Compute Infrastructure | **Yes — marginal** | Import holds a 5 MB file plus parsed rows in memory. See Question 2. |
| Storage Infrastructure | **No** | BR-IM-25 keeps the upload in memory; nothing is persisted beyond the rows written to the existing database. No new volume, no object store, no lifecycle policy. |
| Messaging Infrastructure | **No — N/A** | Q13:A chose synchronous import. There is no queue, no worker, no event bus and no async processing anywhere in Phase 1. NFR-IN-01 makes the application standalone. |
| Networking Infrastructure | **Yes** | The 5 MB upload traverses Caddy, whose request-body policy is currently implicit. See Question 1. |
| Monitoring Infrastructure | **Yes** | N-Q5:A adds refusal logging to a deployment with no log rotation configured. See Question 3. |
| Shared Infrastructure | **No new sharing** | One shared database schema (X-3) and one deployable, both already recorded in `aidlc-docs/construction/shared-infrastructure.md`. No multi-tenancy, no resource isolation between units — they are modules in one process. |

---

## 1. Plan Steps

**All 10 steps complete 2026-07-26.** Artifacts at `aidlc-docs/construction/supporting-platform/infrastructure-design/`, plus a prediction audit appended to `aidlc-docs/construction/shared-infrastructure.md` §8.

- [x] I1. Confirm the component-to-infrastructure map is unchanged; record the delta explicitly
- [x] I2. Specify proxy handling of the 5 MB upload: body limit and timeout behaviour
- [x] I3. Specify container resource expectations for a peak import
- [x] I4. Specify log rotation and the volume effect of refusal logging
- [x] I5. Add the two new configuration values to the configuration contract and `.env.example`
- [x] I6. Confirm no migration, no volume, no port and no service change
- [x] I7. Specify how the stand-in deletion is verified in a built image
- [x] I8. Update `aidlc-docs/construction/shared-infrastructure.md` if the shared picture changed
- [x] I9. Generate `infrastructure-design.md`
- [x] I10. Generate `deployment-architecture.md`

---

## 2. Questions

> **All three answered by AI recommendation**, continuing under the user's instruction to take the best
> recommendations and proceed. Each is a configuration choice, not a structural one — any can be changed
> without altering the design. Rationale in `infrastructure-design.md` §8.

Three questions. All three concern gaps that **already exist** in the running deployment; Unit 2 is what
makes two of them matter.

---

## Question 1
The Caddyfile sets no `request_body` limit, so Caddy 2's default applies — **no limit**. A 5 MB import
therefore passes through, but so would a 500 MB POST, which would be streamed to the app and refused
there only after transfer. Should the proxy enforce a limit?

A) **Explicit limit at the proxy, sized above the app's** — e.g. `request_body { max_size 6MB }`. An
oversized upload is rejected at the edge before it reaches Node. Sized *above* the app's 5 MB so the
app's own message (which names the real limit) is what users normally see, with the proxy as a
backstop against the absurd case.

B) **Explicit limit at the proxy equal to the app's 5 MB** — one number in one place. The cost: a
just-over-limit upload is refused by Caddy with a generic 413 rather than by the app's message naming
the row and byte limits, so the user gets a less useful error at exactly the boundary they are most
likely to hit.

C) **Leave it unlimited at the proxy** — the app enforces 5 MB at the multipart boundary (BR-IM-02), so
nothing over-large is ever parsed. Simplest, and relies on a single enforcement point.

D) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, continuing under the user instruction of 2026-07-26)*

## Question 2
`docker-compose.yml` sets **no memory or CPU limit** on any service. A peak import holds a 5 MB buffer
plus parsed rows and validation state — tens of MB, briefly. Should resource limits be introduced?

A) **No limits, document expected footprint** — a single-host internal tool with low-tens concurrency
(NFR-S-02). An unlimited container on a dedicated host is normal, and a limit set too low turns a
successful import into an OOM kill that looks like a crash.

B) **Memory limits on all three services** — bounds the blast radius if anything leaks, and makes the
host's capacity requirement explicit. Requires choosing numbers now, and PostgreSQL in particular
performs badly against a limit set below its `shared_buffers` plus work memory.

C) **Memory limit on `app` only** — the one service whose per-request allocation just grew. Leaves
PostgreSQL to manage its own memory, which it does better than a container limit does.

D) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, continuing under the user instruction of 2026-07-26)*

## Question 3
No logging driver options are configured, so Docker's default `json-file` applies with **no size cap** —
container logs grow until the disk fills. NFR-Q-02 defers log aggregation, and N-Q5:A now adds a warn
line per authorization refusal. How should log growth be handled?

A) **Configure `json-file` rotation on all services** — e.g. `max-size: 10m`, `max-file: 3`. Roughly 30 MB
per service, bounded. Three lines of compose per service, no new infrastructure, and it fixes a real
unbounded-growth risk that exists in Unit 1 today.

B) **Leave as is** — consistent with NFR-Q-02's deferral of logging infrastructure, and an internal tool
at low-tens concurrency will not fill a disk quickly.

C) **Rotation plus a lower `LOG_LEVEL` default in production** — bounded *and* quieter. The cost: raising
the level to debug a problem then needs a restart, and `info` is already the default.

D) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, continuing under the user instruction of 2026-07-26)*

---

## 3. Recorded Without a Question

Determined from the existing configuration; no user input needed.

| Item | Finding |
|---|---|
| **Caddy response timeout** | Caddy 2's `reverse_proxy` has **no** response timeout by default, so a 30 s import (U2-NFR-P-03) completes without proxy intervention. No change required. Recorded because a proxy timeout shorter than the import budget would abort a mid-transaction request, and confirming the default was necessary rather than assumable. |
| **`encode zstd gzip`** | Response-only. It does not touch the request body and therefore has no effect on upload size or parsing. |
| **CSP** | `default-src 'self'` unchanged. Import adds no third-party script, no inline script and no external font, so the existing strict policy needs no relaxation — worth confirming, because a file-upload widget is a common reason CSP gets loosened. |
| **New configuration values** | `IMPORT_MAX_ROWS=2000` and `IMPORT_MAX_BYTES=5242880`. Both numeric, both with safe defaults, **neither a secret** — so `.env.example` gains no value-bearing key, and compose passes them with `${VAR:-default}` like every other non-secret. |
| **No new volume** | BR-IM-25 keeps the upload in memory. Nothing to persist, nothing to back up, nothing left on the host after a crash. |
| **Health check** | Unchanged. `/health` reports database connectivity and is unaffected by authorization (path 22 in the enforcement enumeration is deliberately unauthenticated and exposes no domain data). |
| **Stand-in deletion verification** | `docker compose exec app find /app -name 'authorization-standin*'` must return nothing in the built image. Verifying deletion in the **image** and not only in the source tree is the check that catches a stale build. |
| **Backup** | Unchanged from Unit 1. Import creates no new backup obligation, since it writes only existing entities through existing paths. |
