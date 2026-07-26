# API Documentation — `core-domain`

**Base**: same origin as the SPA · **Auth**: httpOnly session cookie · **Content type**: JSON

**50 endpoints** (49 under `/api` plus `/health`). Enumerated mechanically from the route
registrations, not by hand — see the note on counts at the end.

---

## Conventions

### Authentication

Every endpoint requires a valid session cookie **except** `GET /health`, `POST /api/auth/login`
and `GET /api/auth/session`. Missing or expired sessions return `401`.

The cookie is `httpOnly`, `sameSite=lax`, and `Secure` when `SESSION_COOKIE_SECURE=true`. The token
is never present in a response body.

### Error envelope

**Every** failure — 400, 401, 403, 404, 409, 500 — returns exactly this shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The member could not be created.",
    "violations": [
      { "field": "email", "rule": "DUPLICATE", "detail": "This email address is already used." },
      { "field": "fullName", "rule": "REQUIRED", "detail": "A full name is required." }
    ]
  }
}
```

`violations` carries **all** reasons, never only the first, so a form can place each message beside
its own input. `field` is `null` for whole-record violations, and may be a dotted path
(`contract.endDate`, `period.start`).

### Dates and percentages

- Dates are **calendar dates**, `YYYY-MM-DD`, and ranges are **inclusive at both ends**. An
  assignment ending `2026-03-31` consumes capacity *on* the 31st.
- Percentages cross the wire as **decimals with at most one place** (`37.5`). Internally they are
  integer tenths; the conversion happens only at this boundary.
- `availablePercentage` is **negative** when over-allocated. It is never clamped to zero.

### Status codes that may surprise you

| Situation | Status | Why |
|---|---|---|
| Over-allocation warning | **200** | It is a warning permitting override, not a rejection. The warning *is* step one's successful outcome |
| Delete refused because referenced | **200** with `removed: false` | The caller asked whether it could go; "no, and here is why" is a successful answer |
| Project close needing confirmation | **200** with `confirmationRequired: true` | A preview, not a failure. Nothing was written |
| Record exists but is out of your scope | **404** | `403` would confirm it exists, leaking what the scope filter hides |

---

## Health

### `GET /health`
Unauthenticated by design — a health check that needs credentials cannot be used by the thing that
needs it most. Reports connectivity only; nothing about configuration, versions or internals.

```json
{ "status": "ok", "database": true }
```
`503` with `"status": "degraded"` when the database is unreachable.

---

## Authentication

### `POST /api/auth/login`
```json
{ "username": "admin", "password": "…" }
```
→ `200`, sets the session cookie:
```json
{
  "user": { "userAccountId": "…", "username": "admin", "role": "ADMIN", "linkedMemberId": null },
  "scope": { "role": "ADMIN", "ownMemberId": null }
}
```
→ `401` for **both** a wrong password and an unknown username, with the identical message
`"The username or password is incorrect."` An inactive account gets a *different* message
(`"This account is not active…"`), returned only after the password is verified — so it cannot be
used to discover which usernames exist.

An empty username or password is rejected as `400` before any credential check.

### `POST /api/auth/logout`
→ `200 { "signedOut": true }`. Sets `terminatedAt` server-side; the cookie is cleared regardless.

### `GET /api/auth/session`
→ `200 { "authenticated": false }` when not signed in — an expected answer, not an error.
→ `200` with `user`, `scope` and `expiresAt` when signed in.

### `POST /api/auth/password`
```json
{ "newPassword": "…" }
```
Changes **your own** password; the account comes from the session, never the body. Terminates every
session for the account and clears your cookie.
→ `200 { "passwordChanged": true, "terminatedSessions": 2, "reauthenticationRequired": true }`

---

## Members

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/members` | Paged search |
| `GET` | `/api/members/me` | Your own record. No id parameter exists |
| `GET` | `/api/members/assignable` | Active members, for the assignment picker |
| `GET` | `/api/members/expiring-contracts` | Off-roll contracts ending soon |
| `GET` | `/api/members/:id` | `404` if out of scope |
| `POST` | `/api/members` | |
| `PATCH` | `/api/members/:id` | |
| `POST` | `/api/members/:id/deactivate` | Cascades |
| `POST` | `/api/members/:id/reactivate` | Does **not** restore assignments |
| `POST` | `/api/members/:id/skills` | |
| `DELETE` | `/api/members/:id/skills/:skillId` | |

