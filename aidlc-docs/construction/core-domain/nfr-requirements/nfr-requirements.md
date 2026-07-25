# NFR Requirements — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` (1 of 2) · **Stage**: NFR Requirements
**Date**: 2026-07-25

Project-level NFRs were approved during Inception (`requirements.md` §4) and confirmed unchanged here
(**Q14:A**). This document restates them **as unit-specific, checkable targets** and states plainly which
are verifiable in Phase 1 and which are not.

---

## 1. Scalability

| ID | Requirement | Verifiable in Phase 1 |
|---|---|---|
| U1-NFR-S-01 | Design target: 200 members, 50 projects, ~600 active assignments | Yes — by seeding data |
| U1-NFR-S-02 | Concurrent users: low tens; no horizontal scaling required | Yes, informally |
| U1-NFR-S-03 | All list and view endpoints paginated; no unbounded result set reaches the client | **Yes — inspectable in code** |
| U1-NFR-S-04 | Data model must not preclude growth to ~2,000 members; Phase 1 need not be optimized for it | Partially — by review, not by measurement |
| U1-NFR-S-05 | `AssignmentHistory` grows one row per change; no pruning required within Phase 1 | Yes, by reasoning |

**Growth note**: the segmentation algorithm is O(assignments per member) per member, so a 10× member
increase is a 10× linear cost on an operation currently measured in microseconds. The binding constraint
at higher scale would be the batched overlap query, not the arithmetic.

---

## 2. Performance

| ID | Requirement | Target | Verifiable |
|---|---|---|---|
| U1-NFR-P-01 | Page load and view render | **< 3 s** at design-target volume (NFR-S-03) | Yes — manual timing |
| U1-NFR-P-02 | **Availability search** — the success-criterion query | **< 1 s** server time for a one-month range over 200 members | **Yes — the one measurement that matters** |
| U1-NFR-P-03 | Current allocation view (single as-of date) | < 500 ms server time | Yes |
| U1-NFR-P-04 | Assignment create including over-allocation check and history write | < 500 ms server time | Yes |
| U1-NFR-P-05 | As-of-date historical reconstruction | < 1 s server time | Yes |
| U1-NFR-P-06 | Member and project list with filters | < 500 ms server time | Yes |

### Performance budget for the availability query (U1-NFR-P-02)

This is the query the Phase 1 success criterion rests on — a manager answering "who is available next
month?" in under a minute of human time. The under-a-minute figure is a human-workflow measure; the
server budget below is what makes it achievable.

| Stage | Budget | Notes |
|---|---|---|
| Candidate member query (scope + filters applied in SQL) | ~50 ms | Indexed on `(orgUnitId, status)` plus skill join |
| **Batched** assignment overlap query | ~100 ms | **One query for all candidates.** Index `(memberId, startDate, endDate)` |
| Segmentation and summation in application code | ~10 ms | Pure integer arithmetic over a few hundred rows |
| Sort, paginate, serialize | ~50 ms | |
| **Total server budget** | **~210 ms**, ceiling 1 s | Leaves 4–5× headroom against the ceiling |

**The single largest risk to this budget is an N+1 query** — one assignment query per member instead of one
batched query for all. At 200 members that turns ~100 ms into ~200 separate round trips. It is prohibited
by rule 2 of the data access strategy (`business-logic-model.md` §7) and is the first thing to check if
this endpoint is slow.

---

## 3. Availability

| ID | Requirement |
|---|---|
| U1-NFR-A-01 | Business-hours internal tool. Occasional downtime acceptable. **No uptime SLA, RTO, or RPO committed.** |
| U1-NFR-A-02 | Single instance. No high availability, no failover, no load balancing (NFR-A-03 deferred). |
| U1-NFR-A-03 | Restart must be safe: no in-memory state whose loss corrupts data. Sessions are database-backed (Q8:A), so a restart does not sign everyone out. |
| U1-NFR-A-04 | Database container restart must not lose committed data — persistent volume required. |

