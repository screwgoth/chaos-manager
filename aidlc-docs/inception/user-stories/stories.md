# User Stories — C.H.A.O.S

**Project**: chaos-manager
**Stage**: INCEPTION → User Stories (Part 2)
**Date**: 2026-07-25
**Input**: `aidlc-docs/inception/requirements/requirements.md` (approved 2026-07-25)
**Personas**: `aidlc-docs/inception/user-stories/personas.md`

## Methodology

Per the approved `story-generation-plan.md`:

- **Breakdown**: Feature-Based — seven feature areas plus technical enablers (Q3:B)
- **Granularity**: Medium — one story per coherent user capability (Q4:B)
- **Format**: Classic "As a [persona], I want [capability], so that [benefit]" (Q5:A)
- **Acceptance criteria**: Given/When/Then for every story without exception (Q6:A)
- **Negative paths**: error handling and validation are separate stories (Q7:B)
- **Traceability**: story IDs plus FR mapping, with a coverage table in Section 10 (Q8:A)
- **Priority**: MoSCoW labels, flagged Slice 1 set, and a suggested build sequence (Q9, Option C)
- **Enablers**: technical enabler stories included for cross-cutting concerns (Q11:B)

**Phase 1 capacity model**: all members are assumed to have 100% capacity. Part-time and
fractional-capacity members are not modeled (AS-01, resolved at Q10:B). Over-allocation warns and
permits an explicit override rather than blocking (AS-02).

---

# 1. Access & Authentication

## US-ACC-01 — Sign in
**Priority**: Must · **Slice 1** · **Satisfies**: FR-AU-01, FR-AU-04

As a **team member**, I want to sign in with my username and password, so that I can reach the
information my role permits.

**Acceptance criteria**

- **Given** I have an active account, **when** I submit my correct username and password, **then** a session is established and I land on the view appropriate to my role.
- **Given** I have an active account, **when** my session is established, **then** my role and org scope are resolved and attached to that session.
- **Given** my account has been deactivated, **when** I submit correct credentials, **then** I am not signed in and I am told my account is not active.

## US-ACC-02 — Sign out and session expiry
**Priority**: Must · **Satisfies**: FR-AU-04

As a **team member**, I want my session to end when I sign out or after a period of inactivity, so
that my access is not left open on a shared machine.

**Acceptance criteria**

- **Given** I am signed in, **when** I choose to sign out, **then** my session is terminated and returning to any application page requires signing in again.
- **Given** I am signed in, **when** my session has been inactive beyond the configured expiry period, **then** my next request is rejected and I am returned to the sign-in page.
- **Given** my session has expired, **when** I sign in again, **then** I resume with a fresh session and no state from the expired one.

## US-ACC-03 — Failed sign-in feedback
**Priority**: Must · **Satisfies**: FR-AU-01

As a **team member**, I want clear feedback when sign-in fails, so that I know whether to retry or ask
for help.

**Acceptance criteria**

- **Given** I submit an incorrect password, **when** the attempt is rejected, **then** I am told the credentials are invalid without being told which of the two was wrong.
- **Given** I submit a username that does not exist, **when** the attempt is rejected, **then** I receive the same message as an incorrect password, so that valid usernames cannot be discovered by trial.
- **Given** I leave the username or password empty, **when** I submit, **then** I am prompted to complete the missing field before any authentication attempt is made.

## US-ACC-04 — Link a user account to a member record
**Priority**: Should · **Satisfies**: FR-AU-05

As an **admin**, I want to link a user account to a member record where the same person is both, so
that a member can see their own assignments — while members without logins remain trackable.

**Acceptance criteria**

- **Given** a member record and a user account exist for the same person, **when** I link them, **then** that user's own-scope views resolve to that member record.
- **Given** a member record has no linked user account, **when** I view that member, **then** the record is complete and usable and no login is implied.
- **Given** a user account is already linked to a member, **when** I attempt to link it to a second member, **then** the action is rejected and the existing link is named.

## US-ACC-05 — See only what my role permits
**Priority**: Must · **Satisfies**: FR-R-01, FR-R-02, FR-R-03, FR-R-04, FR-R-05, FR-R-06, FR-R-07

As a **team member**, I want the application to show me only the data and actions my role permits, so
that I am not exposed to information outside my remit.

**Acceptance criteria**

- **Given** I am a Team Member, **when** I use the application, **then** I see only my own profile and my own assignments, and no other member's allocation.
- **Given** I am a Team Lead, **when** I use the application, **then** I see members, projects, and allocations within my own org unit only, and I have no controls to modify assignments directly.
- **Given** I am a Resource/Delivery Manager, **when** I use the application, **then** I can create and modify projects and assignments within my permitted org scope, and I cannot modify records outside it.
- **Given** I am an Executive, **when** I use the application, **then** I can read data across all org units and I am offered no write action anywhere.
- **Given** I am an Admin, **when** I use the application, **then** I can read and modify all records and all reference data across all org units.

---

# 2. Members

## US-MEM-01 — Manage member records
**Priority**: Must · **Slice 1** · **Satisfies**: FR-M-01, FR-M-02, FR-M-04

As a **resource manager**, I want to create and update member records, so that the system holds an
accurate roster of the people I can assign.

