# Performance Test Instructions

## Purpose, and what this is NOT

This validates that the application meets **NFR-S-03** (page loads under 3 s) at the **design-target
volume of 200 members and 50 projects** (NFR-S-01), with **low-tens concurrency** (NFR-S-02).

**There is no load test, no stress test and no virtual-user ramp, and their absence is a decision
rather than an omission.** A JMeter or k6 harness measuring throughput at 500 concurrent users would
produce numbers about a load this deployment cannot receive: it is a single-instance,
business-hours, single-department internal tool with no HA and no formal SLA (NFR-A-01/02/03).
Building that harness would generate confidence in the wrong direction.

What *is* measured is the handful of operations whose cost is either non-obvious or multiplied across
the whole application.

---

## Requirements being checked

| ID | Path | Target |
|---|---|---|
| U2-NFR-P-01 | `resolveScope` — runs before **every** authorized request | < 10 ms |
| U2-NFR-P-02 | Any Unit 1 endpoint, for a **scoped** role | no regression beyond U1 budgets |
| U2-NFR-P-03 | 2,000-row import, end to end | < 30 s |
| U2-NFR-P-04 | 200-row import (the stated real need) | < 5 s |
| U1-NFR-P-02 | Availability search — the success-criterion query | < 1 s |
| U1-NFR-P-06 | Member list with filters | < 500 ms |
| N-Q2:A | BR-R-12's disjunction — does it need an index? | empirical |

---

## Run them

The measurements are an automated suite, not a separate tool:

```bash
cd backend
export TEST_DATABASE_URL="postgres://chaos:test@127.0.0.1:55432/chaos_test"
npm test -- tests/supporting-platform/performance.test.ts
```

Each figure prints as `[MEASURED] …`, so the numbers in any summary can be traced to a run rather
than to a budget.

---

## Measured results — 2026-07-26

| Measurement | Target | **Measured** | Verdict |
|---|---|---|---|
| 2,000-row import | < 30 s | **6.8 s** | ✅ ~4× headroom |
| 200-row import | < 5 s | **0.62 s** | ✅ |
| Member list, `ADMIN` (unrestricted) | < 500 ms | **15.8 ms** | ✅ |
| Member list, `TEAM_LEAD` (scoped + subtree expansion) | < 500 ms | **12.1 ms** | ✅ |
| `resolveScope` + `toScopeFilter` | < 10 ms | **0.18 µs** | ✅ ~55,000× headroom |
| BR-R-12 `EXPLAIN`, 1,500 assignments | — | **2.1 ms** | ✅ no index needed |

### N-Q2:A is discharged on evidence

```
Seq Scan on assignment a  (cost=0.00..43032.18 rows=738) (actual time=1.562..1.908 rows=1500)
  ->  Index Scan using member_org_status_idx on member m  (actual time=0.023..0.387 rows=2200)
  ->  Seq Scan on project p  (never executed)
Execution Time: 2.135 ms
```

The member side uses the existing index. The outer sequential scan over `assignment` is the **correct**
plan when 1,500 of 1,500 rows match — a scan is cheaper than an index lookup that returns everything.

**Conclusion: no index is warranted, so Unit 2 still requires no migration.** This was the whole point
of N-Q2:A — measure before speculating.

### The scoped comparison, stated honestly

The scoped query measured **faster** than the unrestricted one (12.1 ms vs 15.8 ms). At this scale that
is **noise, not a finding** — do not read it as "scoping improves performance". What it does establish
is the thing U2-NFR-P-02 actually asked: the subtree expansion is not an order-of-magnitude
regression.

This mattered because **Unit 1's endpoint timings did not transfer.** They were measured against a
*permissive* filter, which `isUnrestricted` short-circuits to no `WHERE` clause at all. Re-measuring
for a scoped role was the only way to know.

---

## Why the thresholds are loose

The assertions allow far more time than the measurements need — 30 s for an import that takes 6.8 s.
That is deliberate. These run on developer hardware with no dedicated environment, so a tight bound
would make the suite flaky, and a flaky performance test teaches everyone to ignore performance
tests. **The bound exists to catch an order-of-magnitude regression**, not to police milliseconds.

---

## If a measurement regresses

### The import exceeds 30 s

**Do NOT bypass Unit 1's components with a bulk insert.** BR-IM-11 exists to prevent a second,
drifting copy of every validation rule — imported data would then obey different rules from
hand-entered data, which is a correctness failure traded for speed.

In order of preference:
1. Lower `IMPORT_MAX_ROWS` and say so.
2. Batch the inserts *through* the components if a seam allows it.
3. Move to a background job (Q13:C — declined for a ~200-row stated need, and revisitable).

### A scoped query regresses

1. `EXPLAIN (ANALYZE, BUFFERS)` the actual query — do not guess.
2. **Populate the table first.** A plan measured against an empty table is worthless; the first
   version of the BR-R-12 measurement made exactly that mistake and reported "Seq Scan rows=0",
   which answers nothing.
3. Add an index only if the plan justifies it, in a new migration.

### `resolveScope` slows down

This one is structural, not a tuning problem. It must remain **org-unit-bound, not data-bound**
(U2-NFR-S-02). If it ever queries members or assignments, its cost grows with the data and **every
endpoint in the application slows together**. Check first that nobody has added I/O to it.

---

## Not measured, and why

| Not measured | Why |
|---|---|
| Throughput / requests per second | low-tens concurrency; no load to characterise |
| Concurrent virtual users | single instance, no HA (NFR-A-03) |
| Sustained soak | business-hours tool; occasional downtime is acceptable |
| Frontend Core Web Vitals | **no browser has rendered these screens** — see the note in `integration-test-instructions.md`; measuring what nobody has looked at would be premature |
| Database growth over years | `AssignmentHistory` grows one row per change; no pruning needed in Phase 1 (U1-NFR-S-05) |
| 2,000-member scale (NFR-S-05) | Phase 1 targets 200. Scope resolution is org-unit-bound so it does not change; the member list would need pagination review |
