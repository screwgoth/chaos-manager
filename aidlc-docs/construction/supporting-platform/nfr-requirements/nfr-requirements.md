# NFR Requirements — `supporting-platform` (Unit 2)

**Unit**: 2 of 2 · **Stage**: NFR Requirements
**Answers**: N-Q1:A, N-Q2:A, N-Q3:A, N-Q4:A, N-Q5:A, N-Q6:C, N-Q7:A, N-Q8:A — **all by AI
recommendation** at the user's instruction. Rationale in §9, including the two where the runner-up had a
real case.

Requirement IDs use the `U2-NFR-*` prefix. Unit 1's `U1-NFR-*` requirements continue to hold
system-wide; this document adds what Unit 2 introduces and marks what it inherits.

---

## 1. Scalability

| ID | Requirement | Verifiable? |
|---|---|---|
| U2-NFR-S-01 | Inherits the design target: 200 members, 50 projects (NFR-S-01) | Inherited |
| U2-NFR-S-02 | `resolveScope` must not degrade with member or assignment volume. It reads **org units only** — at most a root plus its children — so its cost is bounded by the org-unit count, not by data volume. | **Yes — inspectable in code** |
| U2-NFR-S-03 | Import ceiling: **2,000 data rows and 5 MB** per file, refused above either (BR-IM-02) | **Yes — by test** |
| U2-NFR-S-04 | Import reference-data resolution issues a **constant number of queries regardless of row count** — approximately four per file, not four per row (BR-IM-14) | **Yes — by query counting** |
| U2-NFR-S-05 | Growth to ~2,000 members (NFR-S-05) does not change scope resolution cost, since it is org-unit-bound. Import at 2,000 members would need one file per the row cap, which is acceptable. | By reasoning |
| U2-NFR-S-06 | Concurrent imports are **not limited** (N-Q1:A/N-Q8:A). Admin-only (BR-IM-22) at low-tens concurrency (NFR-S-02) means simultaneous large imports are not producible by this deployment. | By reasoning — see §9 |

### Why U2-NFR-S-02 is the load-bearing one

`resolveScope` runs before every authorized operation. If it were implemented by walking members or
assignments — for instance "find all members in my org units" to derive scope — its cost would grow with
the data and **every endpoint in the application would slow together**. Scope must be derived from the
org-unit tree alone. This is a structural requirement, not a tuning target.

---

## 2. Performance

| ID | Path | Target | Verifiable? |
|---|---|---|---|
| U2-NFR-P-01 | `resolveScope` per request | **< 10 ms** server time | **Yes — the one measurement that matters here** |
| U2-NFR-P-02 | Any Unit 1 endpoint after real scoping replaces the stand-in | **No regression beyond U1-NFR-P-0x budgets** | **Yes — re-run Unit 1's timings** |
| U2-NFR-P-03 | Full 2,000-row member import, end to end | **< 30 s** wall clock (N-Q3:A) | **Yes — by test with a generated file** |
| U2-NFR-P-04 | 200-row import (the stated real need) | < 5 s | Yes |
| U2-NFR-P-05 | Template download | < 200 ms — generated in memory from the column contract | Yes |
| U2-NFR-P-06 | Account link / unlink | < 300 ms | Yes |
| U2-NFR-P-07 | Bench, over-allocated and expiring-contracts pages | within U1-NFR-P-01's 3 s page budget; they reuse Unit 1 endpoints already measured | Inherited |

### Budget for the 2,000-row import (U2-NFR-P-03)

| Phase | Expected | Note |
|---|---|---|
| File gate + CSV parse | < 1 s | 5 MB in memory, no disk (BR-IM-25) |
| Batched reference lookups | < 100 ms | ~4 queries total (BR-IM-14) |
| Per-row validation | < 5 s | in-memory; **no queries per row** |
| Duplicate detection | < 500 ms | 2 batched queries + in-memory map (BR-IM-06→10) |
| Write, one transaction | < 20 s | ~2,000 inserts through Unit 1 components |
| **Total** | **< 30 s** | |