**Acceptance criteria**

- **Given** I am creating a member, **when** I supply identity, contact, org unit, employment type, and role, **then** the member is created and appears in the directory.
- **Given** a member exists, **when** I update any of their attributes, **then** the change is saved and reflected immediately in the directory and in any view listing that member.
- **Given** I am creating a member, **when** I set employment type to on-roll or off-roll, **then** the same record type is used for both and the employment type is stored as an attribute of that record.
- **Given** a member exists, **when** I open their record, **then** I see their attributes together with their current assignments.

## US-MEM-02 — Record off-roll contract details
**Priority**: Must · **Satisfies**: FR-M-03

As a **resource manager**, I want to record vendor and contract dates for off-roll members, so that I
know when their engagement ends.

**Acceptance criteria**

- **Given** I set a member's employment type to off-roll, **when** I complete the record, **then** vendor name, contract start date, contract end date, and contract status are required.
- **Given** a member's employment type is on-roll, **when** I complete the record, **then** the contract fields are not requested.
- **Given** I am recording contract details, **when** I review the available fields, **then** no rate, contract value, or purchase-order field is present, because commercial data is out of Phase 1 scope.
- **Given** an off-roll member's employment type is changed to on-roll, **when** I save, **then** the contract details are retained as history rather than discarded.

## US-MEM-03 — Tag members with skills
**Priority**: Must · **Satisfies**: FR-M-05

As a **resource manager**, I want to tag members with skills, so that I can later find people by
capability rather than by memory.

**Acceptance criteria**

- **Given** skills exist as reference data, **when** I edit a member, **then** I can attach zero or more skills drawn from that reference data.
- **Given** I am tagging a member, **when** I try to enter a skill that is not in the reference data, **then** it is not accepted as free text and I am directed to have it added as reference data first.
- **Given** a member has skills attached, **when** I remove a skill, **then** the member's other skills and assignments are unaffected.

## US-MEM-04 — Search and filter members
**Priority**: Must · **Satisfies**: FR-M-06

As a **team lead**, I want to search and filter the member directory, so that I can find a specific
person or a group of people quickly.

**Acceptance criteria**

- **Given** members exist, **when** I search by name, **then** matching members within my permitted org scope are listed.
- **Given** members exist, **when** I filter by org unit, employment type, role, or skill, **then** only members matching all applied filters are listed.
- **Given** I apply filters that match nothing, **when** the results return, **then** I am shown an explicit empty result rather than an unexplained blank list.
- **Given** I am a Team Lead, **when** I search, **then** results never include members outside my org unit regardless of the search term.

## US-MEM-05 — Deactivate a member
**Priority**: Must · **Satisfies**: FR-M-04

As a **resource manager**, I want to deactivate a member who has left, so that they stop appearing as
assignable while their history is preserved.

**Acceptance criteria**

- **Given** a member has past assignments, **when** I deactivate them, **then** those assignments remain queryable in historical views.
- **Given** a member is deactivated, **when** I create a new assignment, **then** that member is not offered as an assignable option.
- **Given** a member is deactivated, **when** I view an allocation report covering a period when they were active, **then** they still appear for that period.

## US-MEM-06 — See contracts expiring soon
**Priority**: Should · **Satisfies**: FR-M-07

As a **resource manager**, I want off-roll members whose contracts end soon to be flagged, so that I
can arrange extension or replacement before work is disrupted.

**Acceptance criteria**

- **Given** an off-roll member's contract end date falls within the configured near-term window, **when** I view the member directory, **then** that member is visibly flagged.
- **Given** the near-term window is configurable, **when** an admin changes it, **then** the set of flagged members updates accordingly without a code change.
- **Given** an off-roll member's contract has already ended, **when** I view the directory, **then** they are distinguished from those merely expiring soon.

## US-MEM-07 — Member data validation feedback
**Priority**: Must · **Satisfies**: FR-M-01, FR-M-03

As a **resource manager**, I want to be told precisely what is wrong when a member record cannot be
saved, so that I can correct it without guessing.

**Acceptance criteria**

- **Given** I omit a required field, **when** I attempt to save, **then** the record is not saved and each missing field is individually identified.
- **Given** I enter an off-roll member whose contract end date precedes the start date, **when** I attempt to save, **then** the record is rejected and the date conflict is named explicitly.
- **Given** I enter a member whose natural key duplicates an existing member, **when** I attempt to save, **then** the record is rejected and the conflicting existing member is identified.
- **Given** a save has been rejected, **when** I return to the form, **then** my entered values are retained so I need not re-enter them.

---

# 3. Projects

## US-PRJ-01 — Manage projects
**Priority**: Must · **Slice 1** · **Satisfies**: FR-P-01, FR-P-02, FR-P-03

As a **resource manager**, I want to create and update projects, so that there is somewhere to assign
people to.

**Acceptance criteria**

- **Given** I am creating a project, **when** I supply name, code, owning org unit, project type, start date, planned end date, and status, **then** the project is created and appears in the project registry.
- **Given** project types exist as reference data, **when** I select a project type, **then** the options come from that reference data and not from a fixed list built into the application.
- **Given** a project exists, **when** I update its attributes, **then** the change is saved and reflected in the registry and in any view listing that project.

