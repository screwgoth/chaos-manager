# Requirements — C.H.A.O.S (Centralized Hub for Aligning Organizational Squads)

**Project**: chaos-manager
**Stage**: INCEPTION → Requirements Analysis
**Depth**: Comprehensive
**Date**: 2026-07-25
**Status**: Awaiting approval

---

## 1. Intent Analysis

| Attribute | Assessment |
|---|---|
| **User Request** | Build a team management application where on-roll and off-roll members shuffle across multiple projects. Must be agnostic to team type (IT & Engineering today; Sales, Ops, etc. later). Enterprise-grade web application, with enterprise features arriving in later phases. |
| **Request Type** | New Project (greenfield) |
| **Scope Estimate** | System-wide |
| **Complexity Estimate** | Complex |
| **Project Type** | Greenfield — no existing code |
| **Requirements Depth** | Comprehensive |

### 1.1 Problem Statement

Team members — both on-roll employees and off-roll contractors — move between multiple concurrent
projects, often holding partial allocations on several at once. Today this is tracked in
spreadsheets, which makes three questions expensive to answer: who is working on what right now, who
is over-allocated, and who becomes available in a given future period. C.H.A.O.S replaces the
spreadsheet as the authoritative, queryable record of people-to-project allocation over time.

### 1.2 Primary Phase 1 Objective

**Allocation visibility** — see who is on which project, at what percentage, over time. This is the
"must work or the system is useless" capability.

### 1.3 Phase 1 Success Criterion

A manager can answer **"who is available next month?"** in under a minute.

---

## 2. Scope

### 2.1 In Scope — Phase 1

| Capability | Source |
|---|---|
| Member directory (on-roll + off-roll profiles) | Q2:A |
| Project/engagement registry | Q2:B |
| Assignment of members to projects with allocation percentage and date ranges | Q2:C, Q5:A |
| Over-allocation detection and warnings (member allocated >100%) | Q2:D |
| Skills/roles tagging and search | Q2:E |
| Allocation history — date-ranged, queryable historical assignments | Q2:G, CQ2:A |
| Vendor/contract tracking for off-roll members, **excluding** commercial values | Q2:H, CQ1:A |
| CSV/Excel bulk import for members and projects | Q11:D, CQ3:A |
| Current-state allocation view **and** forward-looking availability view | Q1:A, Q21:B, CQ5:A |
| Role-based access control (5 roles) | Q8, Q17:A |
| Org-scoped data visibility | Q10:B |
| Admin-managed reference data (roles, skills, project types, org units) | Q6:B, CQ4:A |
| Local username/password authentication, SSO-ready design | Q13:C |

### 2.2 Deferred to Later Phases

| Capability | Source |
|---|---|
| Dashboards and reports (team utilization, project staffing, bench view) | Q2:F not selected |
| Approval workflow for assignment changes | Q2:I not selected |
| Timesheets / effort logging | Q2:J not selected |
| Contractor commercial data (rates, contract values, PO numbers) | CQ1:A |
| System-wide audit log of all data changes | CQ2:A, Q17 excluded B |
| Admin-defined **custom fields** with dynamic forms | CQ4:A |
| Corporate SSO (SAML/OIDC) | Q13:C |
| HRMS/HRIS, project-tool, notification, and BI integrations | Q12:F |
| Dedicated mobile application | Q19:C |
| Automated test suite with CI pipeline; structured logging and monitoring endpoints; backup/restore procedure; high availability; encryption at rest | Q17:A, CQ6:A |
| Recruitment / applicant tracking, performance reviews, leave & attendance management | Q3 — not excluded, so eligible for future phases |

### 2.3 Explicitly Out of Scope — All Phases

- Payroll and compensation processing (Q3:A)
- Project task management — Jira-style issues, sprints, boards (Q3:E)
- Invoicing and billing of contractors (Q3:F)

---

## 3. Functional Requirements

### 3.1 Member Management