### `GET /api/members`
Query: `search`, `orgUnitIds` (csv), `employmentType`, `status`, `skillIds` (csv), `roleId`,
`offset`, `limit` (max 200).

```json
{ "items": [ { "id": "…", "fullName": "Ada Lovelace", "email": "…", "orgUnitId": "…",
              "employmentType": "ON_ROLL", "roleId": "…", "status": "ACTIVE" } ],
  "total": 1, "offset": 0, "limit": 25 }
```
`total` respects scope — a scoped list with an unscoped count would leak the existence of hidden
rows.

### `POST /api/members`
```json
{
  "fullName": "Grace Hopper",
  "email": "grace@example.com",
  "orgUnitId": "…",
  "employmentType": "OFF_ROLL",
  "roleId": "…",
  "externalRef": "E-002",
  "skillIds": ["…"],
  "contract": { "vendorName": "Vendor Ltd", "startDate": "2026-01-01",
                "endDate": "2026-09-30", "status": "ACTIVE" }
}
```
`contract` is **required** when `employmentType` is `OFF_ROLL` and ignored otherwise. There is no
rate, contract-value or purchase-order field anywhere in this API.

→ `201` with the full member (including `skillIds` and `contract`).

### `PATCH /api/members/:id`
Partial. Changing `OFF_ROLL` → `ON_ROLL` **retains** the contract as history; it is not cleared.

### `POST /api/members/:id/deactivate`
Auto-ends every assignment running past today, and **reports how many**:
```json
{ "member": { … }, "autoEndedAssignmentCount": 3 }
```

---

## Projects

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/projects` | Paged search |
| `GET` | `/api/projects/open` | Assignment targets on a date; excludes closed |
| `GET` | `/api/projects/:id` | |
| `GET` | `/api/projects/:id/staffing` | Grouped by member with subtotals |
| `POST` | `/api/projects` | |
| `PATCH` | `/api/projects/:id` | |
| `POST` | `/api/projects/:id/close` | **Two-phase** |
| `POST` | `/api/projects/:id/reopen` | Does **not** restore assignments |

### `GET /api/projects/:id/staffing?asOf=2026-03-01`
```json
{
  "projectId": "…", "asOf": "2026-03-01",
  "current": [ { "memberId": "…", "subtotalTenths": 550,
                 "assignments": [ { "id": "…", "allocationTenths": 300,
                                    "startDate": "…", "endDate": "…" } ] } ],
  "past": [],
  "isUnstaffed": false
}
```
Rows are grouped **by member with a subtotal**: several concurrent assignments to one project are
permitted, and separate rows would read as duplicated data rather than a total. `current` versus
`past` is decided by **date**, not status. `isUnstaffed` means "no assignments at all" and is stated
explicitly, because that is different from "none current".

Subtotals here are in **tenths** (`550` = 55.0%), matching the assignment records they summarise.

### `POST /api/projects/:id/close` — two-phase
**Step one**, `{ "confirmOpenAssignments": false }`:
```json
{ "project": null, "confirmationRequired": true,
  "openAssignments": [ { "id": "…", "memberId": "…", "allocationTenths": 400,
                         "startDate": "…", "endDate": "2026-12-31" } ],
  "autoEndedAssignmentCount": 0 }
```
`project: null` means **nothing was written**. The list is exactly whose work would be ended.

**Step two**, `{ "confirmOpenAssignments": true }` → the closed project and the real count.

A project with nothing extending past the closure date closes immediately on step one — demanding
confirmation for a no-op trains users to click through dialogues.

---

## Assignments

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/assignments` | Defaults to **your own** when no filter is given |
| `GET` | `/api/assignments/as-of` | Historical reconstruction |
| `GET` | `/api/assignments/:id` | |
| `POST` | `/api/assignments` | **Two-step override** |
| `PATCH` | `/api/assignments/:id` | Same two-step |
| `POST` | `/api/assignments/:id/end` | |

### `POST /api/assignments` — the two-step override protocol
```json
{
  "memberId": "…", "projectId": "…",
  "allocationPercentage": 50,
  "period": { "start": "2026-01-01", "end": "2026-03-31" },
  "projectRoleId": null,
  "overrideOverAllocation": false
}
```