## US-PRJ-02 — Close a project
**Priority**: Must · **Satisfies**: FR-P-03

As a **resource manager**, I want to close a completed project, so that it stops appearing as an
active assignment target while its staffing history is preserved.

**Acceptance criteria**

- **Given** a project has assignments, **when** I close it, **then** those assignments remain queryable in historical views.
- **Given** a project is closed, **when** I create a new assignment, **then** that project is not offered as an assignment target.
- **Given** a project is closed while assignments are still open-ended, **when** I close it, **then** I am told which assignments remain open and asked to confirm.

## US-PRJ-03 — Search and filter projects
**Priority**: Must · **Satisfies**: FR-P-04

As a **team lead**, I want to search and filter projects, so that I can locate a project without
scrolling the whole registry.

**Acceptance criteria**

- **Given** projects exist, **when** I search by name or code, **then** matching projects within my permitted org scope are listed.
- **Given** projects exist, **when** I filter by org unit, project type, or status, **then** only projects matching all applied filters are listed.
- **Given** my filters match nothing, **when** results return, **then** I am shown an explicit empty result.

## US-PRJ-04 — View a project's staffing
**Priority**: Must · **Satisfies**: FR-P-06

As a **resource manager**, I want to see who is currently assigned to a project and at what
allocation, so that I can judge whether it is adequately staffed.

**Acceptance criteria**

- **Given** a project has assigned members, **when** I open the project, **then** I see each member with their allocation percentage and assignment date range.
- **Given** a project has assignments that have already ended, **when** I open the project, **then** current assignments are distinguished from past ones.
- **Given** a project has no assignments, **when** I open it, **then** I am shown explicitly that it is unstaffed.

## US-PRJ-05 — Project data validation feedback
**Priority**: Must · **Satisfies**: FR-P-01

As a **resource manager**, I want clear feedback when a project cannot be saved, so that I can
correct it directly.

**Acceptance criteria**

- **Given** I omit a required field, **when** I attempt to save, **then** the project is not saved and each missing field is individually identified.
- **Given** I enter a planned end date preceding the start date, **when** I attempt to save, **then** the project is rejected and the date conflict is named.
- **Given** I enter a project code that already exists, **when** I attempt to save, **then** the project is rejected and the conflicting project is identified.

---

# 4. Assignment & Allocation

## US-ASN-01 — Assign a member to a project
**Priority**: Must · **Slice 1** · **Satisfies**: FR-A-01

As a **resource manager**, I want to assign a member to a project with an allocation percentage and a
date range, so that the commitment is recorded rather than remembered.

**Acceptance criteria**

- **Given** an active member and an open project exist, **when** I assign the member with an allocation percentage, a start date, and an end date, **then** the assignment is created and visible from both the member and the project.
- **Given** I am creating an assignment, **when** I set the allocation percentage, **then** the value is expressed as a percentage of the member's capacity.
- **Given** an assignment has been created, **when** I view the member, **then** the assignment appears with its project, percentage, and date range.

## US-ASN-02 — Assign a member to several projects at once
**Priority**: Must · **Satisfies**: FR-A-02, FR-A-03

As a **resource manager**, I want to assign one member to multiple concurrent projects with a split
allocation, so that shared people are represented accurately.

**Acceptance criteria**

- **Given** a member already has an assignment, **when** I add a second assignment with an overlapping date range, **then** both assignments are retained and neither replaces the other.
- **Given** a member has several assignments with overlapping date ranges, **when** I view their total allocation for a date, **then** it equals the sum of the allocation percentages of all assignments covering that date.
- **Given** a member has assignments whose date ranges do not overlap, **when** I view their total allocation for a date covered by only one, **then** only that assignment's percentage is counted.
- **Given** a member's assignments sum to less than 100% for a period, **when** I view them, **then** the unallocated remainder is shown.

## US-ASN-03 — Modify or end an assignment
**Priority**: Must · **Satisfies**: FR-A-07

As a **resource manager**, I want to change an assignment's percentage or dates and end it early, so
that the record keeps pace with reality.

**Acceptance criteria**

- **Given** an assignment exists, **when** I change its allocation percentage, **then** the change is saved and the member's total allocation is recomputed for the affected period.
- **Given** an assignment exists, **when** I change its start or end date, **then** the change is saved and allocation totals are recomputed across both the old and the new date range.
- **Given** an active assignment exists, **when** I end it early by setting its end date to a past or present date, **then** the member's allocation is freed from that date onward and the elapsed portion remains in history.

## US-ASN-04 — Record a member's role on a project
**Priority**: Should · **Satisfies**: FR-A-10

As a **resource manager**, I want to record what role a member holds on a specific project, so that
project staffing shows composition and not just headcount.

**Acceptance criteria**

- **Given** roles exist as reference data, **when** I create or edit an assignment, **then** I may optionally select a project role from that reference data.
- **Given** an assignment has no project role, **when** I save it, **then** the assignment is valid and complete.
- **Given** an assignment has a project role, **when** I view the project's staffing, **then** the role is shown alongside the member and allocation.

## US-ASN-05 — Over-allocation warning and override
**Priority**: Must · **Satisfies**: FR-A-04, FR-A-05, FR-A-06

