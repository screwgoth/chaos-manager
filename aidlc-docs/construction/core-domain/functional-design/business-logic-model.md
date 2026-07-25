# Business Logic Model — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` · **Stage**: Functional Design
**Date**: 2026-07-25

Technology-agnostic. Pseudocode is illustrative logic, not target-language code.

## Contents

1. Allocation algorithm — segmentation and summation
2. Over-allocation detection
3. Availability computation
4. Assignment create and edit workflows
5. As-of-date historical reconstruction
6. Authentication and session establishment
7. Data access strategy (**R2-1**)
8. Performance approach (**R2-6**)
9. Session handling design (**R2-2**)
10. Replaceable authentication boundary (**R2-3**)
11. `IAuthorizationComponent` contract and the permissive stand-in (**X-1**)

---

## 1. Allocation Algorithm — Segmentation and Summation

The single most important algorithm in the system. Everything in §2 and §3 is a view of this.

**Owned by**: C-04 AllocationComponent. Pure computation — no writes, no persistent state.
**Computation location**: application code, over rows fetched from the repository (**Q7:A**).

### Core concept

A member's total allocation is not a single number over a date range — it **changes at every date where
an assignment starts or ends**. So the range is cut into *segments*, each with a constant total.

### Arithmetic representation

All percentages are handled as **integer tenths** (`50.0% → 500`, capacity `100.0% → 1000`). No
floating-point arithmetic appears anywhere in allocation logic. Conversion to decimal happens only at
the presentation boundary.

*Rationale*: with Q3:C permitting one decimal place, float summation is **order-dependent**. The same
three assignments summed in different orders give `33.3 + 33.3 + 33.4 === 100` but
`33.4 + 33.3 + 33.3 === 99.99999999999999`. An exact comparison against the 100.0% threshold would
therefore depend on the order rows came back from the database. Integer tenths make every sum exact.

*(Correction: an earlier draft of this document claimed `33.3 + 33.3 + 33.4` was itself unreliable. It is
not — that particular sum is exact. The real hazard is order-dependence, verified in
`backend/tests/core-domain/tenths.test.ts`.)*

### Algorithm

```
FUNCTION segmentAllocation(memberId, rangeStart, rangeEnd, assignments):

  # assignments: all rows for memberId whose [startDate, endDate] intersects
  #              [rangeStart, rangeEnd]  -- both inclusive (AS-03)

  # 1. Collect segment boundaries: every date at which the total can change
  boundaries = { rangeStart, rangeEnd + 1 day }
  FOR EACH a IN assignments:
      IF a.startDate    > rangeStart THEN boundaries.add(a.startDate)
      IF a.endDate + 1d <= rangeEnd  THEN boundaries.add(a.endDate + 1 day)
  sortedBoundaries = sort(boundaries)

  # 2. Build one segment between each consecutive pair
  segments = []
  FOR i FROM 0 TO length(sortedBoundaries) - 2:
      segStart = sortedBoundaries[i]
      segEnd   = sortedBoundaries[i + 1] - 1 day       # inclusive end

      covering = [ a IN assignments
                   WHERE a.startDate <= segStart AND a.endDate >= segEnd ]

      totalTenths = sum(a.allocationTenths FOR a IN covering)   # exact integer sum

      segments.add({
          period:        { start: segStart, end: segEnd },
          totalTenths:   totalTenths,
          availableTenths: CAPACITY_TENTHS - totalTenths,       # may be negative
          isOverAllocated: totalTenths > CAPACITY_TENTHS,
          contributions: covering
      })

  # 3. Merge adjacent segments with identical totals and identical contributors,
  #    so the caller sees the coarsest correct view
  RETURN mergeAdjacentEquivalent(segments)


CONSTANT CAPACITY_TENTHS = 1000      # 100.0% for every member
                                     # AS-01: part-time members NOT modelled in Phase 1.
                                     # Expressed once, here, so a later phase can promote it
                                     # to Member.capacityTenths without changing any caller.
```

### Boundary semantics

- Both `startDate` and `endDate` are **inclusive** (AS-03). A one-day assignment has `startDate == endDate`.
- Assignment A ending 31 March and B starting 1 April **do not overlap**. Their totals never sum.
- Assignment A ending 31 March and B starting 31 March **do overlap**, on exactly that one day.

