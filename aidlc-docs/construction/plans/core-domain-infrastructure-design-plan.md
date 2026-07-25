# Infrastructure Design Plan — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` (1 of 2) · **Stage**: Infrastructure Design
**Date**: 2026-07-25
**Status**: Awaiting answers and approval
**Input**: approved `core-domain/functional-design/*`, `core-domain/nfr-requirements/*`

## What this stage decides

Mapping the logical components to actual runnable infrastructure. Much is already fixed:

| Already decided | Source |
|---|---|
| **On-premises**, containerized via Docker | NFR-T-01 (Q15:D) |
| No cloud managed service anywhere | NFR-T-04 |
| **Single Node process** — Fastify serves API and Vite static output | unit plan Q3:A |
| Docker Compose: app container + PostgreSQL container | tech-stack-decisions |
| Named volume for PostgreSQL persistence | U1-NFR-A-04 |
| Single instance; no HA, no load balancing, no failover | U1-NFR-A-02 |
| Request logging + `/health`; everything else deferred | U1-NFR-O-01/02/05 |
| Config via environment variables; no secrets in the repo | U1-NFR-O-06 |

**Because both units share one deployable and one schema**, this stage also produces
`aidlc-docs/construction/shared-infrastructure.md`. Unit 2 will inherit it rather than re-deciding.

### Category applicability

The rules require every infrastructure category to be evaluated, not silently skipped:

| Category | Applicable? |
|---|---|
| Deployment environment | **Yes** — Q1, Q2 |
| Compute | **Yes** — Q3, Q4 |
| Storage | **Yes** — Q5, Q6 |
| Networking | **Yes** — Q7, Q8 |
| Monitoring | **Yes** — Q9 |
| Shared infrastructure | **Yes** — Q10 |
| **Messaging / async processing** | **Evaluated — see Q11.** No requirement in Unit 1 (every operation is synchronous request/response). Asked anyway because Unit 2's CSV import is the one plausibly long-running operation. |

---

# Section A — Infrastructure Questions

## Question 1 — How many environments?
A) **One — production only** (recommended for Phase 1) — plus developers running the same Compose stack locally. Simplest; matches an internal tool with no external users during Unit 1.
B) **Two — production and a staging/UAT environment** — lets you validate a release before it reaches users
C) **Three — development, staging, production**
D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2 — What is the deployment host?
A) **A single Linux VM or physical server running Docker and Docker Compose** (recommended) — matches the single-instance decision with the least operational surface
B) **An existing on-premises Kubernetes cluster** — if your organization already runs one and expects workloads there
C) **A Windows Server host running Docker Desktop / WSL2**
D) **Not yet determined** — design for the single Linux Docker host and note the assumption
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3 — Container image build and distribution
A) **Build on the host from source** (recommended for a single-host, single-environment install) — `docker compose build`; no registry needed
B) **Build in CI and push to an internal registry** — requires the CI that NFR-Q-01 deferred
C) **Build locally, save/load a tar image onto the host** — for an air-gapped host
D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4 — Resource sizing
At 200 members, low-tens concurrency, and ~600 assignments, the workload is small.

A) **App: 1 vCPU / 1 GB. PostgreSQL: 1 vCPU / 2 GB. Disk: 20 GB** (recommended) — comfortable headroom for the design target
B) **App: 2 vCPU / 2 GB. PostgreSQL: 2 vCPU / 4 GB. Disk: 50 GB** — room for the multi-department growth NFR-S-05 anticipates
C) **No limits set** — let the host allocate freely
D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5 — Where does PostgreSQL run?
A) **In a container alongside the app, managed by Compose** (recommended) — one `docker compose up`, self-contained, matches NFR-T-04
B) **On the host directly, or on an existing internal database server** — if your organization centralizes database administration and backups
C) **In a container, but with the data directory bind-mounted to a host path** the existing backup process already covers
D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6 — Backup, despite NFR-Q-03 deferring it
NFR-Q-03 defers backup/restore procedures. This is the one deferral with unbounded downside: without a backup, a volume loss destroys the allocation record with no recovery path.

A) **A documented `pg_dump` command and a suggested cron schedule** (recommended) — no tooling built, no automation, just the command and instructions so a backup is possible. Holds close to NFR-Q-03 while removing the unrecoverable case.
B) **Nothing** — hold NFR-Q-03 exactly as written; backup is an operations concern outside this project
C) **A scheduled backup container with retention** in the Compose stack — promotes NFR-Q-03 into Phase 1
D) **Rely on host-level VM snapshots** — assumes your infrastructure team already snapshots the host
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 7 — TLS and reverse proxy
NFR-SE-05 makes transport security a deployment concern rather than an application requirement.