As a **resource manager**, I want to be warned before I commit a member beyond 100%, and to be able
to proceed deliberately when the situation warrants it, so that over-allocation is a visible decision
rather than an accident.

**Acceptance criteria**

- **Given** a member's existing assignments total 80% for a period, **when** I attempt to add a 40% assignment overlapping that period, **then** I am warned that the member would reach 120% before the assignment is saved.
- **Given** I am shown an over-allocation warning, **when** I review it, **then** it states the member, the affected period, and the resulting total percentage.
- **Given** I am shown an over-allocation warning, **when** I choose to proceed, **then** the assignment is saved and the over-allocation is recorded as an explicit override.
- **Given** I am shown an over-allocation warning, **when** I choose to cancel, **then** no assignment is created and no change is persisted.
- **Given** an override has been saved, **when** the member appears in any allocation or availability view, **then** their over-allocation remains visibly flagged and is not silently accepted.
- **Given** a member is over-allocated for only part of an assignment's date range, **when** I am warned, **then** the warning identifies the specific sub-period that exceeds 100%.

## US-ASN-06 — Assignment date validation feedback
**Priority**: Must · **Satisfies**: FR-A-01, FR-A-09

As a **resource manager**, I want to be told when an assignment's dates conflict with the member's or
project's own dates, so that I do not create commitments that cannot be honoured.

**Acceptance criteria**

- **Given** I enter an assignment end date preceding its start date, **when** I attempt to save, **then** the assignment is rejected and the date conflict is named.
- **Given** I assign an off-roll member beyond their contract end date, **when** I attempt to save, **then** I am warned that the assignment extends past the contract window, with the contract end date stated.
- **Given** I assign a member to a period outside the member's active period, **when** I attempt to save, **then** I am warned of the conflict before the assignment is saved.
- **Given** I enter an allocation percentage of zero or a negative value, **when** I attempt to save, **then** the assignment is rejected and a valid range is stated.

## US-ASN-07 — Query allocation as of a past date
**Priority**: Must · **Satisfies**: FR-A-08

As a **team lead**, I want to see what the allocation picture was on a past date, so that I can answer
questions about what happened without keeping my own records.

**Acceptance criteria**

- **Given** assignments have started and ended over time, **when** I query allocation as of a past date, **then** I see the assignments that were in effect on that date and not those active today.
- **Given** an assignment was ended early, **when** I query a date before it was ended, **then** it appears as it stood on that date.
- **Given** a member has been deactivated, **when** I query a date when they were active, **then** their assignments for that date are included.

---

# 5. Views & Availability

## US-VIS-01 — See who is on what right now
**Priority**: Must · **Slice 1** · **Satisfies**: FR-V-01, FR-V-04

As a **resource manager**, I want a single view of who is on which project at what percentage today,
so that I can see the current state of my team at a glance.

**Acceptance criteria**

- **Given** members have active assignments, **when** I open the allocation view, **then** each member is listed with their projects and allocation percentages as of today.
- **Given** I change the as-of date, **when** the view refreshes, **then** it shows the allocation state for that date.
- **Given** a member has multiple concurrent assignments, **when** I view them, **then** all their assignments and their total allocation are shown together.
- **Given** I am a Team Lead, **when** I open this view, **then** it contains only members within my own org unit.

## US-VIS-02 — Find who is available in a future period
**Priority**: Must · **Satisfies**: FR-V-02, FR-V-04

As a **resource manager**, I want to see which members have unallocated capacity in a period I choose,
so that I can answer "who is available next month?" in under a minute.

**Acceptance criteria**

- **Given** I specify a future date range, **when** I open the availability view, **then** I see each member with their unallocated capacity percentage for that range.
- **Given** a member's assignment ends part-way through the specified range, **when** I view their availability, **then** their availability reflects the portion of the range in which they are free.
- **Given** a member is fully allocated across the entire range, **when** I view availability, **then** they are shown as unavailable rather than omitted without explanation.
- **Given** a member is over-allocated in the range, **when** I view availability, **then** they are flagged as over-allocated rather than shown as merely unavailable.
- **Given** I specify a range, **when** results return, **then** members are ordered so that those with the most available capacity are easiest to find.

## US-VIS-03 — Filter the availability view
**Priority**: Must · **Satisfies**: FR-V-03

As a **resource manager**, I want to filter availability by org unit, employment type, role, and
skill, so that I can find an available person with the specific capability I need.

**Acceptance criteria**

- **Given** I am viewing availability for a period, **when** I filter by skill, **then** only members holding that skill are listed with their availability.
- **Given** I apply several filters at once, **when** results return, **then** only members matching all filters are listed.
- **Given** I filter by a skill nobody available holds, **when** results return, **then** I am shown an explicit empty result rather than an unexplained blank list.
- **Given** I am a Team Lead, **when** I filter, **then** results remain confined to my own org unit regardless of filter combination.

## US-VIS-04 — See my own assignments
**Priority**: Must · **Satisfies**: FR-R-05, FR-V-05

As a **team member**, I want to see my own profile and my current and upcoming assignments, so that I
know what I am committed to without asking my manager.

**Acceptance criteria**