| ID | Requirement | Priority |
|---|---|---|
| FR-M-01 | The system shall maintain a member record with identity, contact, org unit, employment type, role, skills, and status. | Must |
| FR-M-02 | Member records shall use a **single entity** with an `employmentType` attribute distinguishing on-roll from off-roll. (Q4:A) | Must |
| FR-M-03 | Off-roll members shall additionally carry vendor name, contract start date, contract end date, and contract status. Commercial values are excluded from Phase 1. (CQ1:A) | Must |
| FR-M-04 | The system shall support creating, viewing, updating, and deactivating member records. Deactivation shall preserve historical assignments. | Must |
| FR-M-05 | The system shall support tagging a member with zero or more skills drawn from admin-managed reference data. | Must |
| FR-M-06 | The system shall support searching and filtering members by name, org unit, employment type, role, skill, and availability. | Must |
| FR-M-07 | The system shall flag off-roll members whose contract end date falls within a configurable near-term window. | Should |
| FR-M-08 | The system shall support bulk import of members from CSV/Excel, with per-row validation and an error report identifying failed rows without aborting the whole import. (CQ3:A) | Must |

### 3.2 Project Management

| ID | Requirement | Priority |
|---|---|---|
| FR-P-01 | The system shall maintain a project record with name, code, description, owning org unit, project type, start date, planned end date, and status. | Must |
| FR-P-02 | Project type shall be drawn from admin-managed reference data, not a hardcoded list. (CQ4:A) | Must |
| FR-P-03 | The system shall support creating, viewing, updating, and closing projects. Closing a project shall preserve its assignment history. | Must |
| FR-P-04 | The system shall support searching and filtering projects by name, code, org unit, project type, and status. | Must |
| FR-P-05 | The system shall support bulk import of projects from CSV/Excel with the same validation behavior as FR-M-08. (CQ3:A) | Must |
| FR-P-06 | The system shall display, for any project, the list of currently assigned members with their allocation percentages and assignment date ranges. | Must |

### 3.3 Allocation & Assignment

| ID | Requirement | Priority |
|---|---|---|
| FR-A-01 | The system shall allow assigning a member to a project with an **allocation percentage** and a **start date and end date**. (Q5:A) | Must |
| FR-A-02 | A member shall be assignable to multiple projects concurrently, with allocation percentages summing across overlapping date ranges. | Must |
| FR-A-03 | The system shall compute a member's **total allocation** for any given date or date range as the sum of allocation percentages of all assignments overlapping that period. | Must |
| FR-A-04 | The system shall **detect and warn** when a member's total allocation for any period exceeds 100%. (Q2:D) | Must |
| FR-A-05 | Over-allocation shall be surfaced at the point of assignment creation or modification, before the change is saved. | Must |
| FR-A-06 | The system shall define behavior on over-allocation as a **warning that permits an explicit override**, not a hard block. Overridden over-allocations shall remain visibly flagged. | Must |
| FR-A-07 | The system shall allow modifying an assignment's allocation percentage and date range, and ending an assignment early. | Must |
| FR-A-08 | The system shall retain historical assignments so that allocation state is queryable **as of any past date**. (Q2:G, CQ2:A) | Must |
| FR-A-09 | The system shall prevent assignment date ranges that fall outside the member's active period or an off-roll member's contract window, warning the user where a conflict exists. | Should |
| FR-A-10 | Assignments shall support an optional project role for the member on that project (drawn from reference data). | Should |

### 3.4 Visibility & Availability Views

| ID | Requirement | Priority |
|---|---|---|
| FR-V-01 | The system shall provide a **current-state allocation view**: who is on which project, at what percentage, as of today. (Q1:A) | Must |
| FR-V-02 | The system shall provide a **forward-looking availability view**: which members have unallocated capacity within a user-specified future period, and how much. (Q21:B, CQ5:A) | Must |
| FR-V-03 | The availability view shall support filtering by org unit, employment type, role, and skill, so that a manager can locate available members with specific capabilities. | Must |
| FR-V-04 | Both views shall be driven by a user-selectable **as-of date or date range**. | Must |
| FR-V-05 | The system shall provide a per-member timeline showing that member's assignments across projects over a selected period. | Should |
| FR-V-06 | The system shall identify **unallocated members** ("bench") for a selected period. | Should |
| FR-V-07 | The system shall surface over-allocated members for a selected period as a reviewable list. | Should |

### 3.5 Organizational Model

