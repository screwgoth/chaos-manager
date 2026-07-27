# Frontend Components — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` · **Stage**: Functional Design
**Date**: 2026-07-25

**Structure**: feature folders (Q5:A of Application Design) under `frontend/src/core-domain/`
**State management**: server-state library for reads and mutations + React local state for forms + a
session context (**Q13:A**)
**Concrete library selection** (TanStack Query vs alternative) is **OD-03**, decided at NFR Requirements.
This document specifies the *pattern*, not the package.

---

## 1. State Management Pattern (Q13:A)

| State kind | Held in | Examples |
|---|---|---|
| **Server state** | Server-state library cache, keyed by query | member list, project list, allocation view, availability results |
| **Form state** | Component-local `useState` / `useReducer` | member form fields, assignment form, filter draft before submit |
| **Session state** | One React context | current user, role, linked member id, sign-out action |
| **Ephemeral UI state** | Component-local | modal open/closed, expanded rows, sort direction |

**No global client store.** Allocation data is server-owned and derived; caching it in a client store makes
staleness the frontend's problem. Mutations invalidate the affected query keys instead.

### Cache invalidation map — the part that gets forgotten

Assignment mutations change allocation figures everywhere. Getting this table wrong is why a UI shows a
stale over-allocation after a save.

| Mutation | Invalidates |
|---|---|
| Create / edit / end assignment | `allocations:*`, `availability:*`, `member:{id}`, `project:{id}`, `assignments:*` |
| Create / edit / deactivate member | `members:*`, `allocations:*`, `availability:*` |
| Create / edit / close project | `projects:*`, `allocations:*`, `availability:*` |
| Reference data change | `referenceData:{type}`, plus `members:*` and `projects:*` (labels are denormalised into list views) |
| Org unit change | `orgUnits:*`, `members:*`, `projects:*` |

---

## 2. Shared Components — `frontend/src/shared/`

Built in Unit 1, consumed by both units.

| Component | Props | Responsibility |
|---|---|---|
| `ApiClient` | — | Fetch wrapper: attaches credentials, parses the `violations` envelope, routes 401 to sign-in |
| `SessionProvider` / `useSession()` | `children` | Session context; exposes `user`, `role`, `linkedMemberId`, `signOut()` |
| `RequireRole` | `roles: UserRole[]`, `children` | Renders children only for permitted roles. **Convenience only — never the enforcement point** (US-ENB-01) |
| `DateRangePicker` | `value: DateRange`, `onChange`, `presets?` | Inclusive-range picker with "next month" / "this quarter" presets |
| `PercentageInput` | `value: number`, `onChange`, `min=0.1`, `max=100`, `step=0.1` | One-decimal input; rejects 0 and negatives (BR-A-02) |
| `AllocationBar` | `totalPercentage`, `segments?`, `showOverflow` | Horizontal bar; fill up to 100%, **distinct overflow treatment beyond it** |
| `AllocationSegmentStrip` | `segments: AllocationSegment[]`, `range` | Segments positioned proportionally across the range, over-allocated segments marked |
| `EmptyState` | `message`, `action?` | Explicit empty results, never a blank table (BR-V-08) |
| `ErrorState` | `error`, `onRetry?` | Request failures |
| `FieldErrors` | `violations`, `field` | Renders the violations for one field beside its input (Q12:A) |
| `DataTable` | `columns`, `rows`, `pagination`, `sort` | Paginated table shell |

### `AllocationBar` — the most-seen component in the product

It appears in the member list, the allocation view, availability results, project staffing, and the
over-allocation dialog. Because the success criterion is *speed of comprehension* — a manager answering
"who's available next month?" in under a minute — its visual language must be identical everywhere:

- 0–100%: fill proportional to total
- Exactly 100%: full, visually "complete"
- **Over 100%: distinct overflow treatment, never a bar that simply reads full** — an over-allocated member must not look the same as a fully-booked one at a glance
- Available remainder always legible as a number, not only as a bar

---

## 3. `auth/` — F-01

| Component | State | Endpoints | Stories |
|---|---|---|---|
| `SignInPage` | local: `username`, `password`, `submitting`, `error` | `POST /api/auth/login` | US-ACC-01, US-ACC-03 |
| `SessionGuard` | reads session context | `GET /api/auth/session` | US-ACC-02 |
| `SignOutButton` | — | `POST /api/auth/logout` | US-ACC-02 |