**U1-NFR-A-03 is a real design constraint, not a platitude**: it is why sessions are database rows rather
than in-memory (functional design Q8:A rejected option C for exactly this reason).

---

## 4. Security

The Security Baseline extension is **disabled** (NFR-SE-01). What remains are the items retained as
**mandatory functional requirements** plus the baseline that falls out of the functional design.

| ID | Requirement | Status |
|---|---|---|
| U1-NFR-SE-01 | Security Baseline extension not enforced | Disabled by opt-in |
| U1-NFR-SE-02 | **Argon2id password hashing**, salt embedded, parameters recorded (FR-AU-02, BR-AU-01) | **Mandatory — NFR-SE-02 retention** |
| U1-NFR-SE-03 | **Server-side authorization on every data path**; no client-supplied role, scope, or id trusted (FR-R-08, BR-R-06) | **Mandatory — NFR-SE-02 retention** |
| U1-NFR-SE-04 | Session tokens: ≥128 bits entropy; **only the hash is stored**; HTTP-only cookie | From functional design §9 |
| U1-NFR-SE-05 | Sign-in rejection is uniform for unknown username and wrong password, with a dummy hash comparison on the unknown path (BR-AU-04, BR-AU-05) | From functional design §6 |
| U1-NFR-SE-06 | Parameterized queries throughout — no string-concatenated SQL, including in the hand-written allocation queries | Enforced by the query builder |
| U1-NFR-SE-07 | Data sensitivity: **low**. No contractor commercial data in Phase 1 (BR-M-09). No regulatory regime. | NFR-SE-03/04 |
| U1-NFR-SE-08 | TLS and encryption at rest are deployment concerns, not application requirements | NFR-SE-05 |

**U1-NFR-SE-06 deserves the explicit mention** because Q2:A puts hand-written SQL in the allocation
queries. Hand-written does not mean concatenated — every value is a bound parameter.

### Known accepted gap

**Org-scope visibility is not enforced while `core-domain` is the only completed unit** (X-1, BR-R-05). A
Team Lead or Resource Manager sees all org units. Accepted under the single-track, no-external-users
assumption; revisit trigger in `unit-of-work-dependency.md` §3.

---

## 5. Reliability

| ID | Requirement |
|---|---|
| U1-NFR-R-01 | The over-allocation check and its write are **transactionally atomic**, with a row-level lock on the member (BR-A-24) |
| U1-NFR-R-02 | Assignment mutation and its history revision commit **together or not at all** (BR-A-16) |
| U1-NFR-R-03 | The invariant "current `Assignment` row equals the history revision with `supersededAt IS NULL`" holds after every operation (BR-A-17) |
| U1-NFR-R-04 | Cancelling at an over-allocation warning persists nothing (BR-A-10) |
| U1-NFR-R-05 | Allocation arithmetic is exact — integer tenths, no floating point (BR-A-03) |
| U1-NFR-R-06 | Database constraints back the application rules: foreign keys, unique constraints on natural keys, and check constraints on percentage bounds. **The rules are not application-only.** |
| U1-NFR-R-07 | Unhandled errors return a generic message; internal detail is never returned to the client |
| U1-NFR-R-08 | Fault tolerance beyond transactional integrity is **not** required — no retries, no circuit breakers, no queues (Resiliency extension disabled) |

**U1-NFR-R-06 matters more than it looks.** With no automated test suite (NFR-Q-01), database constraints
are the only mechanism that catches a rule violation the application logic missed. They are the backstop
that partially compensates for the missing test suite, which is why they are a requirement here rather
than an implementation detail.

---

## 6. Maintainability