| ID | Requirement | Priority |
|---|---|---|
| FR-O-01 | The system shall model a **two-level** organizational structure: departments containing teams, with members and projects belonging to an org unit. (Q7:B) | Must |
| FR-O-02 | Org units shall be admin-managed reference data. (CQ4:A) | Must |
| FR-O-03 | Every member shall belong to exactly one org unit; every project shall have exactly one owning org unit. | Must |
| FR-O-04 | The system shall support cross-org-unit assignment — a member from one org unit may be assigned to a project owned by another. | Must |

### 3.6 Access Control

| ID | Requirement | Priority |
|---|---|---|
| FR-R-01 | The system shall implement role-based access control with five roles: **Admin**, **Resource/Delivery Manager**, **Team Lead/Line Manager**, **Team Member**, **Executive**. (Q8:A-E) | Must |
| FR-R-02 | **Admin** shall configure the system, manage all reference data, and manage all member, project, and assignment records. | Must |
| FR-R-03 | **Resource/Delivery Manager** shall create and modify projects and assignments within their permitted org scope. | Must |
| FR-R-04 | **Team Lead/Line Manager** shall view their own org unit's members, projects, and allocations, and request assignment changes. Direct assignment modification is not granted at this role in Phase 1. | Must |
| FR-R-05 | **Team Member** shall view only their own profile and their own assignments. | Must |
| FR-R-06 | **Executive** shall have read-only visibility across all org units. | Must |
| FR-R-07 | Data visibility shall be **scoped by org unit**: users see their own org unit's data; Executive and Admin roles see across all units. (Q10:B) | Must |
| FR-R-08 | Access control shall be enforced server-side on every data access path, not solely by hiding UI elements. | Must |

### 3.7 Authentication

| ID | Requirement | Priority |
|---|---|---|
| FR-AU-01 | The system shall provide local username/password authentication for Phase 1. (Q13:C) | Must |
| FR-AU-02 | Passwords shall be stored only as salted hashes using a current password-hashing algorithm. Plaintext or reversibly-encrypted password storage is prohibited. | Must |
| FR-AU-03 | The authentication layer shall be designed as a replaceable boundary so that SAML/OIDC SSO can be added in a later phase without redesigning session handling or user-identity linkage. (Q13:C) | Must |
| FR-AU-04 | The system shall provide session establishment, session expiry, and logout. | Must |
| FR-AU-05 | User accounts shall be linked to member records where the user is also a tracked member, without requiring every member to have a login. | Should |

### 3.8 Reference Data & Team-Type Agnosticism

| ID | Requirement | Priority |
|---|---|---|
| FR-C-01 | The system shall use **domain-neutral vocabulary** throughout data model, API, and UI. No IT/Engineering-specific terminology shall be embedded in entity names, field names, or labels. (Q6, CQ4:A) | Must |
| FR-C-02 | The following shall be **admin-managed reference data** stored as editable records, not hardcoded enumerations: roles, skills, project types, org units. (CQ4:A) | Must |
| FR-C-03 | An Admin shall be able to add, rename, and deactivate reference data entries without a code change or redeployment. | Must |
| FR-C-04 | Reference data entries in use by existing records shall not be hard-deleted; deactivation shall preserve referential integrity. | Must |
| FR-C-05 | The data model shall be designed so that **user-defined custom fields** can be added in Phase 2 without restructuring core entities. (CQ4:A — extension point, not Phase 1 functionality) | Should |
| FR-C-06 | The system shall be demonstrably usable by a non-IT team (e.g. Sales, Ops) in Phase 1 using only reference-data configuration. | Must |

### 3.9 Data Import

| ID | Requirement | Priority |
|---|---|---|
| FR-I-01 | The system shall accept CSV/Excel uploads for members and projects. (CQ3:A) | Must |
| FR-I-02 | Import shall validate each row and report failures per row with a reason, without aborting valid rows. | Must |
| FR-I-03 | Import shall provide a downloadable template describing expected columns. | Should |
| FR-I-04 | Import shall not create duplicate records where a natural key (e.g. employee ID, project code) already exists; such rows shall be reported as conflicts. | Must |
| FR-I-05 | Historical allocation migration is **not** required. (Q22:B) | N/A |