**Interaction flow**
1. Empty field → inline prompt, **no request sent** (BR-AU-06)
2. Rejection → single generic message. The UI must never distinguish unknown-username from wrong-password (BR-AU-04)
3. Inactive account → the account-not-active message (BR-AU-07)
4. Success → redirect by role: Team Member → own assignments; everyone else → allocation view
5. Any 401 mid-session → `SessionGuard` clears context and routes to sign-in with a session-expired notice

---

## 4. `members/` — F-02

| Component | State | Endpoints | Stories |
|---|---|---|---|
| `MemberListPage` | server: `members:{filters}` · local: filter draft | `GET /api/members` | US-MEM-04 |
| `MemberFilterBar` | local draft, applied on submit | `GET /api/reference-data/*`, `GET /api/org-units` | US-MEM-04 |
| `MemberForm` | local field state + `violations` | `POST /api/members`, `PATCH /api/members/:id` | US-MEM-01, US-MEM-02, US-MEM-07 |
| `ContractFieldset` | conditional on `employmentType` | — | US-MEM-02 |
| `SkillTagEditor` | local selection | `GET /api/reference-data/SKILL` | US-MEM-03 |
| `MemberDetailPage` | server: `member:{id}` | `GET /api/members/:id` | US-MEM-01 |
| `DeactivateMemberDialog` | local: confirm | `POST /api/members/:id/deactivate` | US-MEM-05 |

**Form validation**: client-side checks are **convenience only**. Every rule is re-enforced server-side
(Q4:A), and the server's `violations` array is authoritative. On rejection, entered values are retained so
nothing is re-typed (US-MEM-07 criterion).

**`ContractFieldset`** appears only when `employmentType = OFF_ROLL`, and contains vendor name, contract
start, contract end, and contract status. **No rate, contract value, or PO field exists** (BR-M-09).

**`SkillTagEditor`** offers only existing active skills. Typing an unknown skill shows "Not in the skill
list — ask an admin to add it" rather than silently creating it (BR-M-11).

**`DeactivateMemberDialog`** states how many open assignments will be auto-ended before confirming
(BR-M-13), so the cascade is never a surprise.

---

## 5. `projects/` — F-03

| Component | State | Endpoints | Stories |
|---|---|---|---|
| `ProjectListPage` | server: `projects:{filters}` | `GET /api/projects` | US-PRJ-03 |
| `ProjectForm` | local + `violations` | `POST /api/projects`, `PATCH /api/projects/:id` | US-PRJ-01, US-PRJ-05 |
| `ProjectDetailPage` | server: `project:{id}` | `GET /api/projects/:id` | US-PRJ-01 |
| `ProjectStaffingPanel` | server: `staffing:{id}:{asOf}` | `GET /api/projects/:id/staffing` | US-PRJ-04 |
| `CloseProjectDialog` | local: confirm | `POST /api/projects/:id/close` | US-PRJ-02 |

**`ProjectStaffingPanel`** shows current and past assignments in separate groups (BR-P-10). Because Q4:B
permits multiple concurrent assignments to one project, **rows are grouped by member with a subtotal**
(BR-P-11) — otherwise two 30% rows for the same person read as duplicated data rather than as a 60% total.

**`CloseProjectDialog`** implements the two-step confirm: the first call returns assignments extending past
closure, the dialog lists them, and confirmation closes and auto-ends (BR-P-06, BR-P-07).

---

## 6. `assignments/` — F-04

| Component | State | Endpoints | Stories |
|---|---|---|---|
| `AssignmentForm` | local fields + `violations` + `overAllocation` + `conflicts` | `POST /api/assignments`, `PATCH /api/assignments/:id` | US-ASN-01, US-ASN-02, US-ASN-03, US-ASN-06 |
| `OverAllocationDialog` | local: open, pending payload | re-submits with `overrideOverAllocation: true` | US-ASN-05 |
| `AssignmentConflictNotice` | derived from `conflicts` | — | US-ASN-06 |
| `EndAssignmentDialog` | local: effective date | `POST /api/assignments/:id/end` | US-ASN-03 |
| `MemberAllocationSummary` | server: `allocations:member:{id}:{range}` | `GET /api/allocations/current` | US-ASN-02 |

### `OverAllocationDialog` — blocking modal (Q14:A)

Two-step confirm per US-ASN-05. **First submit persists nothing** (BR-A-10).

The modal must state, because each is a separate acceptance criterion:
- the **member**
- the **specific over-allocated sub-period** — not the whole assignment range (BR-A-08)
- the **resulting total percentage**
- the **contributing assignments** with their projects and percentages
- actions: **Proceed anyway** and **Cancel**

