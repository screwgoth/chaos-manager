# Personas — C.H.A.O.S

**Project**: chaos-manager
**Stage**: INCEPTION → User Stories (Part 2)
**Depth**: Lightweight (per story-generation-plan.md Q2:A)
**Date**: 2026-07-25

Three full personas represent the roles that actively drive Phase 1 workflows. Admin and Executive are
documented as thin variants (per Q1:B) — they remain valid story actors but carry less detail because
their Phase 1 interaction surface is narrow.

All persona descriptions use domain-neutral vocabulary per FR-C-01. Where a persona is illustrated
with a team context, that context is an example only — the same persona applies to Sales, Ops, or any
other team type.

---

## Full Personas

### P-01 — Meera Raghavan, Resource/Delivery Manager

- **Goal**: Keep every project adequately staffed without over-committing anyone.
- **Permission scope**: Create and modify projects and assignments within her permitted org scope. Read access to members, projects, and allocations in her org scope. (FR-R-03, FR-R-07)
- **Primary feature areas**: Assignment, Views, Projects, Members

### P-02 — Arun Pillai, Team Lead / Line Manager

- **Goal**: Know what his own team is committed to, and flag when the commitments don't fit.
- **Permission scope**: Read-only access to members, projects, and allocations within his own org unit. May request assignment changes but not apply them directly in Phase 1. (FR-R-04, FR-R-07)
- **Primary feature areas**: Views, Members

### P-03 — Deepa Nair, Team Member

- **Goal**: See what she is assigned to and for how long, without asking anyone.
- **Permission scope**: Read-only access to her own profile and her own assignments. No visibility of other members' allocations. (FR-R-05)
- **Primary feature areas**: Views (own-scope only), Access

---

## Thin Variants

### P-04 — Sanjay Kulkarni, Admin

- **Goal**: Keep the system's configuration and master data correct so everyone else's screens make sense.
- **Permission scope**: Full access — system configuration, all reference data, all member, project, and assignment records, across all org units. (FR-R-02, FR-R-07)
- **Primary feature areas**: Administration, Import, Members

### P-05 — Vikram Shetty, Executive

- **Goal**: See allocation across the whole organization without needing anyone to prepare a report.
- **Permission scope**: Read-only across all org units. No write access of any kind. (FR-R-06, FR-R-07)
- **Primary feature areas**: Views

---

## Persona-to-Story Map

| Story ID | Story | P-01 RDM | P-02 Lead | P-03 Member | P-04 Admin | P-05 Exec |
|---|---|---|---|---|---|---|
| US-ACC-01 | Sign in | ● | ● | ● | ● | ● |
| US-ACC-02 | Sign out and session expiry | ● | ● | ● | ● | ● |
| US-ACC-03 | Failed sign-in feedback | ● | ● | ● | ● | ● |
| US-ACC-04 | Link user account to member record | | | | ● | |
| US-ACC-05 | See only what my role permits | ● | ● | ● | ● | ● |
| US-MEM-01 | Manage member records | ● | | | ● | |
| US-MEM-02 | Record off-roll contract details | ● | | | ● | |
| US-MEM-03 | Tag members with skills | ● | | | ● | |
| US-MEM-04 | Search and filter members | ● | ● | | ● | ● |
| US-MEM-05 | Deactivate a member | ● | | | ● | |
| US-MEM-06 | See contracts expiring soon | ● | ● | | ● | |
| US-MEM-07 | Member data validation feedback | ● | | | ● | |
| US-PRJ-01 | Manage projects | ● | | | ● | |
| US-PRJ-02 | Close a project | ● | | | ● | |
| US-PRJ-03 | Search and filter projects | ● | ● | | ● | ● |
| US-PRJ-04 | View a project's staffing | ● | ● | | ● | ● |
| US-PRJ-05 | Project data validation feedback | ● | | | ● | |
| US-ASN-01 | Assign a member to a project | ● | | | ● | |
| US-ASN-02 | Assign a member to several projects at once | ● | | | ● | |
| US-ASN-03 | Modify or end an assignment | ● | | | ● | |
| US-ASN-04 | Record a member's role on a project | ● | | | ● | |
| US-ASN-05 | Over-allocation warning and override | ● | | | ● | |
| US-ASN-06 | Assignment date validation feedback | ● | | | ● | |
| US-ASN-07 | Query allocation as of a past date | ● | ● | | ● | ● |
| US-VIS-01 | See who is on what right now | ● | ● | | ● | ● |
| US-VIS-02 | Find who is available in a future period | ● | ● | | ● | ● |
| US-VIS-03 | Filter the availability view | ● | ● | | ● | ● |
| US-VIS-04 | See my own assignments | | | ● | | |
| US-VIS-05 | See a member's assignment timeline | ● | ● | | ● | ● |
| US-VIS-06 | See unallocated members | ● | ● | | ● | ● |
| US-VIS-07 | Review over-allocated members | ● | ● | | ● | ● |
| US-IMP-01 | Import members from a spreadsheet | | | | ● | |
| US-IMP-02 | Import projects from a spreadsheet | | | | ● | |
| US-IMP-03 | Import row-level error report | | | | ● | |
| US-IMP-04 | Import duplicate conflict report | | | | ● | |
| US-IMP-05 | Download an import template | | | | ● | |
| US-ADM-01 | Manage reference data | | | | ● | |
| US-ADM-02 | Retire reference data safely | | | | ● | |
| US-ADM-03 | Manage the organizational structure | | | | ● | |
| US-ENB-01 | Org-scope enforced server-side | — | — | — | — | — |
| US-ENB-02 | Passwords stored as hashes | — | — | — | — | — |
| US-ENB-03 | Authentication boundary is replaceable | — | — | — | — | — |
| US-ENB-04 | API boundary independent of the web UI | — | — | — | — | — |

● = persona is an actor in this story  ·  — = technical enabler story with no direct persona actor
