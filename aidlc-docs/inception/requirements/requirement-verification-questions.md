# Requirements Verification Questions

**Project**: C.H.A.O.S — Centralized Hub for Aligning Organizational Squads (chaos-manager)
**Stage**: INCEPTION → Requirements Analysis
**Depth**: Comprehensive (new project, system-wide scope, enterprise-grade target)

Please answer each question by putting the letter choice after its `[Answer]:` tag. If none of the
options match, choose the **Other** option and describe your preference after the `[Answer]:` tag.
Multiple letters are acceptable where a question is naturally multi-select — it says so in the question.

Tell me when you're done and I'll analyze the answers for gaps and contradictions.

---

# Section A — Core Domain & Scope

## Question 1
What is the single most important problem C.H.A.O.S must solve first? (Your Phase 1 "must work or it's useless" capability.)

A) **Allocation visibility** — see who is on which project, at what percentage, right now

B) **Allocation planning** — plan and change future assignments, forecast who frees up when

C) **Capacity & demand matching** — know available capacity vs. project demand, spot over/under-allocation

D) **People directory & roster of record** — authoritative record of on-roll and off-roll members, their skills and vendors

E) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2
Which capabilities should be in **Phase 1** (the first working release)? **Select all that apply** (e.g. `A, C, E`).

A) Member directory (on-roll + off-roll profiles)

B) Project/engagement registry

C) Assignment of members to projects with allocation percentage and date ranges

D) Over-allocation detection and warnings (member allocated >100%)

E) Skills/roles tagging and search ("find me an available React engineer")

F) Dashboards and reports (team utilization, project staffing, bench view)

G) Allocation history / audit trail (who was where, when, and who changed it)

H) Vendor/contractor management (off-roll contracts, rates, contract end dates)

I) Approval workflow for assignment changes (request → approve → effective)

J) Timesheets / effort logging

K) Other (please describe after [Answer]: tag below)

[Answer]: A, B, C, D, E, G, H

## Question 3
What is explicitly **out of scope** for this application — even in later phases? **Select all that apply.**

A) Payroll and compensation processing

B) Recruitment / applicant tracking

C) Performance reviews and appraisals

D) Leave and attendance management

E) Project task management (Jira-style issues, sprints, boards)

F) Invoicing and billing of contractors

G) Nothing — all of the above are eventually in scope

H) Other (please describe after [Answer]: tag below)

[Answer]: A, E, F

## Question 4
How should "off-roll" members differ from "on-roll" members in the data model?

A) Same entity, one attribute flags employment type (simplest)

B) Same entity, but off-roll members carry extra required fields (vendor, contract start/end, rate, PO number)

C) Separate entities with different lifecycles, joined by a common "person" record

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5
How should a member's allocation across multiple projects be expressed?

A) Percentage of capacity per project (e.g. 60% Project A, 40% Project B), with date ranges

B) Days or hours per week per project, with date ranges

C) Simple primary/secondary project assignment, no quantified split

D) Full/partial allocation buckets (100% / 50% / 25%), with date ranges

E) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6
When you say the app must be **agnostic to team type** (IT, Sales, Ops), what does that mean concretely?

A) Generic vocabulary only — no IT-specific terms anywhere; one shared data model for all team types

B) Configurable per team type — admins define custom fields, roles, and skill taxonomies for their team

C) Full multi-tenant style configurability — each department gets its own configured workspace with its own terminology, fields, and workflows

D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

# Section B — Organizational Model & Users

## Question 7
What organizational structure must the system model?

A) Flat — a set of projects and a pool of people, no hierarchy

B) Two levels — departments/teams containing people and projects

C) Deep hierarchy — org units nesting arbitrarily (BU → department → team → sub-team), with reporting lines

D) Matrix — people belong to a functional team AND report into project structures simultaneously

E) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 8
Which user roles need distinct permissions in Phase 1? **Select all that apply.**

A) Admin (configures the system, manages master data)

B) Resource/Delivery Manager (creates projects, makes and changes assignments)

C) Team Lead / Line Manager (views and requests changes for own team only)

D) Team Member (views own profile and own assignments only)

E) Executive / Leadership (read-only dashboards across the whole org)

F) HR / Vendor Coordinator (manages member records and contractor data)

G) Other (please describe after [Answer]: tag below)

[Answer]: A, B, C, D, E

## Question 9
What scale should the system be designed for?

A) Small — up to ~200 members, ~50 projects (single team/department)

B) Medium — up to ~2,000 members, ~500 projects (multiple departments)

C) Large — up to ~20,000 members, thousands of projects (whole enterprise)

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 10
Should data visibility be restricted by org scope? (e.g. a Sales manager cannot see Engineering allocations.)

A) No — all authenticated users see all data; only edit rights are restricted

B) Yes — users see only their own org unit's data, with leadership able to see across units

C) Yes, and it must be strict multi-tenancy — departments are fully isolated data boundaries

D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

# Section C — Integrations & Data

## Question 11
Where does the authoritative list of people come from?

A) Entered and maintained directly in C.H.A.O.S (it is the system of record)

B) Imported from an HRMS/HRIS (which one? describe under Other if you pick this)

C) Synced from a corporate directory (Active Directory / Azure AD / Google Workspace / LDAP)

D) Bulk import via CSV/Excel upload, maintained manually thereafter

E) Other (please describe after [Answer]: tag below)

[Answer]: D

## Question 12
Which integrations are needed, and when? **Select all that apply** — and note "Phase 1" or "later" after the letters if you can.

A) SSO / identity provider (SAML or OIDC) for login

B) HRMS/HRIS for employee master data

C) Project/work management tool (Jira, Azure DevOps, Asana) for project lists