- **Given** I am signed in as a Team Member with a linked member record, **when** I open my view, **then** I see my own profile and my own assignments with projects, percentages, and date ranges.
- **Given** I have upcoming assignments that have not yet started, **when** I open my view, **then** they are shown and distinguished from active ones.
- **Given** I am a Team Member, **when** I use the application, **then** no other member's assignments are reachable to me by any route.

## US-VIS-05 — See a member's assignment timeline
**Priority**: Should · **Satisfies**: FR-V-05

As a **team lead**, I want to see one member's assignments laid out across a period, so that I can
understand how their commitments overlap over time.

**Acceptance criteria**

- **Given** a member has several assignments over time, **when** I open their timeline for a selected period, **then** each assignment is shown positioned across that period.
- **Given** a member's assignments overlap, **when** I view the timeline, **then** the overlap and the resulting total allocation for the overlapping sub-period are visible.
- **Given** a member has periods with no assignment, **when** I view the timeline, **then** those gaps are visible as unallocated time.

## US-VIS-06 — See unallocated members
**Priority**: Should · **Satisfies**: FR-V-06

As a **resource manager**, I want to see which members have no allocation in a selected period, so
that I can find idle capacity before it is wasted.

**Acceptance criteria**

- **Given** I select a period, **when** I open the unallocated view, **then** members with no assignment covering any part of that period are listed.
- **Given** a member is partially allocated in the period, **when** I open the unallocated view, **then** they are excluded from it and remain visible in the availability view with their remaining capacity.
- **Given** no member is fully unallocated in the period, **when** results return, **then** I am shown an explicit empty result.

## US-VIS-07 — Review over-allocated members
**Priority**: Should · **Satisfies**: FR-V-07

As a **resource manager**, I want a list of members exceeding 100% allocation in a selected period, so
that I can rebalance before commitments are missed.

**Acceptance criteria**

- **Given** members are over-allocated in the selected period, **when** I open the over-allocation view, **then** each is listed with their total percentage and the contributing assignments.
- **Given** an over-allocation arose from an explicit override, **when** I view the list, **then** it is included and identified as an override rather than hidden.
- **Given** a member is over-allocated for only part of the period, **when** I view the list, **then** the specific over-allocated sub-period is shown.
- **Given** nobody is over-allocated in the period, **when** results return, **then** I am shown an explicit empty result.

---

# 6. Data Import

## US-IMP-01 — Import members from a spreadsheet
**Priority**: Must · **Satisfies**: FR-I-01, FR-M-08

As an **admin**, I want to load members from a CSV or Excel file, so that I can populate the system
without entering two hundred people by hand.

**Acceptance criteria**

- **Given** I have a file matching the expected member columns, **when** I upload it, **then** each valid row creates a member and I am told how many were created.
- **Given** my file mixes on-roll and off-roll members, **when** I upload it, **then** employment type is honoured per row and off-roll contract fields are applied where present.
- **Given** my file references skills, roles, or org units, **when** I upload it, **then** values are matched against existing reference data and unmatched values are reported rather than silently created.

## US-IMP-02 — Import projects from a spreadsheet
**Priority**: Must · **Satisfies**: FR-I-01, FR-P-05

As an **admin**, I want to load projects from a CSV or Excel file, so that the project registry can be
populated in one step.

**Acceptance criteria**

- **Given** I have a file matching the expected project columns, **when** I upload it, **then** each valid row creates a project and I am told how many were created.
- **Given** my file references project types or org units, **when** I upload it, **then** values are matched against existing reference data and unmatched values are reported.
- **Given** my file contains no valid rows, **when** I upload it, **then** no projects are created and I am told the import produced nothing.

## US-IMP-03 — Import row-level error report
**Priority**: Must · **Satisfies**: FR-I-02

As an **admin**, I want invalid rows reported individually while valid rows are still imported, so
that one bad row does not force me to restart the whole import.

**Acceptance criteria**

- **Given** my file contains a mix of valid and invalid rows, **when** I upload it, **then** the valid rows are imported and the invalid rows are not, in a single operation.
- **Given** rows failed, **when** the import completes, **then** I receive a report identifying each failed row by its position in the file together with the reason it failed.
- **Given** a row failed for several reasons, **when** I read the report, **then** all reasons for that row are listed rather than only the first.
- **Given** rows failed, **when** I correct them and re-upload only those rows, **then** they import without duplicating the rows that succeeded the first time.

## US-IMP-04 — Import duplicate conflict report
**Priority**: Must · **Satisfies**: FR-I-04

As an **admin**, I want rows that duplicate existing records reported as conflicts rather than
imported, so that a re-run of an import does not create a second copy of everyone.

**Acceptance criteria**

- **Given** a row's natural key matches an existing member or project, **when** I upload it, **then** no duplicate record is created and the row is reported as a conflict naming the existing record.
- **Given** my file contains two rows sharing the same natural key, **when** I upload it, **then** at most one record is created and the other row is reported as a conflict.
- **Given** I re-upload a file I have already imported successfully, **when** it completes, **then** no new records are created and every row is reported as a conflict.

## US-IMP-05 — Download an import template
**Priority**: Should · **Satisfies**: FR-I-03