---

## 4. Non-Functional Requirements

### 4.1 Scale & Performance

| ID | Requirement |
|---|---|
| NFR-S-01 | Design target: up to **200 members** and **50 projects** (single department). (Q9:A) |
| NFR-S-02 | Concurrent users: expected in the low tens, consistent with a single-department internal tool. |
| NFR-S-03 | Page loads and view renders shall complete in **under 3 seconds** under expected load. (Q18:A) |
| NFR-S-04 | Allocation and availability computations shall remain within NFR-S-03 at design-target data volume. |
| NFR-S-05 | The data model shall not preclude later growth to multiple departments (~2,000 members), though Phase 1 need not be optimized for it. |

### 4.2 Availability

| ID | Requirement |
|---|---|
| NFR-A-01 | Classification: **business-hours internal tool**. Occasional downtime is acceptable. (Q18:A) |
| NFR-A-02 | No formal uptime SLA, RTO, or RPO target is committed for Phase 1. |
| NFR-A-03 | High availability and multi-instance deployment are deferred. (Q17) |

### 4.3 Deployment & Technology

| ID | Requirement |
|---|---|
| NFR-T-01 | Deployment target: **on-premises / self-hosted**, containerized via Docker (Kubernetes optional). (Q15:D) |
| NFR-T-02 | Backend: **Node.js / TypeScript**. (Q16:D) |
| NFR-T-03 | Frontend: **React**. (Q16:D) |
| NFR-T-04 | The application shall run without dependency on any public cloud managed service. |
| NFR-T-05 | Database technology is **not yet decided** — see Open Decision OD-01. |

### 4.4 User Interface

| ID | Requirement |
|---|---|
| NFR-U-01 | **Responsive web** application, usable on desktop, tablet, and phone browsers. (Q19:C) |
| NFR-U-02 | A dedicated mobile application is deferred to a later phase; Phase 1 shall not preclude it (implies a clean API boundary). (Q19:C) |
| NFR-U-03 | Accessibility: reasonable defaults. Formal WCAG 2.1 AA compliance is **not** a Phase 1 requirement. (Q20:A) |
| NFR-U-04 | Localization: single language (English). Multi-language support is not required. (Q20:A) |

### 4.5 Security

| ID | Requirement |
|---|---|
| NFR-SE-01 | The AI-DLC **Security Baseline extension is disabled** for this project. (Extension opt-in: No; CQ6:A) |
| NFR-SE-02 | Notwithstanding NFR-SE-01, the baseline authentication and authorization requirements stated in FR-AU-02 (password hashing) and FR-R-08 (server-side authorization enforcement) are **mandatory functional requirements**, because they are unrecoverable if wrong. |
| NFR-SE-03 | Data sensitivity classification: **low** — names, roles, skills, and allocations only. Contractor commercial data is excluded from Phase 1. (Q14:A, CQ1:A) |
| NFR-SE-04 | No regulatory compliance regime (GDPR, DPDP, HIPAA, SOC 2) is in scope for Phase 1. (Q14:A) |
| NFR-SE-05 | Transport security (TLS) is a deployment-environment concern, not an application requirement, for Phase 1. Encryption at rest is deferred. (Q17) |

### 4.6 Quality & Operability

| ID | Requirement |
|---|---|
| NFR-Q-01 | Automated test suite with CI pipeline is **not** a Phase 1 requirement. (Q17:A, CQ6:A) The AI-DLC Build and Test stage will still produce build and test instructions and unit tests for generated code. |
| NFR-Q-02 | Structured logging and health/monitoring endpoints are deferred. (Q17) |
| NFR-Q-03 | Backup and restore procedures are deferred. (Q17) |
| NFR-Q-04 | Property-based testing rules are **not** enforced — extension disabled. (Extension opt-in: No) |
| NFR-Q-05 | Resiliency baseline is **not** applied — extension disabled. (Extension opt-in: No) |
| NFR-Q-06 | Code shall be maintainable and extensible across phases: clear module boundaries, typed interfaces, and no logic duplicated between UI and API. |

### 4.7 Integration