**The write phase is the whole budget.** 2,000 individual inserts inside one transaction at ~5 ms each
is 10 s; at ~10 ms each it is 20 s and the budget is at its limit. **This must be measured, not assumed**
— and if it exceeds 30 s, the correct response is *not* to bypass Unit 1's components with a bulk insert,
because BR-IM-11 exists to prevent a second, drifting copy of every validation rule. The correct
responses in order of preference are: lower the row cap, or move to a background job (Q13:C, which the
user declined for a stated need of ~200 rows).

### U2-NFR-P-02 is a regression requirement, and it has teeth

Unit 1's endpoints were measured against a **permissive** filter, which adds no WHERE clause at all
(`isUnrestricted` short-circuits it). Real scoping adds predicates to every scoped query, and BR-R-12
adds a disjunction to the assignment predicate. **Unit 1's measurements do not transfer** — they must be
re-run for a scoped role, not only for an Admin, or the regression is invisible.

Per **N-Q2:A**, the BR-R-12 disjunction is **measured before any index is added**. `member.org_unit_id`
and `project.owning_org_unit_id` both already carry indexes; whether the planner uses them under an `OR`
is an empirical question, and `EXPLAIN` answers it. No migration is added on speculation — Unit 2's
"no migration" property stands unless a measurement overturns it.

---

## 3. Availability

| ID | Requirement |
|---|---|
| U2-NFR-A-01 | Inherits: business-hours internal tool, occasional downtime acceptable, no SLA/RTO/RPO, single instance (NFR-A-01/02/03) |
| U2-NFR-A-02 | A failed import leaves **no partial state**. One transaction for all valid rows (BR-IM-16), so a mid-write failure rolls back entirely. | 
| U2-NFR-A-03 | A crash or restart during an import loses the import and its report, and **creates nothing**. Recovery is "upload the file again", which is safe because import is idempotent (BR-IM-10). |
| U2-NFR-A-04 | Nothing is written to disk during import (BR-IM-25), so a crash leaves no temporary file to clean up. |
| U2-NFR-A-05 | Scope resolution has **no cached state** (N-Q1:A), so a restart cannot serve a stale authorization scope. |

U2-NFR-A-03 is the payoff from making import create-only and conflict-reporting: the recovery procedure
for any import failure is to re-upload, and the worst case is a report full of conflicts. An upsert-style
import would have made crash recovery a genuine question.

---

## 4. Security

**This unit is where FR-R-08 is actually discharged.** Unit 1 built the mechanism and shipped a
permissive policy; Unit 2 supplies the policy.

| ID | Requirement | Status |
|---|---|---|
| U2-NFR-SE-01 | Security Baseline extension not enforced (disabled by opt-in) | NFR-SE-01 |
| U2-NFR-SE-02 | **Server-side authorization on every data path** — the 22 enforcement points enumerated in `business-logic-model.md` §3, none bypassable from the client | **Mandatory — NFR-SE-02 retention. This unit's core obligation.** |
| U2-NFR-SE-03 | No `ScopeFilter` is ever constructed from client input. No route handler accepts an org-unit or member-scope parameter (BR-R-06) | **Mandatory** |
| U2-NFR-SE-04 | Scope resolution **fails closed**: a NULL home org unit yields an empty permitted-org list and an always-false predicate, never `'ALL'` (BR-R-11, BR-R-17) | **Mandatory** |
| U2-NFR-SE-05 | An out-of-scope record yields **404, not 403**, so existence is not confirmed (BR-R-16) | From functional design |
| U2-NFR-SE-06 | The permission matrix is a **code constant** — no runtime path modifies authorization policy (BR-R-14, Q1:A) | By construction |
| U2-NFR-SE-07 | **Authorization refusals are logged at warn level** — role, resource kind, operation, outcome. **Never** the target record's identity or contents. (N-Q5:A) | **Yes — by test** |
| U2-NFR-SE-08 | Import logs **row counts and failure reasons only, never row contents** — no name, email, external reference or vendor in any log line (BR-IM-24) | **Yes — by test** |
| U2-NFR-SE-09 | The 5 MB body limit applies to the **import route only**; every other route keeps the 1 MB default (N-Q4:A) | **Yes — inspectable in config** |
| U2-NFR-SE-10 | Uploaded files are held in memory and **never written to disk** (BR-IM-25) | By construction |
| U2-NFR-SE-11 | CSV parsing treats the file as **data, never as code**. No formula evaluation, no shell interpolation. A cell beginning `=` or `@` is a string. | By construction |
| U2-NFR-SE-12 | Import creates records through Unit 1's components, so every BR-M-* and BR-P-* validation applies to imported data exactly as to hand-entered data (BR-IM-11) | **Yes — by test** |
| U2-NFR-SE-13 | No contractor commercial field can enter via import — no such column exists, and unknown columns are ignored and named (BR-M-09, BR-IM-04) | **Yes — by test** |
| U2-NFR-SE-14 | Inherits: TLS and encryption at rest are deployment concerns (NFR-SE-05); data sensitivity low (NFR-SE-03); no regulatory regime (NFR-SE-04) | Inherited |

