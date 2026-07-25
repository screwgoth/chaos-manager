# Application Design — Clarification Questions

**Project**: C.H.A.O.S (chaos-manager)
**Stage**: INCEPTION → Application Design (Part 1, clarification round 1)
**Source**: Mandatory Step 8 analysis of answers in `application-design-plan.md`
**Resolved 2026-07-25T10:45:00Z** — user answered "A". Applied as **CQ1: A** (seam changed back to Core
Domain / Supporting Platform; DA-01, DA-02, and the Slice 1 set preserved intact) and **CQ2: A** (confirm
option C — generic component for roles/skills/project types, separate OrgUnit component). Both match the
recommended options, and both are consistent with each other and with all prior approved decisions.

Nine of your ten answers are consistent and give a clear design: **layered monolith**, a **single
dedicated Allocation component**, **one service per domain area**, **rules enforced in the domain and
service layer only**, **feature-folder React structure**, **REST endpoints per resource**, **signatures
with parameters and return types**, and **Mermaid diagrams**. That is a coherent and appropriately
simple architecture for a 200-member internal tool.

One answer conflicts with a decision you made and approved earlier. It needs resolving before I
generate the design, because it determines the order in which working software appears.

---

## Contradiction 1: The Backend/Frontend unit seam versus the thin vertical slice

**Q7: B** selects a **Backend / Frontend** unit seam — Unit 1 is the whole API and database, Unit 2 is
the whole React application.

This conflicts with three things already approved:

- **DA-01** (requirements.md, approved): "Build as a **thin end-to-end vertical slice** first — a working thread through React UI → API → database — then broaden feature by feature." This came from your Q23:A answer, where you explicitly chose the vertical slice over option B, "backend and data model complete first, then build the UI on top."
- **DA-02**: the first slice must exercise "create a member, create a project, assign the member to the project with a percentage and date range, and **view** the resulting allocation."
- **stories.md §9.1**: the flagged Slice 1 set (US-ACC-01, US-ENB-02, US-MEM-01, US-PRJ-01, US-ASN-01, US-VIS-01) — every one of which needs both an API and a screen to be demonstrable.

**Why this is a real conflict, not a naming quibble.** The AI-DLC Construction phase runs a per-unit
loop in which *each unit is completed fully — design and code — before the next unit begins*. With a
Backend/Frontend seam, that means the entire API and database are designed and built first, and no
screen exists until Unit 2 starts. A vertical slice is by definition a thread through UI, API, and
database simultaneously, so under this seam **Slice 1 cannot exist as approved** — the first
demonstrable end-to-end thread would arrive only partway into Unit 2, near the end of the project.

That may be exactly what you want; "backend first, then UI" is a legitimate and common approach, and
it has real advantages — a stable API contract before any UI is written, and clean parallelization if
two different people build the two halves. But it is the approach you declined at Q23, so I am not
going to switch you to it silently.

### Clarification Question 1
How would you like to resolve this?

A) **Change the seam back to Core Domain / Supporting Platform** — Unit 1: members, projects, assignments, allocation, views (full stack, API and UI together). Unit 2: authentication, access control, reference-data administration, import (full stack). Slice 1 survives intact and lands almost entirely inside Unit 1. DA-01 and DA-02 stand as approved. *(This is my recommendation — it is the only option that preserves everything already approved.)*

B) **Keep the Backend/Frontend seam and amend the delivery approach** — DA-01 changes from "thin vertical slice first" to "backend and data model complete first, then build the UI on top" (your Q23 option B). Slice 1 is redefined as an API-only thread verifiable through API calls rather than a screen. The first usable application appears late. This is a deliberate, documented trade of early demonstrability for a settled API contract.

C) **Keep the Backend/Frontend seam but run the units as coordinated parallel tracks** — override the AI-DLC rule that each unit completes fully before the next begins. Unit 1 builds the Slice 1 endpoints, then Unit 2 builds the Slice 1 screens, then both return for the next wave. This preserves the vertical slice but departs from the standard per-unit loop, and adds coordination overhead at every wave boundary.

D) **Use three units instead of two** — Unit 1: full-stack Slice 1 vertical thread. Unit 2: remaining backend. Unit 3: remaining frontend. Preserves the slice and the Backend/Frontend separation for the bulk of the work, at the cost of the third unit you asked to avoid (still within the cap of 3 from revision R1).

X) Other (please describe after [Answer]: tag below)

[Answer]:

---

## Ambiguity 1: Question 8 answered as "Recommend"

**Q8** was answered "Recommend" rather than with a letter. I am treating this as delegation and
selecting **option C**: a generic reference-data component handling roles, skills, and project types
uniformly, plus a **separate OrgUnit component**.

Rationale: the three simple lookups genuinely are the same thing — a named, activatable list entry —
and sharing one component avoids writing the same create/rename/deactivate logic three times. Org
units are different in kind: they are hierarchical (department containing team, FR-O-01), they are
referenced by the visibility-scope logic that governs every query (FR-R-07), and removing one has
different consequences (FR-O-04). Folding them into a generic lookup component would either weaken the
generic component or force it to carry org-unit-specific special cases.

### Clarification Question 2
Confirm the Q8 selection, or override it.

A) **Confirm option C** — generic component for roles, skills, and project types; separate OrgUnit component

B) **Override to option A** — one generic reference-data component handling all four types uniformly

C) **Override to option B** — distinct components per reference type, sharing a common interface

X) Other (please describe after [Answer]: tag below)

[Answer]:
