# Unit-to-Story Map — C.H.A.O.S

**Project**: chaos-manager
**Stage**: INCEPTION → Units Generation (Part 2: Generation)
**Date**: 2026-07-25
**Source**: `aidlc-docs/inception/user-stories/stories.md` (approved)

## Summary

| Unit | Stories | Must | Should | Slice 1 |
|---|---|---|---|---|
| `core-domain` | **30** | 29 | 1 | **All 6** |
| `supporting-platform` | **13** | 6 | 7 | 0 |
| **Total** | **43** | **35** | **8** | **6** |

Every story is assigned to exactly one unit. No story is unassigned; none appears twice.

---

## Unit 1 — `core-domain` (30 stories)

### Access & Authentication (3)

| Story | Priority | Slice 1 | Title |
|---|---|---|---|
| US-ACC-01 | Must | ✅ | Sign in |
| US-ACC-02 | Must | | Sign out and session expiry |
| US-ACC-03 | Must | | Failed sign-in feedback |

### Members (6)

| Story | Priority | Slice 1 | Title |
|---|---|---|---|
| US-MEM-01 | Must | ✅ | Manage member records |
| US-MEM-02 | Must | | Record off-roll contract details |
| US-MEM-03 | Must | | Tag members with skills |
| US-MEM-04 | Must | | Search and filter members |
| US-MEM-05 | Must | | Deactivate a member |
| US-MEM-07 | Must | | Member data validation feedback |

### Projects (5)

| Story | Priority | Slice 1 | Title |
|---|---|---|---|
| US-PRJ-01 | Must | ✅ | Manage projects |
| US-PRJ-02 | Must | | Close a project |
| US-PRJ-03 | Must | | Search and filter projects |
| US-PRJ-04 | Must | | View a project's staffing |
| US-PRJ-05 | Must | | Project data validation feedback |

### Assignment & Allocation (6)

| Story | Priority | Slice 1 | Title |
|---|---|---|---|
| US-ASN-01 | Must | ✅ | Assign a member to a project |
| US-ASN-02 | Must | | Assign a member to several projects at once |
| US-ASN-03 | Must | | Modify or end an assignment |
| US-ASN-05 | Must | | Over-allocation warning and override |
| US-ASN-06 | Must | | Assignment date validation feedback |
| US-ASN-07 | Must | | Query allocation as of a past date |

### Views & Availability (4)

| Story | Priority | Slice 1 | Title |
|---|---|---|---|
| US-VIS-01 | Must | ✅ | See who is on what right now |
| US-VIS-02 | Must | | Find who is available in a future period |
| US-VIS-03 | Must | | Filter the availability view |
| US-VIS-04 | Must | | See my own assignments |

### Administration & Configuration (3)

| Story | Priority | Slice 1 | Title |
|---|---|---|---|
| US-ADM-01 | Must | | Manage reference data |
| US-ADM-02 | Must | | Retire reference data safely |
| US-ADM-03 | Must | | Manage the organizational structure |

**Assignment note**: these three moved from Unit 2 to Unit 1 as **Correction 1** in `unit-of-work.md` —
their backend components (C-05, C-06, S-07, S-08) are all in Unit 1, and reference data is a prerequisite
for Members and Projects.

### Technical Enablers (3)

| Story | Priority | Slice 1 | Title |
|---|---|---|---|
| US-ENB-02 | Must | ✅ | Passwords stored as hashes |
| US-ENB-03 | Must | | Authentication boundary is replaceable |
| US-ENB-04 | Should | | API boundary independent of the web UI |

**Assignment note**: US-ENB-03 and US-ENB-04 moved from Unit 2 to Unit 1 as **Correction 2** in
`unit-of-work.md` — both are properties created when Unit 1 is built. Unit 2 must **uphold** them, which
is a Unit 2 Functional Design obligation rather than story ownership.

---

## Unit 2 — `supporting-platform` (13 stories)

### Access Control (3)

| Story | Priority | Title |
|---|---|---|
| US-ACC-05 | Must | See only what my role permits |
| US-ENB-01 | Must | Org-scope enforced server-side |
| US-ACC-04 | Should | Link a user account to a member record |

**Build first within Unit 2** — US-ACC-05 and US-ENB-01 together close the X-1 visibility gap. The
authorization stand-in is deleted on their completion.

### Data Import (5)

| Story | Priority | Title |
|---|---|---|
| US-IMP-01 | Must | Import members from a spreadsheet |
| US-IMP-02 | Must | Import projects from a spreadsheet |
| US-IMP-03 | Must | Import row-level error report |
| US-IMP-04 | Must | Import duplicate conflict report |
| US-IMP-05 | Should | Download an import template |

### Should-Priority Extensions to Unit 1 Screens (5)