**Step one** — if capacity would be exceeded, `200` and **nothing is written**:
```json
{
  "assignment": null,
  "savedAsOverride": false,
  "requiresOverrideConfirmation": true,
  "overAllocation": [
    { "memberId": "…",
      "period": { "start": "2026-02-15", "end": "2026-02-28" },
      "totalPercentage": 130,
      "arisesFromOverride": false,
      "contributions": [
        { "assignmentId": "…", "projectCode": "PRJ-1", "projectName": "Platform",
          "allocationPercentage": 80, "savedAsOverride": false }
      ] }
  ],
  "conflicts": []
}
```
Each **offending sub-period** is named separately — a member over capacity in two different weeks
has two entries, because that is two distinct problems.

**Step two** — resubmit the same body with `"overrideOverAllocation": true` → `201`, and
`savedAsOverride: true`.

Resubmission (rather than a confirmation token) means the capacity check re-runs against current
data inside a row lock, so what the user confirmed is what the database sees.

> `savedAsOverride` is derived from the **detection result**, never from your flag. Sending
> `overrideOverAllocation: true` on an assignment that fits will **not** mark it as an override.

`conflicts` are separate, **non-blocking** warnings that never prevent a save:

```json
{ "kind": "CONTRACT_WINDOW",
  "detail": "This assignment runs to 2026-12-31, beyond the member's contract end date of 2026-09-30. The assignment can still be saved.",
  "boundaryDate": "2026-09-30" }
```
Kinds: `CONTRACT_WINDOW`, `MEMBER_INACTIVE_PERIOD`, `PROJECT_CLOSED`.

### `PATCH /api/assignments/:id`
Accepts `allocationPercentage`, `period`, `projectRoleId`, `overrideOverAllocation`.

`memberId` and `projectId` are **immutable** — moving an assignment would rewrite two members'
capacity history in one step with no record. Attempting it returns `400` with rule `IMMUTABLE`.

The assignment's own current row is excluded from its capacity check, so raising 50% → 60% is not
compared against a total that still contains the old 50%.

### `POST /api/assignments/:id/end`
```json
{ "effectiveEndDate": "2026-02-15" }
```
Moves `endDate`, sets status `ENDED`, and **preserves the elapsed portion** — the assignment still
counted toward capacity for the days it ran. Rejects a date before the start, or one that would
*extend* the assignment.

### `GET /api/assignments/as-of`
Query: `asOf`, `start`, `end`, `memberIds` (csv).

```json
{
  "asOf": "2026-03-15",
  "source": "ASSIGNMENT_HISTORY",
  "items": [ { "assignmentId": "…", "revisionNumber": 1, "operation": "CREATE",
               "allocationPercentage": 50, "startDate": "…", "endDate": "…",
               "recordedAt": "2026-01-01T09:00:00.000Z" } ]
}
```
Resolved against **assignment history**, not current rows — `source` says so explicitly so a client
can label the figures as reconstructed. An assignment created at 50% and later edited to 80% returns
**50%** for a date before the edit. Assignments of members since deactivated are included.

---

## Allocation views

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/allocations/current` | One row per member on a date |
| `GET` | `/api/allocations/availability` | Min **and** max free, with segments |
| `GET` | `/api/allocations/over-allocated` | One entry per offending sub-period |
| `GET` | `/api/allocations/unallocated` | The bench |
| `GET` | `/api/allocations/members/:id` | Segment profile |
| `GET` | `/api/allocations/members/:id/timeline` | Same, with gaps marked |

### `GET /api/allocations/current?asOf=2026-03-01`
Query also accepts `orgUnitIds`, `employmentType`, `roleId`, `skillIds`, `offset`, `limit`.

```json
{ "asOf": "2026-03-01", "total": 12, "offset": 0, "limit": 25,
  "items": [ { "member": { … }, "totalPercentage": 120,
               "availablePercentage": -20, "isOverAllocated": true,
               "contributions": [ … ] } ] }