D) Email or chat notifications (SMTP, Slack, Microsoft Teams)

E) BI / data warehouse export for reporting

F) None in Phase 1 — standalone application first

G) Other (please describe after [Answer]: tag below)

[Answer]: F

## Question 13
How should users log in for **Phase 1**?

A) Local username/password managed by the application

B) Corporate SSO from day one (SAML/OIDC — Okta, Azure AD, Google)

C) Local login for Phase 1, SSO added as a later phase (with the design kept SSO-ready)

D) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 14
What kind of data sensitivity are we handling? This drives security and compliance requirements. **Select all that apply.**

A) Names, roles, skills, and allocations only — low sensitivity

B) Contractor commercial data (rates, contract values) — confidential

C) Personal data subject to privacy regulation (GDPR / DPDP Act / similar)

D) Nothing regulated; internal-use data only

E) Other (please describe after [Answer]: tag below)

[Answer]: A

---

# Section D — Non-Functional Requirements

## Question 15
Where will this be deployed?

A) Public cloud — AWS

B) Public cloud — Azure

C) Public cloud — GCP

D) On-premises / self-hosted (Docker or Kubernetes on your own servers)

E) Not decided — recommend an option

F) Other (please describe after [Answer]: tag below)

[Answer]: D

## Question 16
Do you have technology stack preferences or constraints? (Existing team skills, mandated platforms.)

A) No preference — recommend a stack and justify it

B) Python backend (FastAPI or Django) + React frontend

C) Java/Spring Boot backend + React or Angular frontend

D) Node.js/TypeScript backend + React frontend

E) .NET backend + React or Blazor frontend

F) Other (please describe after [Answer]: tag below)

[Answer]: D

## Question 17
Which enterprise-grade qualities must be present from **Phase 1**, versus deferred? **Select all that apply** for Phase 1.

A) Role-based access control

B) Full audit trail of all data changes

C) Automated test suite and CI

D) Structured logging and health/monitoring endpoints

E) Backup and restore procedure

F) High availability / multi-instance deployment

G) Data encryption at rest and in transit

H) Only A and C in Phase 1 — defer the rest

I) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 18
What availability and performance expectations should we design to?

A) Business-hours internal tool — occasional downtime acceptable; page loads under ~3s

B) Business-critical — ~99.5% uptime; page loads under ~2s; supports ~100 concurrent users

C) Mission-critical — ~99.9%+ uptime; sub-second interactions; hundreds of concurrent users

D) Not decided — recommend based on the use case

E) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 19
What does the primary user interface need to support?

A) Desktop web only — responsive is nice-to-have

B) Responsive web — must be usable on tablet and phone browsers

C) Responsive web plus a dedicated mobile app in a later phase

D) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 20
Any accessibility or localization requirements?

A) None specific — reasonable defaults are fine

B) WCAG 2.1 AA accessibility compliance required

C) Multi-language support required (which languages? describe under Other)

D) Both accessibility compliance and multi-language support

E) Other (please describe after [Answer]: tag below)

[Answer]: A

---

# Section E — Success Criteria & Delivery

## Question 21
How will you judge Phase 1 a success?

A) Replaces the spreadsheet(s) currently used to track allocations

B) Managers can answer "who is available next month?" in under a minute

C) Zero unnoticed over-allocations or double-booked members

D) Adopted by a pilot team, then rolled out to other departments

E) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 22
Is there an existing tool, spreadsheet, or process this replaces — and do we need to migrate its data?

A) Spreadsheets, and yes — we need an import path for existing data

B) Spreadsheets, but no migration needed — we'll start fresh

C) An existing tool we're moving off (describe which under Other)

D) Nothing exists — this is a brand new capability

E) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 23
How should we approach the build?

A) Thin end-to-end vertical slice first (a working thread through UI → API → database), then broaden feature by feature

B) Backend and data model complete first, then build the UI on top

C) Clickable UI prototype first to validate the workflow, then the backend

D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

# Section F — Extension Opt-Ins

These questions decide which AI-DLC extension rule sets are enforced as hard constraints throughout
the rest of the workflow.

## Question: Security Extensions
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question: Resiliency Extensions
Should the resiliency baseline be applied to this project?

**What this extension is.** Enabling it applies a set of **directional, design-time best practices** for building resilient systems, derived from the **AWS Well-Architected Framework (Reliability Pillar)** and resilience-review guidance. It steers requirements, design, and code toward fault tolerance, high availability, observability, and recoverability — covering 15 practice areas across business goals, change management, observability, high availability, disaster recovery, and continuous improvement.

**What this extension is NOT.** Enabling it does **not** make your workload production-ready, nor does it certify or guarantee any availability, RTO, or RPO target. It is a **starting point** that scaffolds good resiliency decisions early — it is not a substitute for a formal **AWS Well-Architected Review** of the built system.

Treat the output as a well-grounded **first draft of your resiliency posture** to build on and validate — not a finished, production-certified result.

A) Yes — apply the resiliency baseline as directional best practices and design-time guidance (recommended for business-critical workloads, as an informed starting point that you can validate and harden before go-live)

B) No — skip the resiliency baseline (suitable for PoCs, prototypes, and experimental projects where rapid iteration matters more than reliability)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question: Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, serialization, or stateful components)

B) Partial — enforce PBT rules only for pure functions and serialization round-trips (suitable for projects with limited algorithmic complexity)

C) No — skip all PBT rules (suitable for simple CRUD applications, UI-only projects, or thin integration layers with no significant business logic)

X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

# Section G — Anything Else

## Question 24
Is there anything important about your organization's way of working, constraints, or expectations that these questions did not cover?

A) No — the questions above cover it

B) Yes (please describe after [Answer]: tag below)

[Answer]: A