### U2-NFR-SE-11 deserves its own line

A CSV cell beginning with `=`, `+`, `-` or `@` is a **formula when opened in a spreadsheet**. This
system never evaluates it — but it may later be *exported*, and an exported cell that a spreadsheet
evaluates is CSV injection. Phase 1 has no export feature, so there is nothing to exploit today. The
requirement is recorded now so a future export feature inherits the obligation rather than discovering
it.

### The verification standard for this unit

> Every security requirement above that says "by test" must be proven by a test that **fails when the
> control is removed.** Unit 1 learned this the expensive way: its first BR-A-24 concurrency test passed
> with the lock neutered and was a false positive. For this unit the equivalent trap is a scope test that
> passes against the permissive stand-in — which would prove nothing at all, since the stand-in is what
> the test exists to replace.

`business-logic-model.md` §7 already marks which enforcement tests must fail against the stand-in and
which are merely regression tests. That distinction is a requirement, not documentation.

---

## 5. Reliability

| ID | Requirement |
|---|---|
| U2-NFR-R-01 | All valid import rows commit **together or not at all** (BR-IM-16). No half-applied import exists. |
| U2-NFR-R-02 | Import validation is a **read-only pass**; the transaction contains writes only (BR-IM-17) |
| U2-NFR-R-03 | Import is **idempotent**: re-uploading a file creates nothing and reports every row as a conflict (BR-IM-10) |
| U2-NFR-R-04 | Import row ordering is **deterministic** — first occurrence of a natural key wins (BR-IM-09), so the same file always produces the same outcome |
| U2-NFR-R-05 | Scope resolution is **total**: every role and every combination of NULL `home_org_unit_id` / NULL `linked_member_id` has a defined outcome, and every undefined-looking case fails closed |
| U2-NFR-R-06 | The permission matrix is **exhaustive** — no default branch. A missing entry is a build or test failure, not a silent grant or denial (N-Q6:C) |
| U2-NFR-R-07 | Account-member link uniqueness is backed by a **database index**, not only by an application check (BR-L-01). If check and index disagree, the index wins. |
| U2-NFR-R-08 | Inherits U1-NFR-R-07: unhandled errors return a generic message; internal detail never reaches the client |
| U2-NFR-R-09 | Inherits: no retries, no circuit breakers, no queues (Resiliency extension disabled, NFR-Q-05) |

**U2-NFR-R-06 is why N-Q6:C was chosen over N-Q6:A.** A test that asserts all 40 cells (80 decisions) catches a
*changed* cell. It does **not** catch a newly added `ResourceKind` or role with no matrix entry —
because the test enumerates what it knows about. An exhaustiveness check catches that, and the
"add a resource kind, forget the matrix" mistake is the one most likely to happen months from now when
the matrix is no longer fresh in anyone's mind.

---

## 6. Maintainability