This is the classic off-by-one source in date-range arithmetic. It is stated explicitly because there is
no automated test suite (NFR-Q-01) to catch a mistake here, and every downstream figure depends on it.

### Worked example

Member with three assignments; query range 1 Mar – 30 Apr:

| Assignment | Period | Percentage |
|---|---|---|
| A | 1 Feb – 31 Mar | 50.0% |
| B | 15 Mar – 30 Apr | 30.0% |
| C | 1 Apr – 15 Apr | 40.0% |

Boundaries: 1 Mar · 15 Mar · 1 Apr · 16 Apr · 1 May → segments:

| Segment | Covering | Total | Available | Over? |
|---|---|---|---|---|
| 1 Mar – 14 Mar | A | 50.0% | 50.0% | no |
| 15 Mar – 31 Mar | A, B | 80.0% | 20.0% | no |
| 1 Apr – 15 Apr | B, C | 70.0% | 30.0% | no |
| 16 Apr – 30 Apr | B | 30.0% | 70.0% | no |

---

## 2. Over-Allocation Detection

Satisfies FR-A-04, FR-A-05, FR-A-06 and US-ASN-05, whose criteria require identifying **the specific
sub-period** that exceeds 100%, not merely that the range does somewhere.

```
FUNCTION detectOverAllocation(memberId, candidate, excludeAssignmentId):

  # candidate: the assignment about to be created or updated (not yet persisted)
  existing = fetchOverlapping(memberId, candidate.startDate, candidate.endDate)
  IF excludeAssignmentId IS NOT NULL:
      existing = existing WHERE id != excludeAssignmentId    # editing: ignore own current row

  segments = segmentAllocation(memberId,
                               candidate.startDate,
                               candidate.endDate,
                               existing + [candidate])

  findings = [ s IN segments WHERE s.isOverAllocated ]

  RETURN findings.map(s -> {
      memberId:      memberId,
      period:        s.period,          # THE SPECIFIC over-allocated sub-period
      totalTenths:   s.totalTenths,
      contributions: s.contributions,
      arisesFromOverride: any(c.savedAsOverride FOR c IN s.contributions)
  })
```

**Key property**: findings are computed only over the *candidate's* range, and only the segments that
actually exceed capacity are returned. An assignment overlapping an existing one for three days out of
ninety produces one finding covering those three days — which is exactly what US-ASN-05's last criterion
demands.

**Warning, not block** (AS-02, FR-A-06). Findings never prevent a save on their own; they gate it behind
an explicit override.

---

## 3. Availability Computation

The inverse of §1, and the algorithm behind the Phase 1 success criterion (US-VIS-02, US-VIS-03).

```
FUNCTION availability(query, scopeFilter):

  candidates = memberComponent.search({
      orgUnitIds:     query.orgUnitIds,
      employmentType: query.employmentType,
      roleIds:        query.roleIds,
      skillIds:       query.skillIds,
      status:         ACTIVE
  }, scopeFilter)

  assignmentsByMember = fetchOverlappingForMembers(
      candidates.ids, query.range.start, query.range.end)     # ONE batched query

  results = []
  FOR EACH m IN candidates:
      segments = segmentAllocation(m.id, query.range.start, query.range.end,
                                   assignmentsByMember[m.id] OR [])
      results.add({
          member:                 m,
          segments:               segments,
          minAvailableTenths:     min(s.availableTenths FOR s IN segments),
          maxAvailableTenths:     max(s.availableTenths FOR s IN segments),
          isFullyAllocated:       max(s.availableTenths) <= 0,
          isOverAllocated:        any(s.isOverAllocated FOR s IN segments)
      })

  IF query.minimumAvailablePercentage IS NOT NULL:
      results = results WHERE maxAvailableTenths >= query.minimumTenths

  # Most-available first: managers are scanning for capacity, so put it at the top
  RETURN paginate(sort(results, BY maxAvailableTenths DESC, THEN fullName ASC))
```

**Derived views**, all from the same function rather than separate logic:

| View | Story | Derivation |
|---|---|---|
| Current allocation | US-VIS-01 | `segmentAllocation` with range = `[asOf, asOf]` |
| Unallocated / bench | US-VIS-06 (Unit 2) | filter `maxAvailableTenths == CAPACITY_TENTHS` for the whole range |
| Over-allocated list | US-VIS-07 (Unit 2) | filter `isOverAllocated`, return the offending segments |
| Member timeline | US-VIS-05 (Unit 2) | `segmentAllocation` for one member, gaps = segments with `totalTenths == 0` |
| Own assignments | US-VIS-04 | `segmentAllocation` scoped to the session's linked member |