A) **A reverse proxy container (Caddy or nginx) terminating TLS in front of the app** (recommended) — Caddy handles certificates with minimal configuration, including internal CA certificates
B) **App serves plain HTTP; TLS terminated by existing corporate infrastructure** — if a load balancer or proxy already fronts internal applications
C) **Plain HTTP, no TLS** — acceptable only on a trusted internal network. Note that session cookies then travel unencrypted, and the `Secure` cookie flag cannot be set.
D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 8 — Hostname and access
A) **An internal DNS name over the standard HTTPS port** (recommended) — e.g. `chaos.internal.example.com`
B) **Host IP and a specific port** — e.g. `10.x.x.x:8080`
C) **A path on an existing internal portal** — requires proxy path-rewriting
D) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 9 — Monitoring
NFR-Q-02 defers monitoring; Q13:A of NFR Requirements already added request logging and `/health`.

A) **Container logs to the Docker log driver, plus the `/health` endpoint** (recommended) — `docker compose logs` for diagnosis, health for liveness. No stack, no agent.
B) **Add a Compose-level healthcheck and restart policy** on top of A — the container restarts itself if `/health` fails
C) **A monitoring stack (Prometheus + Grafana)** — promotes NFR-Q-02 into Phase 1
D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 10 — Shared infrastructure between the two units
Both units share one deployable, one database, and one schema (unit plan Q8:A, X-3).

A) **Fully shared — one app container, one database, one schema; units are logical modules only** (recommended) — consistent with the single-deployable decision
B) **Shared database, separate app containers per unit** — contradicts unit plan Q3:A; would need that revised
C) **Shared infrastructure now, documented so a unit could be separated later** — same as A plus a written note on what separation would require
D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 11 — Async processing and messaging
Unit 1 has no async requirement — every operation is synchronous request/response. Unit 2's CSV import is the one operation that could run long (up to ~200 member rows plus validation).

A) **No messaging infrastructure. Import runs synchronously within the request** (recommended) — 200 rows with per-row validation is a few seconds at most; a queue would be infrastructure serving a problem that does not exist
B) **No messaging infrastructure, but import runs as a background task in-process** with the client polling for the report — handles a slow import without adding a broker
C) **Add a job queue (Redis-backed or similar)** — real infrastructure for a genuinely long import
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

# Section B — Mandatory Artifacts

- [ ] Generate `aidlc-docs/construction/core-domain/infrastructure-design/infrastructure-design.md`
- [ ] Generate `aidlc-docs/construction/core-domain/infrastructure-design/deployment-architecture.md`
- [ ] Generate `aidlc-docs/construction/shared-infrastructure.md` (both units share one deployable)

---

# Section C — Execution Checklist

## C.1 — Preparation
- [ ] Re-read `core-domain/nfr-requirements/*` for the confirmed stack and operability targets
- [ ] Confirm the Section A answers and restate the decisions

## C.2 — Infrastructure design
- [ ] Map each logical component to its infrastructure home (app container, database container, proxy, volume)
- [ ] Specify container images, base images, and the multi-stage build approach
- [ ] Specify the complete environment variable contract, marking which values are secrets
- [ ] Specify resource limits and disk sizing
- [ ] Specify the database volume and its persistence guarantee
- [ ] Specify TLS termination and the resulting cookie flags
- [ ] Specify logging destination and the health endpoint contract
- [ ] Record the async/messaging determination with justification
- [ ] Write `infrastructure-design.md`

## C.3 — Deployment architecture
- [ ] Produce the deployment topology diagram with a text alternative
- [ ] Specify the Compose service definitions, dependencies, and startup order
- [ ] Specify the migration execution point in the startup sequence
- [ ] Specify first-time setup: schema creation, seed reference data, and the initial admin account
- [ ] Specify the upgrade and rollback procedure
- [ ] Specify the backup procedure per the Q6 answer
- [ ] Write `deployment-architecture.md`

## C.4 — Shared infrastructure
- [ ] Record what both units share and what each owns
- [ ] Record the schema-ownership rule and migration ordering across units
- [ ] Record how Unit 2's arrival changes the deployment (it should not, beyond new code in the same image)
- [ ] Write `shared-infrastructure.md`

## C.5 — Validation and completion
- [ ] Verify nothing requires a cloud managed service (NFR-T-04)
- [ ] Verify the single-Node-process constraint holds (unit plan Q3:A)
- [ ] Verify restart safety — no in-memory state whose loss corrupts data (U1-NFR-A-03)
- [ ] Verify no secret is committed to the repository (U1-NFR-O-06)
- [ ] Verify no credential or token can reach a log line (U1-NFR-O-04)
- [ ] Validate all content per `common/content-validation.md`
- [ ] Mark all checkboxes in this plan `[x]`
- [ ] Update `aidlc-docs/aidlc-state.md`
- [ ] Log completion and approval prompt in `aidlc-docs/audit.md`
- [ ] Present the standardized 2-option completion message