```
+--------------------------------------------------------------+
|  Over-allocation warning                                     |
|                                                              |
|  Priya Sharma would be allocated 120.0%                      |
|  for 15 Mar 2026 - 31 Mar 2026                               |
|                                                              |
|  Contributing assignments:                                   |
|    Atlas Migration ................................ 50.0%    |
|    Vendor Portal .................................. 30.0%    |
|    THIS ASSIGNMENT ................................ 40.0%    |
|                                        TOTAL ..... 120.0%    |
|                                                              |
|  [ Cancel ]                            [ Proceed anyway ]    |
+--------------------------------------------------------------+
```

On **Proceed**, the same payload is re-submitted with `overrideOverAllocation: true`; the saved assignment
returns flagged, and the flag persists in every view thereafter (BR-A-12).
On **Cancel**, the dialog closes and no request is sent — nothing was persisted by the first call.

**`AssignmentConflictNotice`** is separate from over-allocation. Contract-window and member-inactive-period
conflicts are **warnings that do not block** (BR-A-13, BR-A-14) and render inline above the submit control,
not as a modal — they inform, they do not gate.

---

## 7. `views/` — F-05

| Component | State | Endpoints | Stories |
|---|---|---|---|
| `AllocationViewPage` | server: `allocations:{asOf}:{filters}` · local: as-of date, filters | `GET /api/allocations/current` | US-VIS-01 |
| `AvailabilitySearchPage` | server: `availability:{range}:{filters}` · local: range, filters | `GET /api/allocations/availability` | US-VIS-02, US-VIS-03 |
| `AvailabilityFilterPanel` | local draft | reference data, org units | US-VIS-03 |
| `AsOfDateControl` | local | — | FR-V-04 |
| `MyAssignmentsPage` | server: `assignments:me` | `GET /api/members/me` | US-VIS-04 |
| `HistoricalAllocationPage` | server: `allocations:asOf:{date}` | `GET /api/allocations/as-of` | US-ASN-07 |

### `AvailabilitySearchPage` — the success-criterion screen

This is the screen the Phase 1 success criterion is measured on. Design consequences:

- **Range presets first**: "Next month" is a single click, because that is the literal question being asked
- **Skill filter prominent**, not behind a disclosure — "find me an available X" is the real query
- Results **most-available first** (BR-V-05)
- Each row shows the member, their **minimum and maximum available capacity** across the range, and an `AllocationSegmentStrip` — because availability varies *within* the range and a single average number would mislead
- **Three visually distinct states** (BR-V-04): available · fully allocated · **over-allocated**. Over-allocated must never be rendered the same as fully allocated.
- Empty results state explicitly which filter excluded everyone (BR-V-08)

`HistoricalAllocationPage` carries a visible notice that it reconstructs records **as they stood on the
chosen date** (BR-A-22), so a user who spots a difference from today's figures understands why rather than
reporting a bug.

`MyAssignmentsPage` separates active from upcoming assignments (BR-V-11) and is the Team Member landing
page.

---

## 8. `admin/` — F-06

| Component | State | Endpoints | Stories |
|---|---|---|---|
| `ReferenceDataPage` | server: `referenceData:{type}` | `GET/POST/PATCH/DELETE /api/reference-data` | US-ADM-01, US-ADM-02 |
| `ReferenceDataTypeTabs` | local: active type | — | US-ADM-01 |
| `RetireReferenceDialog` | local: confirm | `DELETE`, else `PATCH` deactivate | US-ADM-02 |
| `OrgUnitPage` | server: `orgUnits:hierarchy` | `GET/POST/PATCH/DELETE /api/org-units` | US-ADM-03 |
| `OrgUnitTree` | local: expansion | — | US-ADM-03 |
| `OrgUnitForm` | local + `violations` | `POST`, `PATCH` | US-ADM-03 |

**`RetireReferenceDialog`** implements BR-C-06: deletion of a referenced entry is refused with the
reference count, and the dialog then offers **deactivate instead** — turning a dead end into the correct
action.

**`OrgUnitTree`** renders exactly two levels and prevents nesting a team under a team (BR-O-01). Removal of
a referenced unit is refused with what references it (BR-O-05).

**Vocabulary check**: every label in this folder is domain-neutral (BR-C-08). "Role", "Skill", "Project
type", "Department", "Team" — nothing IT-specific.

---

## 9. Route Map