Unit 2's four view stories are therefore **filters over Unit 1's algorithm**, not new computation — which
is why they were safe to defer.

---

## 4. Assignment Create and Edit Workflows

### 4.1 Create (US-ASN-01, US-ASN-05, US-ASN-06)

```
BEGIN TRANSACTION                                  # Q6:A
  LOCK member row FOR UPDATE (memberId)            # serialises concurrent writers

  1. authorization.assertCanWrite(scope, ASSIGNMENT, {orgUnitId of member and project})
  2. member  = load(memberId);  assert status == ACTIVE
  3. project = load(projectId); assert status == ACTIVE
  4. validate percentage in [1, 1000] tenths
     validate endDate >= startDate
     collect conflicts:
        - CONTRACT_WINDOW        if OFF_ROLL and range exceeds contract dates
        - MEMBER_INACTIVE_PERIOD if range falls outside member's active period
  5. findings = detectOverAllocation(memberId, candidate, null)

  6. IF findings non-empty AND NOT overrideOverAllocation:
        ROLLBACK
        RETURN { assignment: null, overAllocation: findings, conflicts }
        # nothing persisted

  7. assignment = INSERT Assignment(..., savedAsOverride = findings non-empty)
  8. INSERT AssignmentHistory(assignmentId, revisionNumber = 1,
                              operation = CREATE, recordedAt = now,
                              supersededAt = null, actorUserId, <snapshot>)
COMMIT

RETURN { assignment, overAllocation: findings, savedAsOverride, conflicts }
```

**Why the lock (Q6:A)**: without it, two managers assigning the same member concurrently can both pass
step 5 and both write at step 7, producing an over-allocation that was never warned about and is not
marked as an override. The lock is on the *member* row because the member is what has finite capacity.
At a few tens of concurrent users the contention cost is irrelevant.

**Note**: `savedAsOverride` is set from the *detection result*, not from the user's flag. A user who ticks
override when no over-allocation exists does not get a row falsely marked.

### 4.2 Edit (US-ASN-03) — mutate in place plus history (Q2:C)

```
BEGIN TRANSACTION
  LOCK member row FOR UPDATE
  1. authorization.assertCanWrite(...)
  2. current = load(assignmentId); assert exists
  3. validate the proposed values as in create step 4
  4. findings = detectOverAllocation(memberId, proposed, excludeAssignmentId = assignmentId)
  5. IF findings non-empty AND NOT override: ROLLBACK; return findings
  6. UPDATE Assignment SET <new values>, savedAsOverride, updatedAt, updatedByUserId
  7. UPDATE AssignmentHistory SET supersededAt = now
       WHERE assignmentId = ... AND supersededAt IS NULL
  8. INSERT AssignmentHistory(revisionNumber = previous + 1,
                              operation = UPDATE, recordedAt = now,
                              supersededAt = null, <new snapshot>)
COMMIT
```

Steps 6–8 are inseparable. Committing 6 without 7–8 breaks the invariant that the current `Assignment`
row equals the revision with `supersededAt IS NULL`, and silently destroys history.

**Exclusion at step 4 matters**: when editing, the assignment's own current row must be excluded from the
over-allocation check, or every edit would count the member's existing commitment twice and warn spuriously.

### 4.3 End early (US-ASN-03)

Sets `endDate = effectiveEndDate`, `status = ENDED`, `endedEarlyOn = effectiveEndDate`, and writes an
`END_EARLY` history revision. Allocation from that date forward is released; the elapsed portion remains
in history and continues to appear in as-of queries for dates inside it.

### 4.4 Auto-end cascade (Q5:A)

Triggered by member deactivation (US-MEM-05) or project closure (US-PRJ-02):

```
FUNCTION autoEndOpenAssignments(scopeKey, effectiveDate, operation):
  affected = assignments WHERE <member or project matches>
                           AND endDate > effectiveDate
                           AND status = ACTIVE
  FOR EACH a IN affected:
      UPDATE a SET endDate = effectiveDate, status = ENDED
      close current history revision; INSERT revision(operation = AUTO_END)
  RETURN count(affected)
```