| ID | Requirement |
|---|---|
| U2-NFR-M-01 | Inherits: TypeScript `strict` + `noUncheckedIndexedAccess` in both workspaces |
| U2-NFR-M-02 | The permission matrix is typed so that **omitting a role or resource kind is a type error** (`Record<UserRole, Record<ResourceKind, …>>`), giving compile-time exhaustiveness on top of U2-NFR-R-06's runtime check |
| U2-NFR-M-03 | All 40 matrix cells (80 read/write decisions) asserted by a **table-driven test**, plus the exhaustiveness check (N-Q6:C) |
| U2-NFR-M-04 | **`core-domain/authorization-standin/` is deleted**, not disabled or commented out. Verified by its absence, and by `git diff --stat` over `core-domain/` showing only `services/index.ts` changed |
| U2-NFR-M-05 | `shared/repository/assignment-repository.ts` is the **one** legitimate exception to M-04's diff check (BR-R-12). Its existing comment justifying member-only scoping must be **rewritten**, not left contradicting the code. |
| U2-NFR-M-06 | Import must not restate any Unit 1 business rule. Validation happens by calling Unit 1 components (BR-IM-11) |
| U2-NFR-M-07 | The import column contract is the **single source** for both parsing and template generation (BR-IM-26) — no second list to keep in sync |
| U2-NFR-M-08 | Unit 2 code confined to `backend/src/supporting-platform/` and `frontend/src/supporting-platform/`; cross-unit contact only through `shared/` and Unit 1's published interfaces |
| U2-NFR-M-09 | `IAuthorizationComponent` is **not modified**. Any need to widen it is a Unit 1 design defect and must be recorded as one |
| U2-NFR-M-10 | Inherits U1-NFR-M-07: stable `data-testid` on interactive elements |
| U2-NFR-M-11 | **No new migration** unless N-Q2:A's measurement forces one. `001_initial_schema.ts` remains the final Phase 1 schema. |

**U2-NFR-M-04 and M-05 together are the X-1 completion test.** If the diff over `core-domain/` shows
anything beyond `services/index.ts`, the stand-in pattern did not achieve what it was built for, and
that finding must be recorded rather than absorbed.

---

## 7. Usability

| ID | Requirement |
|---|---|
| U2-NFR-U-01 | Inherits: responsive across desktop, tablet and phone (NFR-U-01); English only; reasonable-defaults accessibility |
| U2-NFR-U-02 | A **403 renders as a forbidden state**, not as a generic error. A user who lacks permission is told so, not shown "something went wrong". |
| U2-NFR-U-03 | Hiding a control is **never** the enforcement (FR-R-08). Every hidden action is also refused server-side. |
| U2-NFR-U-04 | The import screen shows a **pending** state, not a fabricated progress bar — synchronous processing has no observable progress to report (Q13:A) |
| U2-NFR-U-05 | The import report distinguishes **conflicts** from **errors** visually and structurally, because they call for different corrections |
| U2-NFR-U-06 | The import report states that it is **not saved** before the user can navigate away (Q10:A) |
| U2-NFR-U-07 | Empty states on the bench and over-allocated pages read as **good news**, not as a failed query |
| U2-NFR-U-08 | Client-side file pre-checks use the **same message** as the server's, and are never the enforcement (BR-IM-01/02) |

---

## 8. Inherited Without Change

Restated once, so their absence above is a decision:

Scale target and concurrency (NFR-S-01/02) · page load under 3 s (NFR-S-03) · availability class and the
absence of SLA/RTO/RPO (NFR-A-01/02/03) · on-premises Docker, no cloud managed service (NFR-T-01/04) ·
Node.js/TypeScript backend and React frontend (NFR-T-02/03) · PostgreSQL 16 (OD-01, closed at Unit 1) ·
TLS and encryption at rest as deployment concerns (NFR-SE-05) · low data sensitivity, no regulatory
regime (NFR-SE-03/04) · no CI pipeline requirement (NFR-Q-01) · property-based testing and resiliency
baseline not applied (NFR-Q-04/05) · backup and restore deferred (NFR-Q-03) · accessibility and
localization defaults (NFR-U-03/04) · standalone application, no external integrations (NFR-IN-01).

**NFR-IN-02 corroborates Q7:A**: it already specifies that people data is seeded via **CSV** import. The
CSV-only decision is consistent with the integration requirement, even though FR-I-01's "CSV/Excel"
remains only partially satisfied.