| Story | Priority | Title | Extends |
|---|---|---|---|
| US-MEM-06 | Should | See contracts expiring soon | F-02 members |
| US-ASN-04 | Should | Record a member's role on a project | F-04 assignments |
| US-VIS-05 | Should | See a member's assignment timeline | F-05 views |
| US-VIS-06 | Should | See unallocated members | F-05 views |
| US-VIS-07 | Should | Review over-allocated members | F-05 views |

**Note**: these five modify Unit 1 screens rather than adding new ones. That is why Unit 2 is not
independently demonstrable — its completion shows up as behavior change in Unit 1's interface.

---

## Slice 1 Verification

The first end-to-end vertical thread (DA-01, DA-02) — **all six stories in `core-domain`**:

| Story | Why it is in Slice 1 |
|---|---|
| US-ACC-01 | Sign in — nothing is reachable without a session |
| US-ENB-02 | Password hashing — must be right from the first credential stored |
| US-MEM-01 | Create a member |
| US-PRJ-01 | Create a project |
| US-ASN-01 | Assign with percentage and date range — the core domain act |
| US-VIS-01 | View the resulting allocation — closes the thread |

**Confirmed**: Slice 1 does not straddle the unit boundary. The first demonstrable application comes out
of `core-domain` alone, which is what CQ1:A was chosen to achieve.

---

## Wave Sequence Mapped to Units

`stories.md` §9.3 defines 9 waves that interleave the units. Per Q5:A, wave order applies **within** a
unit, not across units.

| Wave | Original intent | Unit | Divergence |
|---|---|---|---|
| 1 | Slice 1 | `core-domain` | None |
| 2 | Reference data, org units | `core-domain` | None |
| 3 | Remaining Members and Projects | `core-domain` | None |
| 4 | Multi-project allocation, over-allocation | `core-domain` | None |
| **5** | **Full RBAC and scope enforcement** | **`supporting-platform`** | **Moves later** — runs after all of `core-domain` rather than mid-way. This is the X-1 consequence. |
| 6 | Availability search and filtering | `core-domain` | Moves **earlier** relative to Wave 5 |
| 7 | Historical and analytical views | `supporting-platform` | US-ASN-07 moved to Unit 1 (it is core allocation history); the Should-priority views stay in Unit 2 |
| 8 | Import | `supporting-platform` | None |
| 9 | Remaining enablers and refinements | Split | US-ENB-03, US-ENB-04 to Unit 1 (Correction 2); the rest to Unit 2 |

**The one material divergence is Wave 5.** Full RBAC now lands after the entire core domain instead of
mid-way through it. Consequence and revisit trigger are documented in `unit-of-work-dependency.md` §3.

---

## Requirement Coverage by Unit

| Requirement group | `core-domain` | `supporting-platform` |
|---|---|---|
| FR-M — Members | FR-M-01 to FR-M-05, FR-M-07 | FR-M-06, FR-M-08 (import) |
| FR-P — Projects | FR-P-01 to FR-P-04, FR-P-06 | FR-P-05 (import) |
| FR-A — Assignment & Allocation | FR-A-01 to FR-A-03, FR-A-05 to FR-A-09 | FR-A-10 |
| FR-V — Views & Availability | FR-V-01 to FR-V-04 | FR-V-05 to FR-V-07 |
| FR-O — Organizational model | FR-O-01 to FR-O-04 | — |
| FR-R — Access control | — | FR-R-01 to FR-R-08 |
| FR-AU — Authentication | FR-AU-01 to FR-AU-04 | FR-AU-05 |
| FR-C — Reference data & agnosticism | FR-C-01 to FR-C-04, FR-C-06 | — |
| FR-I — Data import | — | FR-I-01 to FR-I-04 |

**FR-A-04** (detect and warn on over-allocation) is covered by US-ASN-05 in `core-domain`.
**FR-C-05** (Phase 2 custom-field extension point) has no story — a structural constraint carried to
`core-domain` Functional Design.

**Coverage result**: all 49 Must-priority functional requirements are covered by an assigned story. Of the
9 Should-priority requirements, 8 are covered; FR-C-05 is the documented exception.

---

## Validation

| Check | Result |
|---|---|
| All 43 stories assigned | **Pass** — 30 + 13 = 43 |
| No story assigned twice | **Pass** — verified against the `stories.md` story list |
| No story unassigned | **Pass** — all 8 ID prefixes (ACC, MEM, PRJ, ASN, VIS, IMP, ADM, ENB) fully accounted for |
| Per-unit priority counts reconcile | **Pass** — Must 29 + 6 = 35; Should 1 + 7 = 8 |
| Slice 1 within one unit | **Pass** — all 6 in `core-domain` |
| Every Must-priority FR covered | **Pass** — 49 of 49 |
| Hard ordering constraints preserved | **Pass** — US-ASN-02 before US-ASN-05; every validation story after its happy-path counterpart; authorization first within Unit 2 |