```
Members with **no** assignments appear at 0% — omitting them would turn this into a list of only
busy people, hiding exactly who a manager is looking for.

### `GET /api/allocations/availability?start=…&end=…`
Also accepts `minimumAvailablePercentage`.

```json
{ "range": { … }, "total": 12, "offset": 0, "limit": 25,
  "items": [ { "member": { … },
               "minAvailablePercentage": 0, "maxAvailablePercentage": 100,
               "isFullyAllocated": false, "isOverAllocated": false,
               "segments": [ { "period": { … }, "totalPercentage": 60,
                               "availablePercentage": 40, "isOverAllocated": false,
                               "contributions": [ … ] } ] } ] }
```
Both bounds are returned because they answer different questions: the minimum says whether someone
can take a full-range assignment, the maximum whether any window is worth negotiating.

> **Known imprecision**: when `minimumAvailablePercentage` is supplied, `total` is the unfiltered
> member count, because the capacity filter runs after the query. The page may hold fewer items than
> `total` implies.

### `GET /api/allocations/members/:id/timeline?start=…&end=…`
Same as the profile, plus `isGap: true` on stretches with **nothing** booked — distinct from a
partially-booked stretch, which a UI must not render alike.

---

## Reference data

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/reference-data?type=ROLE` | `includeInactive=true` to see retired entries |
| `POST` | `/api/reference-data` | Immediately selectable |
| `PATCH` | `/api/reference-data/:id` | Rename; propagates by id, no cascade needed |
| `POST` | `/api/reference-data/:id/deactivate` | Existing references stay valid |
| `POST` | `/api/reference-data/:id/reactivate` | |
| `DELETE` | `/api/reference-data/:id` | Refused while referenced |

Reads are open to any authenticated user — role and skill lists populate every member form, so a
user who could not read them could not render a member page. Writes require `ADMIN` or
`RESOURCE_MANAGER`.

### `DELETE /api/reference-data/:id`
```json
{ "removed": false, "blockedByReferenceCount": 12, "alternative": "DEACTIVATE" }
```
Unreferenced entries really are deleted (`removed: true`) — an admin who created a typo should be
able to remove it rather than leave a deactivated mistake in the list forever.

---

## Org units

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/org-units` | Flat list |
| `GET` | `/api/org-units/hierarchy` | Two-level tree |
| `GET` | `/api/org-units/:id/references` | What would block removal |
| `POST` | `/api/org-units` | `parentOrgUnitId: null` creates a department |
| `PATCH` | `/api/org-units/:id` | **Rename only** |
| `DELETE` | `/api/org-units/:id` | Refused while referenced |
| `POST` | `/api/org-units/:id/deactivate` | Refused while it has teams |
| `POST` | `/api/org-units/:id/reactivate` | |

Exactly **two levels**: `parentOrgUnitId: null` is a department, a set value is a team, and a team
cannot parent anything. Attempting a third level returns `400` with rule `DEPTH_EXCEEDED` and names
the offending parent.

`PATCH` accepts only `name`. Reparenting is refused: moving a team between departments would silently
change who can see its members and the scope under which historical allocations were computed.

```json
// DELETE, refused
{ "removed": false,
  "blockedBy": { "memberCount": 4, "projectCount": 2, "childOrgUnitCount": 1 },
  "alternative": "DEACTIVATE" }
```

---

## Authorization summary

| Role | Read | Write |
|---|---|---|
| `ADMIN` | everything in scope | yes |
| `RESOURCE_MANAGER` | everything in scope | yes |
| `TEAM_LEAD` | everything in scope | **no** |
| `EXECUTIVE` | everything in scope | **no** |
| `TEAM_MEMBER` | **only their own** member record and assignments | **no** |

> ⚠️ **`in scope` currently means "everywhere".** Org-unit confinement for `TEAM_LEAD` and
> `RESOURCE_MANAGER` is **not enforced** in this phase — the mechanism exists and is tested, but the
> policy that populates it ships with `supporting-platform`. The `TEAM_MEMBER` restriction *is*
> enforced, verified across six routes by test.

A `TEAM_MEMBER` requesting another member gets `404`; a list returns only their own row, with
`total: 1`.

---

## A note on the endpoint count

`component-methods.md` §C-12 designed **37** routes. The implementation has **50** (49 + `/health`).
The additions are reactivate/reopen counterparts, reference-count endpoints, and `/members/me`,
`/members/assignable`, `/projects/open` — all needed to make the refusal rules actionable rather
than dead ends.

An earlier summary said "47 routes". That was a miscount; the figure above was produced by
enumerating the route registrations mechanically.