---

## 9. Rationale for the Eight Recommended Answers

The user delegated these. Each is the option I would defend; two had a genuinely close runner-up and
both are named.

| Q | Chosen | Why |
|---|---|---|
| **1** | **A — query per request** | Correctness beats speed on the one path where being wrong is a security failure. The query is org-unit-bound (U2-NFR-S-02), indexed, and returns a handful of rows, against a workload of low tens of users. **B was the close runner-up** and I rejected it for a specific reason: a scope cached at sign-in means an admin who moves a user between org units *does not change what that user can see* until they sign out — and with a 30-minute idle timeout, that window is long. Silent stale authorization is exactly the failure this unit exists to eliminate. C adds cache-invalidation code to the component where a bug is least acceptable. |
| **2** | **A — measure first** | An index added without a measurement is a guess with a maintenance cost, and it would forfeit the genuine "no migration" property this unit currently has. Both columns are already indexed; whether the planner uses them under an `OR` is answerable by `EXPLAIN` in one command. If it does not, adding the index then is cheap and evidence-based. |
| **3** | **A — under 30 s** | Comfortably inside default proxy and browser timeouts, and achievable without violating BR-IM-11. C (10 s) is the trap: at 2,000 rows it would pressure the implementation toward a bulk insert that bypasses Unit 1's components, which is precisely the duplication BR-IM-11 forbids. B (60 s) is long enough that users assume a hang. |
| **4** | **A — per-route** | A 5 MB limit on the sign-in endpoint has no purpose. Fastify supports per-route `bodyLimit`, so the cost of doing this correctly is one option on one route. |
| **5** | **A — log refusals at warn** | This unit *is* the enforcement point; without a signal, neither an enforcement bug nor a probing client is observable. NFR-Q-02 defers log **aggregation and monitoring infrastructure**, not the emission of a log line. Note what this logs: role, resource kind, operation, outcome — **never** the target's identity, which would leak through the log the very thing the refusal withheld. C (writes only) was tempting, but a repeated *read* refusal is the clearest signal of someone probing ids. |
| **6** | **C — all 40 cells (80 decisions) plus exhaustiveness** | A per-cell test catches a changed cell; only an exhaustiveness check catches a **new** `ResourceKind` or role added without a matrix entry. That is the realistic failure mode at a distance of months, and its symptom is a silent grant or denial. The cost over option A is a few lines. |
| **7** | **A — a maintained CSV library** | Quoted fields containing commas or newlines, CRLF, and BOM are exactly where hand-rolled parsers fail, and they fail by **silently shifting columns** rather than raising an error — so a member's email lands in the org-unit field and the row either fails confusingly or, worse, validates. Real spreadsheet exports contain all of these. One narrowly-scoped dependency is the right trade. |
| **8** | **A — no concurrency limit** | Import is Admin-only against low-tens concurrency; the UI disables the button while a request is in flight. Peak memory for one import is a few tens of MB, so even several at once is unremarkable for a Node process. **B has a failure mode that A does not**: a "one at a time" flag that is not cleared — because the process died mid-request — blocks *all* future imports until a restart. That is a worse outcome than the memory it saves. |

---

## 10. Open Items From This Stage

| Item | Nature | Resolution point |
|---|---|---|
| **The 2,000-row import must be timed** against U2-NFR-P-03's 30 s budget. The write phase is the entire budget and is currently an estimate, not a measurement. | Unverified performance claim | Code Generation |
| **BR-R-12's `OR` must be `EXPLAIN`ed** before concluding no index is needed (N-Q2:A). | Unverified performance claim | Code Generation |
| **Unit 1's endpoint timings must be re-run for a scoped role**, not only for Admin. The originals were measured against a filter that added no WHERE clause at all. | Regression risk | Code Generation |
| No import audit trail (Q10:A) | Accepted gap | Phase 2 |
| FR-I-01 partially satisfied — CSV only (Q7:A) | Accepted gap, recorded in `requirements.md` | Phase 2 |

The first three are stated as **unverified** deliberately. Nothing above should be read as measured
until Code Generation produces the numbers.