| ID | Requirement |
|---|---|
| U1-NFR-M-01 | TypeScript `strict` plus `noUncheckedIndexedAccess` in both workspaces (Q12:A) |
| U1-NFR-M-02 | No business rule in the route layer or the browser; rules live in domain and service layers only (Q4:A, US-ENB-04) |
| U1-NFR-M-03 | C-04 Allocation stays a **pure function** — no I/O, no state — so it is verifiable without a database |
| U1-NFR-M-04 | Unit code confined to its own directory; cross-unit contact only through `shared/` interfaces |
| U1-NFR-M-05 | The authorization stand-in lives in a **named, deletable directory**, not inline (X-1) |
| U1-NFR-M-06 | Unit tests generated for the allocation algorithm, business rules, and repositories. **CI and coverage thresholds not required** (NFR-Q-01) |
| U1-NFR-M-07 | Automation-friendly markup: stable `data-testid` on interactive elements, entity ids not row indices |
| U1-NFR-M-08 | Migrations are ordered, versioned, forward-only files; no schema change applied by hand |

---

## 7. Usability

| ID | Requirement |
|---|---|
| U1-NFR-U-01 | Responsive across desktop, tablet, and phone browsers (NFR-U-01) |
| U1-NFR-U-02 | Wide tables scroll within their own container; the page body never scrolls horizontally |
| U1-NFR-U-03 | Formal WCAG conformance **not** required; reasonable defaults only — labels, focus management, keyboard operability (NFR-U-03) |
| U1-NFR-U-04 | **Over-allocation is never signalled by colour alone** — icon and text accompany it |
| U1-NFR-U-05 | Allocation visuals identical everywhere they appear; over-allocated must never render like fully-allocated |
| U1-NFR-U-06 | Empty results always explicit, never a blank table (BR-V-08) |
| U1-NFR-U-07 | Rejected form submissions retain entered values (US-MEM-07) |
| U1-NFR-U-08 | English only (NFR-U-04) |

**U1-NFR-U-04 and U1-NFR-U-05 are not accessibility box-ticking.** The success criterion is a
speed-of-comprehension test. If an over-allocated member looks the same as a fully-booked one at a glance,
the screen fails its purpose regardless of whether the number underneath is correct.

---

## 8. Operability

Deliberately minimal. NFR-Q-02 defers structured logging and monitoring; **Q13:A** adds a small baseline.

| ID | Requirement |
|---|---|
| U1-NFR-O-01 | **Request logging**: one line per request — method, path, status, duration (Q13:A) |
| U1-NFR-O-02 | **`GET /health`**: returns service status and database connectivity (Q13:A) |
| U1-NFR-O-03 | Startup fails fast and loudly on missing configuration or an unreachable database, rather than starting degraded |
| U1-NFR-O-04 | **No credential, password, session token, or hash appears in any log line** |
| U1-NFR-O-05 | Structured JSON logs, metrics, tracing, alerting, and backup/restore procedures remain **deferred** (NFR-Q-02/03) |
| U1-NFR-O-06 | Configuration via environment variables; no secret committed to the repository |

**Why U1-NFR-O-01 and O-02 were worth relaxing NFR-Q-02 for**: about an hour of work, and without them a
production problem in an on-premises install with no monitoring is genuinely undiagnosable. Q13:A accepted
that trade; U1-NFR-O-05 holds the line on everything else.

---

## 9. Verifiability Summary

Honest accounting, given NFR-Q-01 defers the test suite and CI.

| Category | How it will actually be verified in Phase 1 |
|---|---|
| Performance | Manual timing against seeded design-target data; U1-NFR-P-02 is the measurement that matters |
| Functional correctness | Generated unit tests plus the Given/When/Then criteria in `stories.md` as a manual checklist |
| Allocation arithmetic | Unit tests over the pure function, plus hand-checking the five rules named in `business-rules.md` §9 |
| Security | Code review against U1-NFR-SE-02, SE-03, SE-04; direct API calls bypassing the UI to confirm server-side enforcement |
| Reliability invariants | Database constraints (U1-NFR-R-06) plus targeted manual checks of U1-NFR-R-03 |
| Availability | Not verified — no SLA committed |
| Accessibility | Not verified — no conformance target |

**Stated plainly**: there is no automated gate on any of this in Phase 1. That is your explicit decision
(Q17:A, CQ6:A), and this table exists so the consequence is visible rather than assumed away.
