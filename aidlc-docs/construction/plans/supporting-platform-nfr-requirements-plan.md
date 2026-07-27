# NFR Requirements Plan — `supporting-platform` (Unit 2)

**Stage**: CONSTRUCTION → NFR Requirements (per-unit loop, unit 2 of 2)
**Branch**: `aidlc/construction-supporting-platform`
**Date**: 2026-07-26
**Predecessor**: Unit 2 Functional Design APPROVED 2026-07-26

**Note**: NFR **Design** is skipped for this project (revision R2) — its obligations were folded into
Functional Design, and obligations 4 and 5 were discharged there. This stage covers NFR
**Requirements** only.

---

## 0. Why This Unit's NFR Profile Differs From Unit 1's

Unit 1's NFR work was dominated by the allocation algorithm: exact arithmetic, transactional atomicity,
sub-second availability search. Unit 2 has almost none of that. Its NFR surface is three things Unit 1
never faced:

| Concern | Why it is new |
|---|---|
| **A request path that runs on every single request** | `resolveScope` executes before every authorized operation. A slow or incorrect implementation degrades or breaks *everything*, not one feature. Unit 1's stand-in was pure computation with no I/O; the real one needs the org-unit subtree. |
| **A large synchronous request** | Import accepts 5 MB and up to 2,000 rows in one request (Q13:A). Unit 1's largest request body was a form submission. |
| **A security control whose correctness is not observable from the UI** | An over-permissive matrix looks identical to a correct one until someone sees data they should not. Unit 1's security work (hashing, session tokens) failed loudly; this fails silently. |

Everything else — availability, usability, deployment — is inherited from Unit 1 unchanged and is
recorded as such rather than restated.

---

## 1. Plan Steps

**All 10 steps complete 2026-07-26.** Artifacts at `aidlc-docs/construction/supporting-platform/nfr-requirements/`.

- [x] N1. Scalability: scope resolution cost per request; import volume ceilings
- [x] N2. Performance: budget for `resolveScope`; budget for a 2,000-row import; effect of BR-R-12's added `OR` on the assignment query plan
- [x] N3. Availability: inherited from Unit 1; confirm import failure leaves no partial state
- [x] N4. Security: the FR-R-08 obligations this unit finally discharges; upload handling; refusal logging
- [x] N5. Reliability: import transaction atomicity; fail-closed scope resolution
- [x] N6. Maintainability: permission-matrix exhaustiveness; test depth for 80 matrix cells; stand-in deletion verification
- [x] N7. Usability: inherited; the forbidden-state rendering requirement
- [x] N8. Tech stack: CSV parsing and multipart handling decisions; confirm no new runtime dependency elsewhere
- [x] N9. Generate `nfr-requirements.md`
- [x] N10. Generate `tech-stack-decisions.md`

---

## 2. Questions

> **All eight answered by AI recommendation**, at the user's instruction ("Get the best recommendations
> for the answers and continue") on 2026-07-26. Each answer is the option I would defend on the merits;
> the rationale for every one is in `nfr-requirements.md` §9, including the two where the runner-up had a
> real case. Any of these can be overridden — none is structural, and changing one changes configuration
> or test breadth, not the design.

---

## Question 1
`resolveScope` needs the caller's org-unit subtree on **every** request. Org units change rarely; a
subtree is at most one level deep (BR-O-01). Where should that lookup live?

A) **Query per request, no caching** — always correct, always current. One indexed query by
`parent_org_unit_id` returning at most a handful of rows, on every authorized request.

B) **Resolve once at sign-in, store on the session row** — one query per session instead of per request.
The cost: if an admin reparents an org unit or moves a user, **that user keeps their old scope until
they sign out and back in**. A stale authorization scope is a security-relevant staleness, not merely a
cache miss.

C) **In-process cache with a short TTL** (e.g. 60 s), invalidated on org-unit write — fast and bounded
staleness. Adds cache-invalidation code to the one component where being wrong matters most, and the
cache is per-process so it would need rethinking if the app were ever run multi-instance.

D) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, user instruction 2026-07-26)*
## Question 2
BR-R-12 widens the assignment scope predicate from "member's org unit" to "member's org unit **OR**
project's owning org unit". Both `member.org_unit_id` and `project.owning_org_unit_id` already carry
indexes, but the `OR` may still change the query plan. How should this be handled?

A) **Measure first, index only if needed** — run the assignment and allocation queries at design-target
volume (200 members, 50 projects, ~600 assignments), read the actual `EXPLAIN` output, and add an index
only if a measurement justifies it. Keeps Unit 2's "no migration" property unless evidence overturns it.

B) **Add a covering index preemptively** — introduce migration `002` now for the two-sided lookup.
Removes the risk of a slow query, at the cost of a migration added on speculation rather than evidence,
and an index that may never be used.

C) **Rewrite as a UNION instead of an OR** — two indexed lookups combined, which often plans better than
a disjunction. More SQL to maintain, and premature without a measurement.

D) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, user instruction 2026-07-26)*
## Question 3
What is an acceptable wall-clock time for a full 2,000-row member import, processed synchronously
(Q13:A)? This sets the request timeout and decides whether the choice of synchronous processing holds.