The count is reported to the user (US-MEM-05, US-PRJ-02 criteria). Assignments already ended, or ending on
or before the effective date, are untouched. **Reactivating a member does not restore auto-ended
assignments** — restoration would silently recreate commitments nobody re-approved.

---

## 5. As-Of-Date Historical Reconstruction (US-ASN-07)

Two distinct query paths exist, and using the wrong one produces confidently wrong answers. See
`domain-entities.md` §10 for why Q1:B + Q2:C makes this bi-temporal.

### Path A — present and future (US-VIS-01, US-VIS-02)

Read **current `Assignment` rows**. Filter by valid time. Fast, simple, correct for now and forward.

### Path B — historical as-of (US-ASN-07)

Read **`AssignmentHistory`**. Reconstruct in two steps:

```
FUNCTION allocationAsOf(validDate, transactionInstant, scopeFilter):

  # transactionInstant defaults to `validDate end-of-day` --
  # "as the records stood at the end of that day"

  # 1. Transaction time: the revision current at that instant
  revisions = SELECT * FROM AssignmentHistory
              WHERE recordedAt <= transactionInstant
                AND (supersededAt IS NULL OR supersededAt > transactionInstant)

  # 2. Valid time: of those, the ones actually in effect on the date
  inEffect = revisions WHERE startDate <= validDate AND endDate >= validDate

  RETURN segmentAllocation(..., inEffect)   # same algorithm as §1
```

**Worked example** — the case that motivates the whole design:

> An assignment runs 1 Jan – 30 Jun at 50%. On 1 May a manager edits it to 80%.
> Query: "what was this member allocated on 15 March?"
>
> - **Path A** would read the current row and answer **80%** — wrong. On 15 March it was 50%.
> - **Path B** finds the revision current on 15 March (revision 1, recorded 1 Jan, superseded 1 May) and answers **50%** — correct.

**Design rule**: US-ASN-07 uses Path B exclusively. This satisfies its third criterion, "it appears as it
stood on that date". Deactivated members' historical assignments appear normally, because reconstruction
reads history and never filters on current member status.

---

## 6. Authentication and Session Establishment

```
FUNCTION login(username, plainPassword):
  identity = identityComponent.verifyCredentials(username, plainPassword)
  IF identity IS NULL OR NOT identity.isActive:
      RETURN generic rejection            # US-ACC-03: same message either way
  scope   = authorization.resolveScope(identity)
  session = sessionComponent.establish(identity)
  RETURN { session, scope }


FUNCTION verifyCredentials(username, plainPassword):
  account = findByUsernameCaseInsensitive(username)
  IF account IS NULL:
      performDummyHashComparison()        # constant-ish time; do not leak existence
      RETURN null
  IF NOT argon2Verify(account.passwordHash, plainPassword): RETURN null
  RETURN VerifiedIdentity{ ...account }
```

**Enumeration resistance** (US-ACC-03): an unknown username and a wrong password return the same message,
and the unknown-username path performs a dummy hash comparison so response timing does not reveal which
usernames exist. Not a full timing-attack defence — the security extension is disabled (NFR-SE-01) — but
it costs nothing and closes the obvious hole.

**Password storage** (Q10:A, FR-AU-02, US-ENB-02): Argon2id, salt embedded in the encoded hash,
algorithm and parameters recorded in `passwordAlgorithm` so hashes can be re-parameterised later. Two
users with the same password produce different hashes because salts differ. No plaintext or reversible
form is stored, returned, or logged anywhere.

---

## 7. Data Access Strategy — discharges **R2-1**

**Boundary**: C-04 AllocationComponent performs **no persistence access of its own**. It is a pure
function over data handed to it. Repositories fetch; C-04 computes.

```
S-06 AllocationQueryService
     |  1. resolve scope
     |  2. ask MemberRepository for the candidate member set (scope applied IN the query)
     |  3. ask AssignmentRepository for all assignments overlapping the range,
     |     for ALL candidates, in ONE batched call
     v
C-04 AllocationComponent
     |  4. pure computation: segment, sum, invert, classify
     v
S-06  5. shape, sort, paginate
```

**Rules**