As an **admin**, I want a downloadable template describing the expected columns, so that I can prepare
a file that imports cleanly the first time.

**Acceptance criteria**

- **Given** I am preparing an import, **when** I download the template, **then** it contains every expected column with its name and whether it is required.
- **Given** I have downloaded the template, **when** I populate and upload it unmodified in structure, **then** the column mapping is recognised without further configuration.

---

# 7. Administration & Configuration

## US-ADM-01 — Manage reference data
**Priority**: Must · **Satisfies**: FR-C-01, FR-C-02, FR-C-03, FR-C-06

As an **admin**, I want to manage roles, skills, project types, and org units myself, so that the
application fits my team's vocabulary without a code change.

**Acceptance criteria**

- **Given** I am managing reference data, **when** I add a new role, skill, project type, or org unit, **then** it becomes immediately selectable wherever that reference data is used, with no redeployment.
- **Given** a reference data entry exists, **when** I rename it, **then** every record referencing it reflects the new name.
- **Given** a team with a different vocabulary adopts the system, **when** an admin configures reference data for it, **then** the application presents that team's own roles, skills, and project types with no terminology from another team remaining.
- **Given** I review any screen, label, or field name, **when** I read it, **then** it contains no vocabulary specific to one kind of team.

## US-ADM-02 — Retire reference data safely
**Priority**: Must · **Satisfies**: FR-C-04

As an **admin**, I want to retire a reference data entry that is no longer used without breaking
existing records, so that cleaning up configuration is safe.

**Acceptance criteria**

- **Given** a reference data entry is referenced by existing records, **when** I deactivate it, **then** it stops being offered for new records while existing references remain intact and readable.
- **Given** a reference data entry is referenced by existing records, **when** I attempt to delete it outright, **then** the deletion is refused and I am told how many records reference it.
- **Given** a reference data entry has been deactivated, **when** I reactivate it, **then** it becomes selectable again.

## US-ADM-03 — Manage the organizational structure
**Priority**: Must · **Satisfies**: FR-O-01, FR-O-02, FR-O-03, FR-O-04

As an **admin**, I want to define departments and the teams within them, so that members, projects,
and visibility scopes can be organized correctly.

**Acceptance criteria**

- **Given** I am managing the organization, **when** I create a department and a team within it, **then** a two-level structure is recorded and both become available as org units.
- **Given** org units exist, **when** I create a member or a project, **then** exactly one org unit must be assigned to it.
- **Given** a member belongs to one org unit, **when** a resource manager assigns them to a project owned by a different org unit, **then** the assignment is permitted and both org units are visible on it.
- **Given** an org unit has members or projects, **when** I attempt to remove it, **then** the removal is refused and I am told what still references it.

---

# 8. Technical Enabler Stories

Per Q11:B, these cross-cutting concerns are recorded as stories because they must be verifiable, even
though they have no single persona actor.

## US-ENB-01 — Org-scope enforced server-side
**Priority**: Must · **Satisfies**: FR-R-08, FR-R-07

As the **system**, I must enforce role and org-scope restrictions on every data access path on the
server, so that access control cannot be bypassed by manipulating the client.

**Acceptance criteria**

- **Given** a Team Lead's session, **when** a request is made directly to the API for a member outside their org unit, **then** the request is refused regardless of what the web interface would have shown.
- **Given** an Executive's session, **when** a write request is made directly to the API, **then** it is refused because the role holds no write permission.
- **Given** a Team Member's session, **when** a request is made for another member's assignments, **then** it is refused.
- **Given** any authorization decision, **when** it is made, **then** it is evaluated on the server from the session's role and scope rather than from any value supplied by the client.

## US-ENB-02 — Passwords stored as hashes
**Priority**: Must · **Slice 1** · **Satisfies**: FR-AU-02

As the **system**, I must store passwords only as salted hashes, so that a compromise of the data
store does not expose usable credentials.

**Acceptance criteria**

- **Given** a user account is created or its password changed, **when** the credential is persisted, **then** only a salted hash produced by a current password-hashing algorithm is stored.
- **Given** the data store is inspected directly, **when** any user record is read, **then** no plaintext or reversibly-encrypted password is present.
- **Given** two users choose the same password, **when** both are stored, **then** their stored hashes differ.

## US-ENB-03 — Authentication boundary is replaceable
**Priority**: Must · **Satisfies**: FR-AU-03

As the **system**, I must isolate authentication behind a replaceable boundary, so that SSO can be
added in a later phase without redesigning session handling or user identity.

**Acceptance criteria**

- **Given** the application authenticates users locally, **when** the authentication mechanism is examined, **then** credential verification is separated from session establishment and from user identity resolution.
- **Given** a future SSO provider is introduced, **when** it replaces local credential verification, **then** session handling, role resolution, and the user-to-member link require no redesign.
- **Given** authorization decisions are made, **when** they are examined, **then** they depend on the resolved user identity and role rather than on how the user authenticated.

## US-ENB-04 — API boundary independent of the web UI
**Priority**: Should · **Satisfies**: NFR-U-02, NFR-IN-03

As the **system**, I must expose application capability through an interface that does not assume the
web client, so that a later mobile application or integration can consume it without core redesign.