A) **Under 30 seconds** — comfortable within default proxy and browser timeouts; needs batched inserts
rather than 2,000 individual ones.

B) **Under 60 seconds** — more headroom for per-row component validation; approaches the point where a
user assumes the page has hung, so the screen must clearly show work in progress.

C) **Under 10 seconds** — demanding at 2,000 rows through Unit 1's per-row component validation, and
likely to force bulk-insert paths that bypass those components — which BR-IM-11 prohibits.

D) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, user instruction 2026-07-26)*
## Question 4
Fastify's default request body limit is **1 MB**, below the 5 MB import cap (BR-IM-02). How should the
limit be raised?

A) **Per-route only** — the import route accepts 5 MB; every other route keeps the 1 MB default. The
larger limit exists exactly where it is needed and nowhere else.

B) **Globally to 5 MB** — one configuration value, simpler to reason about. Every endpoint including
sign-in would then accept a 5 MB body.

C) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, user instruction 2026-07-26)*
## Question 5
Should authorization **refusals** be logged? NFR-Q-02 defers structured logging and monitoring, and the
Security Baseline extension is disabled — but this unit is the FR-R-08 enforcement point.

A) **Log refusals at warn level** — role, resource kind, and outcome; **never** the target record's
contents. Without this, an enforcement failure or a probing client is invisible. Cheap, and the one
signal that tells you the control is working.

B) **No refusal logging** — consistent with NFR-Q-02's deferral. A refusal is normal operation, not an
error, and logging every one adds noise to a system with no log aggregation.

C) **Log only write refusals** — reads are refused routinely by scope filtering; a rejected *write*
attempt is the more interesting signal.

D) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, user instruction 2026-07-26)*
## Question 6
How exhaustively should the 40-cell / 80-decision permission matrix (5 roles × 8 resource kinds × read/write) be
tested?

A) **All 40 cells asserted in a table-driven test** — the matrix is data, so the test is one loop over
expected values. Catches any cell edited by accident, which is the realistic failure mode for a table
this size.

B) **Representative cases per role** — roughly 15–20 assertions covering each role's boundaries.
Shorter, but a single mistyped cell can pass unnoticed.

C) **All 80 cells, plus an exhaustiveness check** that fails if a new `ResourceKind` or role is added
without a matrix entry — so the test breaks at compile or run time rather than defaulting silently.

D) Other (please describe after [Answer]: tag below)

[Answer]: C   *(AI recommendation, user instruction 2026-07-26)*
## Question 7
Import parses untrusted CSV uploaded by an Admin. Which parsing approach?

A) **A maintained CSV library** (e.g. `csv-parse`) — handles RFC 4180 quoting, embedded newlines and
BOM correctly. One well-scoped dependency; these edge cases are where hand-rolled parsers break on real
spreadsheet exports.

B) **Hand-rolled parser** — no new dependency, and full control. Quoted fields containing commas or
newlines are exactly the cases a hand-rolled parser gets wrong, and the failure is silent column
shifting rather than an error.

C) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, user instruction 2026-07-26)*
## Question 8
Should concurrent imports be limited? A 5 MB file plus parsed rows and Unit 1 component validation is
held in memory for the request's duration (BR-IM-25), and only Admins can import (BR-IM-22).

A) **No explicit limit** — Admin-only and low-tens concurrency (NFR-S-02) make simultaneous large
imports implausible. Adding a limiter is machinery for a scenario the deployment cannot produce.

B) **One import at a time, per process** — a second concurrent import is refused with "an import is
already running". Bounds peak memory deterministically for a few lines of code.

C) Other (please describe after [Answer]: tag below)

[Answer]: A   *(AI recommendation, user instruction 2026-07-26)*
---

## 3. Inherited Without Question

Recorded so their absence from the questions is a decision, not an oversight. All are unchanged from
Unit 1 and from the project-level NFRs:

| Area | Inherited position |
|---|---|
| Scale target | 200 members, 50 projects (NFR-S-01) |
| Concurrency | low tens (NFR-S-02) |
| Page load | under 3 s (NFR-S-03) |
| Availability | business-hours internal tool; no SLA, RTO or RPO; single instance (NFR-A-01/02/03) |
| Deployment | on-premises Docker; no cloud managed service (NFR-T-01, NFR-T-04) |
| TLS / encryption at rest | deployment concerns, not application requirements (NFR-SE-05) |
| CI pipeline | not a Phase 1 requirement (NFR-Q-01) |
| Extensions | Security Baseline, Resiliency Baseline, Property-Based Testing all **disabled**; FR-AU-02 and FR-R-08 remain **mandatory** (NFR-SE-01/02, NFR-Q-04/05) |
| Accessibility / localization | reasonable defaults; English only (NFR-U-03/04) |
| Data sensitivity | low; no contractor commercial data (NFR-SE-03, BR-M-09) |
| Backup / restore | deferred (NFR-Q-03) |

**NFR-IN-02 is worth noting**: it already states that people data is seeded via **CSV** import. Q7:A's
CSV-only decision is therefore consistent with the integration requirement, even though it leaves
FR-I-01's "CSV/Excel" only partially satisfied.