1. **Scope filters are applied inside the query**, never as a post-fetch trim. Out-of-scope rows are never fetched (FR-R-08, US-ENB-01).
2. **One batched assignment query per view**, never per member. A per-member query inside a loop over 200 members is the obvious N+1 trap here, and the availability view is exactly where it would appear.
3. **C-04 never issues a query.** This keeps it a pure function — hand-verifiable, and testable without a database, which matters with no automated test suite (NFR-Q-01).
4. **Repositories return domain shapes**, not database rows, so the persistence choice (OD-01) cannot leak upward.
5. **Transaction boundaries live in the service layer**, not in components or repositories — because the create/edit flows in §4 must span a check and a write.

---

## 8. Performance Approach — discharges **R2-6**

**Target**: NFR-S-03, sub-3-second page loads; and the Phase 1 success criterion of answering "who is
available next month?" in under a minute of human time.

**Strategy** (Q7:A): compute in application code over fetched rows. No SQL aggregation, no denormalised
allocation table, no caching layer in Phase 1.

### Why this is adequate here

At the design target (NFR-S-01: 200 members, 50 projects), a plausible upper bound is ~600 active
assignments. An availability query over a one-month range fetches the subset overlapping that month —
low hundreds of rows — and segments them per member. That is microseconds of arithmetic; the wall-clock
cost is the query and the network, not the computation.

### What actually threatens the target

| Risk | Mitigation |
|---|---|
| **N+1 queries** — one assignment query per member | Rule 2 in §7: one batched query per view. This is the single most likely cause of missing NFR-S-03. |
| Missing index on `(memberId, startDate, endDate)` | Named as the most important index in `domain-entities.md` §12 |
| Segment explosion from many short assignments | Segments are bounded by `2 × assignments + 1` per member; with merging of equivalent adjacent segments, output stays small |
| Unbounded result sets | Availability, allocation view, and member search are all paginated |
| History-table growth | `AssignmentHistory` grows by one row per change, not per read. At this scale it will not reach a size that matters within Phase 1. |

### Escape hatch, documented rather than built

If measured performance misses the target, the intervention order is: (1) confirm indexes are present and
used, (2) narrow the fetched column set, (3) push segment aggregation into SQL for the availability query
only, keeping the rules in C-04. Steps 1 and 2 are almost certainly sufficient at this scale.
**Nothing in this list is built pre-emptively** — that would be speculative complexity around the
highest-risk code in the project.

---

## 9. Session Handling Design — discharges **R2-2**

**Shape** (Q8:A): server-side session records; the client holds an opaque token in an HTTP-only cookie.

| Concern | Design |
|---|---|
| Token generation | Cryptographically random, ≥128 bits of entropy |
| Storage | Only the token's **hash** is persisted (`Session.tokenHash`) — a leaked session table cannot be replayed |
| Transport | HTTP-only cookie, `SameSite=Lax`; the `Secure` flag is a deployment concern (NFR-SE-05) |
| Validation | Every request: hash the presented token, look it up, check `terminatedAt IS NULL AND now < expiresAt` |
| Sliding expiry | On a valid request, set `lastSeenAt = now`, `expiresAt = now + window` (Q9:B: 30 min, configurable) |
| Sign-out | Set `terminatedAt` — genuine server-side termination, not merely clearing a cookie (US-ACC-02) |
| Forced termination | `terminateAllForUser` supports deactivating an account and revoking its live sessions |
| Expired-session response | Reject and signal re-authentication; the frontend routes to sign-in (US-ACC-02) |
| Cleanup | Periodic deletion of sessions expired beyond a retention window; not required for correctness |

**Why server-side rather than a stateless token**: sign-out and forced termination must actually work.
A stateless signed token cannot be revoked without a revocation list, which reintroduces the state it was
meant to avoid — with worse semantics.

---

## 10. Replaceable Authentication Boundary — discharges **R2-3** (US-ENB-03)

Three concerns are separated so that SSO can replace one of them without touching the others:

```
   +--------------------------------------------------+
   | 1. CREDENTIAL VERIFICATION   (C-07 Identity)     |
   |    credentials -> VerifiedIdentity or null       |
   |    <-- SSO REPLACES ONLY THIS BOX -->            |
   +--------------------------------------------------+
                        |
                        v  VerifiedIdentity
   +--------------------------------------------------+
   | 2. IDENTITY RESOLUTION       (C-07 Identity)     |
   |    account -> role, homeOrgUnit, linkedMemberId  |
   +--------------------------------------------------+
                        |
                        v  VerifiedIdentity
   +--------------------------------------------------+
   | 3. SESSION ESTABLISHMENT     (C-08 Session)      |
   |    VerifiedIdentity -> Session                   |
   +--------------------------------------------------+
```