| Path | Component | Roles |
|---|---|---|
| `/signin` | `SignInPage` | unauthenticated |
| `/` | redirect by role | all |
| `/allocations` | `AllocationViewPage` | Admin, RM, Lead, Executive |
| `/availability` | `AvailabilitySearchPage` | Admin, RM, Lead, Executive |
| `/allocations/history` | `HistoricalAllocationPage` | Admin, RM, Lead, Executive |
| `/me` | `MyAssignmentsPage` | Team Member (landing), all |
| `/members`, `/members/:id`, `/members/new` | member pages | Admin, RM, Lead (read) |
| `/projects`, `/projects/:id`, `/projects/new` | project pages | Admin, RM, Lead (read) |
| `/assignments/new`, `/assignments/:id` | assignment pages | Admin, RM |
| `/admin/reference-data`, `/admin/org-units` | admin pages | Admin |

**`RequireRole` hides routes it does not permit. That is convenience, not security** — every endpoint
re-checks server-side (US-ENB-01, BR-R-06). A hidden route reached by typing its URL still returns 403.

---

## 10. `data-testid` Convention

Per the AI-DLC automation-friendly code rules: `{component}-{element-role}`, stable across renders, no
generated or index-based ids.

| Element | `data-testid` |
|---|---|
| Sign-in submit | `signin-form-submit-button` |
| Member form email input | `member-form-email-input` |
| Member list search | `member-list-search-input` |
| Member row (by stable id) | `member-list-row-{memberId}` |
| Assignment percentage input | `assignment-form-percentage-input` |
| Over-allocation proceed | `overallocation-dialog-proceed-button` |
| Over-allocation cancel | `overallocation-dialog-cancel-button` |
| Availability range preset "next month" | `availability-filter-preset-next-month` |
| Availability result row | `availability-list-row-{memberId}` |
| Allocation bar | `allocation-bar-{memberId}` |
| Empty state | `{feature}-empty-state` |
| Field error | `{form}-{field}-error` |

Row test ids use the **entity identifier, never the row index**, so a test does not break when sort order
changes.

---

## 11. Accessibility and Responsiveness

**NFR-U-03**: formal WCAG conformance is not a Phase 1 requirement (Q20:A). Reasonable defaults only:

- Every input has an associated label; field errors are linked to their input via `aria-describedby`
- The over-allocation modal traps focus, is dismissible by Escape, and returns focus to the trigger
- **Over-allocation is never signalled by colour alone** — an icon and text accompany it. This one matters beyond accessibility: red-only signalling disappears in a screenshot pasted into a chat.
- Keyboard operability for all interactive elements

**NFR-U-01**: responsive across desktop, tablet, and phone. Wide tables (allocation view, availability,
staffing) scroll horizontally within their own container; the page body never scrolls horizontally.
The `AllocationSegmentStrip` collapses to a summary min/max figure below tablet width, where proportional
segments become unreadable.

---

## 12. Story Coverage

| Story | Components |
|---|---|
| US-ACC-01, 03 | `SignInPage` |
| US-ACC-02 | `SessionGuard`, `SignOutButton` |
| US-MEM-01, 07 | `MemberForm`, `FieldErrors` |
| US-MEM-02 | `ContractFieldset` |
| US-MEM-03 | `SkillTagEditor` |
| US-MEM-04 | `MemberListPage`, `MemberFilterBar` |
| US-MEM-05 | `DeactivateMemberDialog` |
| US-PRJ-01, 05 | `ProjectForm` |
| US-PRJ-02 | `CloseProjectDialog` |
| US-PRJ-03 | `ProjectListPage` |
| US-PRJ-04 | `ProjectStaffingPanel` |
| US-ASN-01, 02, 03, 06 | `AssignmentForm`, `EndAssignmentDialog`, `AssignmentConflictNotice` |
| US-ASN-05 | `OverAllocationDialog` |
| US-ASN-07 | `HistoricalAllocationPage` |
| US-VIS-01 | `AllocationViewPage` |
| US-VIS-02, 03 | `AvailabilitySearchPage`, `AvailabilityFilterPanel` |
| US-VIS-04 | `MyAssignmentsPage` |
| US-ADM-01, 02 | `ReferenceDataPage`, `RetireReferenceDialog` |
| US-ADM-03 | `OrgUnitPage`, `OrgUnitTree`, `OrgUnitForm` |
| US-ENB-04 | Structural — the frontend consumes only the documented REST API and holds no business rules |

All 30 Unit 1 stories are covered. US-ENB-02 and US-ENB-03 are backend-only properties with no frontend
surface.
