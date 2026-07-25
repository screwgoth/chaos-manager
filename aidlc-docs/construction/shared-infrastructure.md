# Shared Infrastructure — Both Units

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION
**Date**: 2026-07-25
**Applies to**: `core-domain` (Unit 1) and `supporting-platform` (Unit 2)

Per **Q10:A** of the `core-domain` infrastructure design plan: infrastructure is **fully shared**. One app
container, one database, one schema. Units are logical modules within a single deployable (unit plan Q3:A).

**This document is authoritative for both units.** Unit 2's Infrastructure Design stage inherits it and
should confirm rather than re-decide, recording only what genuinely differs.

---

## 1. What Is Shared

| Resource | Shared | Notes |
|---|---|---|
| `app` container and Node process | ✅ | Unit 2 code is added to the same image; no new container |
| `db` container and PostgreSQL instance | ✅ | |
| **Database schema** | ✅ | One schema, one ordered migration sequence (X-3) |
| `proxy` container and TLS termination | ✅ | Unit 2 adds routes, not endpoints on a new port |
| Docker network `chaos_net` | ✅ | |
| Volume `chaos_pgdata` | ✅ | |
| Environment variable contract | ✅ | Unit 2 may **add** variables; it must not repurpose existing ones |
| Logging and `/health` | ✅ | Unit 2's routes log through the same request logger |
| Build pipeline and Dockerfile | ✅ | Same multi-stage build; Unit 2 code compiles into the same output |
| Backup procedure | ✅ | One database, one dump |
| Resource limits | ✅ | 1 vCPU / 1 GB app, 1 vCPU / 2 GB db — see §5 for whether Unit 2 changes this |

## 2. What Each Unit Owns

| | `core-domain` | `supporting-platform` |
|---|---|---|
| Backend source | `backend/src/core-domain/` | `backend/src/supporting-platform/` |
| Backend tests | `backend/tests/core-domain/` | `backend/tests/supporting-platform/` |
| Frontend source | `frontend/src/core-domain/` | `frontend/src/supporting-platform/` |
| Tables owned | Member, MemberSkill, Project, Assignment, AssignmentHistory, OrgUnit, ReferenceDataEntry, UserAccount, Session | RolePermission |
| Migrations contributed | Initial schema, indexes, constraints | RolePermission table, plus any index its scope-filtered queries require |
| Shared code | Both consume `backend/src/shared/` and `frontend/src/shared/` — **owned by neither** (unit plan Q8:A) | |

---

## 3. Schema Ownership and Migration Ordering

**Rule 1 — one ordered sequence.** Migrations are numbered and applied in order across both units.
`core-domain` migrations come first because it is built first (unit plan Q5:A). Unit 2's migrations are
appended, never interleaved.

**Rule 2 — forward-only.** No down migrations (U1-NFR-M-08). Recovery from a bad migration is restore from
a dump, not a rollback script.

**Rule 3 — Unit 2 may add, not alter destructively.** Unit 2 may add tables, add columns, and add indexes.
It must not drop or rename a `core-domain` column or table, because Unit 1 code in the same process depends
on it.

**Rule 4 — the schema is not frozen at Unit 1 completion.** Unit 2 is expected to need at least one index
for org-scope-filtered queries that Unit 1's design did not anticipate. That is normal and additive.

**Rule 5 — Unit 2 writes Unit 1's tables through Unit 1's components**, never by direct SQL against them.
C-10 Import creates members and projects via `IMemberComponent` and `IProjectComponent` so that all
business rules apply (BR-M-*, BR-P-*). **Direct inserts into Unit 1 tables from Unit 2 code are prohibited**
— they would bypass every validation rule.

---

## 4. How Unit 2's Arrival Changes the Deployment

**It should not, beyond new code in the same image.** Explicitly:

| Aspect | Change on Unit 2 completion |
|---|---|
| Container count | **None** — still three |
| Published ports | **None** |
| New infrastructure | **None** — no broker, no worker, no cache (Q11:A) |
| Compose file | **No structural change** |
| New environment variables | Possibly a small number, appended to the contract |
| Migrations | One or more appended files |
| Deployment procedure | **Unchanged** — `git pull`, `docker compose build`, `up -d` |
| Behavioural change visible to users | **Yes, and this is the point** — org-scope enforcement begins working, import becomes available, and the Should-priority views appear |

**The one thing that must happen at Unit 2 completion**: the authorization stand-in at
`backend/src/core-domain/authorization-standin/` is **deleted**, and the composition root repointed to the
real C-09 implementation. A stand-in left in the tree is a stand-in that gets wired up again by accident.

> **⚠️ Until that deletion happens, org-scope visibility is not enforced.** A Team Lead or Resource Manager
> sees all org units (X-1, BR-R-05). Accepted under the single-track, no-external-users assumption (unit
> plan Q7:A). Revisit trigger in `unit-of-work-dependency.md` §3.

---

## 5. Resource Implications of Unit 2

| Consideration | Assessment |
|---|---|
| Memory | Import parses a CSV in memory. At ~200 rows this is kilobytes. **No increase needed.** |
| CPU | Import validation is per-row and brief; it runs synchronously in a request (Q11:A) |
| Disk | `RolePermission` is configuration-sized. Import creates rows that were going to exist anyway. |
| **Verdict** | **1 vCPU / 1 GB app and 1 vCPU / 2 GB db remain adequate.** No resizing on Unit 2 completion. |

**The one thing to watch**: if a future phase raises the import limit to thousands of rows, in-memory
parsing becomes the constraint. At that point Q11:B (streamed parse, background task, client polling) is the
answer — still with no broker.

---

## 6. Shared Configuration Rules

1. **Additive only.** Unit 2 may add environment variables. Repurposing an existing variable's meaning is prohibited — it would silently change Unit 1 behaviour.
2. **Secrets have no defaults**, in either unit.
3. **New variables are documented** in `.env.example` with a non-secret placeholder, and in the deployment guide.
4. **Startup validation covers both units' variables** — one fail-fast check, all variables named (U1-NFR-O-03).
5. **No secret in any log line**, from either unit (U1-NFR-O-04). Unit 2's import logs row counts and failure reasons, **never row contents** — imported rows contain personal data.

**Rule 5's second clause is a real constraint, not boilerplate.** The obvious way to debug a failing import
is to log the offending row. That would put names and emails into the Docker log, which is rotated but not
access-controlled. The import report returns per-row detail **to the authenticated Admin who ran it**; the
log gets counts and reasons only.

---

## 7. Validation

| Check | Result |
|---|---|
| Both units run in one deployable (unit plan Q3:A) | **Pass** |
| One schema, one ordered migration sequence (X-3) | **Pass** |
| Unit 2 adds no new infrastructure | **Pass** |
| Unit 2 cannot bypass Unit 1 business rules | **Pass** — Rule 5 of §3 prohibits direct SQL against Unit 1 tables |
| Stand-in deletion is an explicit, recorded obligation | **Pass** — §4 |
| Resource limits remain adequate | **Pass** — §5 |
| No cloud managed service in either unit (NFR-T-04) | **Pass** |