| ID | Requirement |
|---|---|
| NFR-IN-01 | Phase 1 is a **standalone application** — no external integrations. (Q12:F) |
| NFR-IN-02 | C.H.A.O.S is the **system of record** for allocation data in Phase 1; people data is seeded via CSV import and maintained in-app. (Q11:D) |
| NFR-IN-03 | The API boundary shall be clean enough to support later HRMS, SSO, notification, and BI integrations without core redesign. |

---

## 5. Delivery Approach

| ID | Requirement |
|---|---|
| DA-01 | Build as a **thin end-to-end vertical slice** first — a working thread through React UI → API → database — then broaden feature by feature. (Q23:A) |
| DA-02 | The first vertical slice shall exercise the core domain: create a member, create a project, assign the member to the project with a percentage and date range, and view the resulting allocation. |
| DA-03 | Phase 1 replaces the existing spreadsheet workflow. No data migration required. (Q22:B) |

---

## 6. Extension Configuration

| Extension | Enabled | Rationale |
|---|---|---|
| Security Baseline | **No** | User opt-in B; confirmed at CQ6:A. Phase 1 treated as a working prototype validating the workflow. FR-AU-02 and FR-R-08 retained as functional requirements regardless. |
| Resiliency Baseline | **No** | User opt-in B. Business-hours internal tool, occasional downtime acceptable, on-premises deployment; AWS Well-Architected-derived guidance not applicable. |
| Property-Based Testing | **No** | User opt-in C. Predominantly CRUD with modest computational logic. |

---

## 7. Assumptions

| ID | Assumption |
|---|---|
| AS-01 | Allocation percentages are integers or simple decimals; 100% represents a member's full working capacity. **RESOLVED 2026-07-25 (story-generation-plan.md Q10:B): all members are assumed to have 100% capacity in Phase 1. Part-time and fractional-capacity members are NOT modeled** — a person working 60% of a full week appears as fully available at 100% and may be booked to 100%. Explicit member capacity is deferred to a later phase. |
| AS-02 | Over-allocation is a warning with override rather than a hard block (FR-A-06), on the grounds that real staffing situations legitimately exceed 100% temporarily. |
| AS-03 | Assignment date ranges are inclusive of both start and end date. |
| AS-04 | "Availability next month" means unallocated capacity percentage over a date range, not a binary free/busy flag. |
| AS-05 | Users authenticate individually; no shared accounts. |
| AS-06 | The single department in Phase 1 is the IT & Engineering team, used as the pilot before other departments onboard. |

## 8. Open Decisions

| ID | Decision | Deferred To |
|---|---|---|
| OD-01 | Database technology (PostgreSQL, MySQL, SQLite, or other). Relational is strongly implied by date-ranged allocation queries and referential integrity needs, but not yet selected. | NFR Requirements stage |
| OD-02 | Whether allocation history is modeled as date-ranged assignment rows only, or as assignment rows plus a separate history table. | Functional Design stage |
| OD-03 | Node.js API framework selection and React application tooling. | NFR Requirements stage |
| OD-04 | ~~Whether member capacity is modeled explicitly (to support part-time members) or assumed uniformly 100%.~~ **CLOSED 2026-07-25** — uniform 100% capacity; part-time members not modeled in Phase 1. See AS-01. | Closed at User Stories planning |

---

## 9. Summary

C.H.A.O.S Phase 1 is a **standalone, on-premises, responsive web application** (Node.js/TypeScript +
React) that replaces spreadsheet-based allocation tracking for a single ~200-person department. Its
core is a domain-neutral model of **members** (on-roll and off-roll in one entity), **projects**, and
**percentage-based, date-ranged assignments**, with over-allocation detection, skill-based search,
queryable allocation history, CSV import, five RBAC roles, and org-scoped visibility.

Team-type agnosticism is achieved in Phase 1 through **domain-neutral vocabulary plus admin-managed
reference data** — roles, skills, project types, and org units are editable records rather than
hardcoded lists — with user-defined custom fields deliberately deferred to Phase 2 as a designed-for
extension point.

Enterprise hardening — dashboards, approval workflows, SSO, system-wide audit logging, CI, monitoring,
HA, and backup procedures — is explicitly deferred, consistent with the stated intent that enterprise
features arrive in later phases.