**Acceptance criteria**

- **Given** any capability available in the web interface, **when** it is examined, **then** the underlying operation is reachable through the API independently of the web client.
- **Given** business rules such as allocation summation and over-allocation detection, **when** they are examined, **then** they are enforced server-side and not implemented only in the browser.
- **Given** the API is consumed by a non-browser client, **when** requests are made, **then** authentication and authorization apply identically.

---

# 9. Priority, Slice 1, and Build Sequence

## 9.1 Slice 1 — the first end-to-end vertical thread

Satisfies DA-01 and DA-02. This set is the minimum working thread through React UI → API → database,
independently demonstrable on its own:

| Story | Why it is in Slice 1 |
|---|---|
| US-ACC-01 | Sign in — nothing is reachable without a session |
| US-ENB-02 | Password hashing — must be right from the first credential stored, not retrofitted |
| US-MEM-01 | Create a member — the first half of DA-02 |
| US-PRJ-01 | Create a project — the second half of DA-02 |
| US-ASN-01 | Assign the member to the project with a percentage and date range — the core domain act |
| US-VIS-01 | View the resulting allocation — closes the thread and proves the data round-trips |

Slice 1 deliberately excludes over-allocation detection, availability search, import, RBAC beyond
basic session role resolution, and all validation stories. Those broaden the slice rather than form it.

## 9.2 MoSCoW summary

| Priority | Count | Stories |
|---|---|---|
| **Must** | 35 | US-ACC-01, 02, 03, 05 · US-MEM-01, 02, 03, 04, 05, 07 · US-PRJ-01, 02, 03, 04, 05 · US-ASN-01, 02, 03, 05, 06, 07 · US-VIS-01, 02, 03, 04 · US-IMP-01, 02, 03, 04 · US-ADM-01, 02, 03 · US-ENB-01, 02, 03 |
| **Should** | 8 | US-ACC-04 · US-MEM-06 · US-ASN-04 · US-VIS-05, 06, 07 · US-IMP-05 · US-ENB-04 |
| **Could** | 0 | — |

**Total**: 43 stories. No Could-priority stories exist, because Phase 1 scope was already narrowed
during Requirements Analysis — everything discretionary was deferred to a later phase rather than
carried as a low priority here.

## 9.3 Suggested build sequence

Ordering matters because Q7:B separates error-handling stories from their happy-path counterparts;
those stories are not buildable before the capability they validate exists.

| Wave | Stories | Rationale |
|---|---|---|
| **1** | Slice 1 (see 9.1) | Proves the end-to-end thread |
| **2** | US-ADM-03, US-ADM-01, US-ADM-02 | Reference data and org units underpin nearly every later story; building them after Members forces rework of fixed lists |
| **3** | US-MEM-02, US-MEM-03, US-MEM-05, US-MEM-07, US-PRJ-02, US-PRJ-05 | Completes the Members and Projects areas including their validation stories |
| **4** | US-ASN-02, US-ASN-03, US-ASN-05, US-ASN-06 | Multi-project allocation, then over-allocation detection and override — depends on summation from US-ASN-02 |
| **5** | US-ACC-05, US-ENB-01, US-ACC-02, US-ACC-03 | Full RBAC and server-side scope enforcement, once there is data worth scoping |
| **6** | US-VIS-02, US-VIS-03, US-MEM-04, US-PRJ-03, US-VIS-04 | Availability search and filtering — delivers the Phase 1 success criterion |
| **7** | US-ASN-07, US-VIS-05, US-VIS-06, US-VIS-07 | Historical and analytical views built on the now-complete allocation model |
| **8** | US-IMP-05, US-IMP-01, US-IMP-02, US-IMP-03, US-IMP-04 | Import last — it depends on every entity and every validation rule already being settled |
| **9** | US-ENB-03, US-ENB-04, US-ACC-04, US-MEM-06, US-ASN-04 | Remaining enablers and Should-priority refinements |

**Note on Wave 5**: RBAC arrives deliberately late. Slice 1 establishes sessions and basic role
resolution, but full org-scope enforcement is built once there is multi-org data to enforce against.
If Phase 1 is exposed to real users before Wave 5 completes, org-scope restrictions are not yet
enforced — that is a consequence of this sequence and should be a deliberate decision, not a surprise.

---

# 10. Requirement Coverage

Every **Must**-priority functional requirement maps to at least one story.