**The contract that makes replacement cheap**: `VerifiedIdentity` is the sole currency between the boxes.
Session establishment and authorization consume it and know nothing about *how* it was produced.

**What a Phase 2 SSO addition would touch**: box 1 only — a new provider returning `VerifiedIdentity`
from an assertion instead of from a password. Boxes 2 and 3, all authorization, the user-to-member link,
and every service and route remain unchanged.

**What would break the boundary, and is therefore prohibited**: any code outside box 1 reading
`passwordHash`; any authorization decision inspecting *how* the user authenticated; any session field
that only makes sense for local passwords.

---

## 11. `IAuthorizationComponent` Contract and the Permissive Stand-In — **X-1**

The interface must be **complete and stable now**, because Unit 2 replaces only the implementation. If
Unit 2 has to widen the interface, every Unit 1 call site changes — precisely the rework the stand-in
pattern exists to prevent.

### Interface — final, not to be widened by Unit 2

```typescript
interface IAuthorizationComponent {
  resolveScope(identity: VerifiedIdentity): AccessScope
  toScopeFilter(scope: AccessScope): ScopeFilter
  canRead (scope: AccessScope, resource: ResourceKind, target: TargetRef | null): boolean
  canWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): boolean
  assertCanRead (scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void
  assertCanWrite(scope: AccessScope, resource: ResourceKind, target: TargetRef | null): void
}
```

Defined in `backend/src/shared/types/` — belonging to neither unit, which is what breaks the apparent
dependency cycle between them.

### Stand-in behaviour — exact, per **Q6:A**

```
resolveScope(identity):
    RETURN { role:         identity.role,           # role IS resolved
             orgUnitIds:   'ALL',                   # org restriction NOT applied
             ownMemberId:  identity.linkedMemberId }

toScopeFilter(scope):
    IF scope.role == TEAM_MEMBER:
        RETURN { orgUnitIds: 'ALL', restrictToMemberId: scope.ownMemberId }
    RETURN { orgUnitIds: 'ALL', restrictToMemberId: null }

canWrite(scope, resource, target):
    RETURN scope.role IN (ADMIN, RESOURCE_MANAGER)      # EXECUTIVE, TEAM_LEAD, TEAM_MEMBER: no
canRead(scope, resource, target):
    RETURN true                                        # <-- the gap
```

### What the stand-in does and does not enforce

| Rule | Stand-in | Real (Unit 2) |
|---|---|---|
| Executive is read-only | **Enforced** | Enforced |
| Team Lead cannot modify assignments | **Enforced** | Enforced |
| Team Member sees only their own assignments | **Enforced** — via `restrictToMemberId` | Enforced |
| Team Lead sees only their own org unit | **NOT enforced** | Enforced |
| Resource Manager confined to permitted org scope | **NOT enforced** | Enforced |

**Deliberate choice within Q6:A**: the Team Member restriction *is* enforced even in the stand-in, because
US-VIS-04's criterion "no other member's assignments are reachable to me by any route" is the one gap that
would be visible and alarming to an ordinary user, and `restrictToMemberId` costs nothing to honour. The
remaining gap is manager-level cross-org visibility.

> **⚠️ Consequence**: while `core-domain` is the only completed unit, a **Team Lead or Resource Manager
> sees members, projects, and allocations across all org units**. Acceptable only under the single-track,
> no-external-users assumption (unit plan Q7:A). Revisit trigger is recorded in
> `unit-of-work-dependency.md` §3.

### Replacement procedure for Unit 2

1. Implement C-09 at `backend/src/supporting-platform/authorization/` against the unchanged interface
2. Repoint the composition root from the stand-in to the real implementation
3. **Delete `backend/src/core-domain/authorization-standin/` entirely** — a stand-in left in the tree is a stand-in that gets used again by accident
4. Verify no Unit 1 caller changed — if any did, the interface was incomplete and that is a Unit 1 design defect, not a Unit 2 one
