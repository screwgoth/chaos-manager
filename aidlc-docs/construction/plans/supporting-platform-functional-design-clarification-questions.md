# Functional Design Clarification Questions — `supporting-platform`

**Date**: 2026-07-26
**Source**: analysis of the 15 answers in `supporting-platform-functional-design-plan.md`
(Q1:A, Q2:C, Q3:C, Q4:A, Q5:A, Q6:A, Q7:A, Q8:A, Q9:A, Q10:A, Q11:A, Q12:A, Q13:A, Q14:A, Q15:A)

Thirteen answers are consistent and I can design from them directly. Two create problems I will not
resolve by assumption, because both would silently change the meaning of an approved requirement.

---

## Contradiction 1 — Q3:C and Q4:A give opposite answers to the same question

**Q4:A** says: a Team Lead scoped to "Platform" viewing a member who is 80% on a Platform project and
50% on a Sales project should see the **full 130% total**, with the Sales portion shown as
*"50% on a project outside your visibility"* — the number truthful, the project identity **withheld**.

**Q3:C** says: an assignment is visible if the caller's scope covers **the member OR the project**.

These cannot both hold. Under Q3:C the member *is* in the Team Lead's scope, so the Sales assignment
is visible — and a visible assignment names its project. Q3:C therefore reveals exactly the identity
that Q4:A withholds, and Q4:A's redaction becomes unreachable code.

The underlying question is which one you actually want:

### Clarification Question 1
When a Team Lead can see a member, what should they see about that member's assignment to a project
outside their org scope?

A) **Q3:C wins — full visibility.** Seeing the person means seeing everything about the person's time,
project names included. Simple, no redaction logic anywhere, and the allocation total is truthful for
free. The cost: org-scope confidentiality is weaker than FR-R-07 implies, because any Team Lead can
enumerate other org units' project names through their own members' assignments.

B) **Q4:A wins — assignment governed by the project's org unit, with a redacted remainder.** The
assignment row is not visible, but the *total* always is, with the out-of-scope portion shown as an
unnamed "outside your visibility" block. Preserves confidentiality and keeps the number honest. The
cost: redaction logic in the allocation view, and Q3 effectively becomes option B (project governs)
rather than C.

C) **Split by operation** — reads follow Q3:C (see the member, see everything), writes follow the
stricter rule (a Resource Manager may only modify an assignment when both member and project are in
scope). Confidentiality is weaker but the write boundary is tight.

D) Other (please describe after [Answer]: tag below)

[Answer]:

---

## Contradiction 2 — Q2:C conflicts with approved requirement FR-R-07

**Q2:C** makes a Resource/Delivery Manager **organisation-wide always**, with `home_org_unit_id`
informational for that role.

**FR-R-07** (Must, approved) reads: *"users see their own org unit's data; **Executive and Admin roles
see across all units**."* Resource Manager is not in that list. **FR-R-03** likewise constrains the
role to "their permitted org scope".

So Q2:C is not a design choice within the requirements — it is a change to them. I can implement it,
but it must be recorded as an approved requirement amendment rather than absorbed quietly, or the
requirements will no longer describe the system.

There is also a consequence worth seeing before you decide. With Q2:C, cross-org scope restriction
applies to **exactly one role**: TEAM_LEAD. Admin, Executive and Resource Manager are all
unrestricted, and Team Member is restricted by `restrictToMemberId` rather than by org unit. The
org-scope machinery this entire unit exists to build would then be exercised by a single role — which
makes it both easier to get right and easier to leave untested.

### Clarification Question 2
How should the Resource Manager scope decision be recorded?

A) **Amend FR-R-07 and FR-R-03** to add Resource/Delivery Manager to the cross-org roles. I update
`requirements.md`, note the amendment and its date, and log it in audit.md. Q2:C stands as answered.

B) **Keep FR-R-07 as written — revert to Q2:B** (root-wide if attached to the root org unit, subtree
otherwise). This gives you an organisation-wide Resource Manager *when you want one* by attaching them
to the root unit, without amending a requirement and without hard-coding the role as unrestricted.

C) **Keep FR-R-07 as written — revert to Q2:A** (same as Team Lead: home unit plus children). Most
restrictive, and makes org-scope enforcement meaningful for two roles rather than one.

D) Other (please describe after [Answer]: tag below)

[Answer]:

---

## Recorded without a question

These follow from your answers and need no further input, but I am stating them so nothing is
implicit:

1. **Q7:A downgrades a Must requirement.** FR-I-01 says "CSV/Excel"; CSV-only satisfies it partially.
   The option text said so and you chose it, so I will record FR-I-01 as **partially satisfied** with
   Excel deferred — not as complete. Uploading an `.xlsx` will fail with a message telling the user to
   save as CSV, rather than failing obscurely.

2. **Q5:A applies only to TEAM_LEAD.** Under Q2:C a Resource Manager needs no `home_org_unit_id`, so
   the fail-closed rule for a NULL value is meaningful for Team Leads alone. If you pick B or C in
   Clarification Question 2, it applies to both roles.

3. **Q1:A means `RolePermission` is not an entity.** `unit-of-work.md` lists it as the one database
   entity Unit 2 owns. With a code-constant matrix, Unit 2 owns **no** database entity and needs no
   migration (unless Clarification Question 2 lands on something requiring one). I will correct
   `unit-of-work.md` to say so.

4. **Q10:A means an import leaves no audit trail.** Bulk write is the highest-privilege operation in
   the system and, per Q10:A, only its row counts and failure reasons are logged — never row contents
   (C10), and no `ImportRun` record is kept. Recorded as an accepted gap, revisitable in Phase 2.