| FR ID | Priority | Covered by |
|---|---|---|
| FR-M-01 | Must | US-MEM-01, US-MEM-07 |
| FR-M-02 | Must | US-MEM-01 |
| FR-M-03 | Must | US-MEM-02, US-MEM-07 |
| FR-M-04 | Must | US-MEM-01, US-MEM-05 |
| FR-M-05 | Must | US-MEM-03 |
| FR-M-06 | Must | US-MEM-04 |
| FR-M-07 | Should | US-MEM-06 |
| FR-M-08 | Must | US-IMP-01 |
| FR-P-01 | Must | US-PRJ-01, US-PRJ-05 |
| FR-P-02 | Must | US-PRJ-01 |
| FR-P-03 | Must | US-PRJ-01, US-PRJ-02 |
| FR-P-04 | Must | US-PRJ-03 |
| FR-P-05 | Must | US-IMP-02 |
| FR-P-06 | Must | US-PRJ-04 |
| FR-A-01 | Must | US-ASN-01, US-ASN-06 |
| FR-A-02 | Must | US-ASN-02 |
| FR-A-03 | Must | US-ASN-02 |
| FR-A-04 | Must | US-ASN-05 |
| FR-A-05 | Must | US-ASN-05 |
| FR-A-06 | Must | US-ASN-05 |
| FR-A-07 | Must | US-ASN-03 |
| FR-A-08 | Must | US-ASN-07 |
| FR-A-09 | Should | US-ASN-06 |
| FR-A-10 | Should | US-ASN-04 |
| FR-V-01 | Must | US-VIS-01 |
| FR-V-02 | Must | US-VIS-02 |
| FR-V-03 | Must | US-VIS-03 |
| FR-V-04 | Must | US-VIS-01, US-VIS-02 |
| FR-V-05 | Should | US-VIS-04, US-VIS-05 |
| FR-V-06 | Should | US-VIS-06 |
| FR-V-07 | Should | US-VIS-07 |
| FR-O-01 | Must | US-ADM-03 |
| FR-O-02 | Must | US-ADM-03 |
| FR-O-03 | Must | US-ADM-03 |
| FR-O-04 | Must | US-ADM-03 |
| FR-R-01 | Must | US-ACC-05 |
| FR-R-02 | Must | US-ACC-05 |
| FR-R-03 | Must | US-ACC-05 |
| FR-R-04 | Must | US-ACC-05 |
| FR-R-05 | Must | US-ACC-05, US-VIS-04 |
| FR-R-06 | Must | US-ACC-05 |
| FR-R-07 | Must | US-ACC-05, US-ENB-01 |
| FR-R-08 | Must | US-ENB-01 |
| FR-AU-01 | Must | US-ACC-01, US-ACC-03 |
| FR-AU-02 | Must | US-ENB-02 |
| FR-AU-03 | Must | US-ENB-03 |
| FR-AU-04 | Must | US-ACC-01, US-ACC-02 |
| FR-AU-05 | Should | US-ACC-04 |
| FR-C-01 | Must | US-ADM-01 |
| FR-C-02 | Must | US-ADM-01 |
| FR-C-03 | Must | US-ADM-01 |
| FR-C-04 | Must | US-ADM-02 |
| FR-C-05 | Should | Not covered by a story — a design constraint on the data model, carried into Functional Design |
| FR-C-06 | Must | US-ADM-01 |
| FR-I-01 | Must | US-IMP-01, US-IMP-02 |
| FR-I-02 | Must | US-IMP-03 |
| FR-I-03 | Should | US-IMP-05 |
| FR-I-04 | Must | US-IMP-04 |

**Coverage result**: all 49 Must-priority functional requirements are covered. Of the Should-priority
requirements, all are covered except **FR-C-05** (data model must permit custom fields in Phase 2),
which is a structural design constraint rather than a user-facing capability and therefore carries no
story; it is carried forward to Functional Design.

---

# 11. INVEST Validation

| Criterion | Assessment |
|---|---|
| **Independent** | Stories within each feature area are independently buildable. Three deliberate dependencies exist and are reflected in the build sequence: US-ASN-05 requires the allocation summation from US-ASN-02; the validation stories (US-MEM-07, US-PRJ-05, US-ASN-06, US-IMP-03, US-IMP-04) require their happy-path counterparts; and US-VIS-04 requires the account-to-member link from US-ACC-04 to be meaningful for a Team Member. |
| **Negotiable** | Each story states the capability and its purpose without prescribing screen layout, component structure, or implementation. |
| **Valuable** | Every story delivers value to a named persona, except the four enabler stories (US-ENB-01 to 04), which are included per Q11:B and whose value accrues to the system's integrity rather than to a persona. This is the deliberate exception to INVEST in this set. |
| **Estimable** | Scope is bounded by explicit acceptance criteria. Two carry residual uncertainty: US-VIS-02 (availability computation over date ranges) and US-ASN-05 (sub-period over-allocation detection) — both flagged for attention at Functional Design. |
| **Small** | Medium granularity per Q4:B — one coherent capability each. US-ACC-05 is the largest, covering all five roles; it is kept whole because splitting it per role would fragment a single permission model across five stories. |
| **Testable** | Every story has Given/When/Then acceptance criteria per Q6:A. Note that NFR-Q-01 defers an automated test suite, so these criteria will serve as manual acceptance checks in Phase 1. |

## Deliberate exceptions

1. **Enabler stories have no persona actor** (US-ENB-01 to 04) — accepted per Q11:B; they are written from the system's perspective and remain independently verifiable.
2. **US-ACC-05 is larger than the other stories** — accepted, because the permission model is only coherent when reviewed as a whole.
3. **No part-time capacity story exists** — per Q10:B, all members are assumed 100% capacity. If your department includes part-time or shared-services people, they will appear fully available and be bookable to 100%; this is a known and accepted Phase 1 limitation.
4. **No Sales/Ops-perspective stories exist** — per Q12:B. Domain neutrality is carried by wording alone and verified by the final acceptance criterion of US-ADM-01.
