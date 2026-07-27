# Frontend Components — `supporting-platform` (Unit 2)

**Unit**: 2 of 2 · **Stage**: Functional Design
**Decisions**: Q14:A (three dedicated pages), Q12:A (import is Admin only), Q10:A (report is
response-only), CQ1:A (no allocation redaction)

---

## 1. Scope

Unit 2 adds **five screens** and modifies **two**. Nothing else in the frontend changes.

| Feature | Story | New or modified |
|---|---|---|
| F-07 Import | US-IMP-01…05 | **New** — `supporting-platform/import/` |
| Account-member link | US-ACC-04 | **New** — `supporting-platform/accounts/` |
| Bench list | US-VIS-06 | **New page**, existing endpoint |
| Over-allocated review | US-VIS-07 | **New page**, existing endpoint |
| Expiring contracts | US-MEM-06 | **New page**, existing endpoint |
| Navigation | — | Modified: role-conditional entries |
| `MemberDetailPage` | US-ACC-04 | Modified: shows the linked account, if any |

Per Q14:A these are **dedicated pages** rather than filter modes on existing screens. They are things
an operator goes looking for — "who is free", "who is over-booked", "whose contract is ending" — and a
filter buried in another page is not something you go to.

Unit 2 adds **no new shared component.** Everything below composes `DataTable`, `AllocationBar`,
`AllocationSegmentStrip`, `Dialog`, `FieldErrors`, `states`, `inputs` and `Button`, all built in Unit 1.
That the import result report needs no new primitive is a check on Unit 1's component library, and it
passes.

---

## 2. Directory Layout

Per the layer-first, unit-second pattern in `unit-of-work.md`:

```
frontend/src/supporting-platform/
├── import/
│   ├── ImportPage.tsx            upload, result report, template download
│   ├── ImportResultReport.tsx    counts, failures, conflicts
│   └── api.ts                    multipart POST, template GET
├── accounts/
│   ├── AccountLinkPage.tsx       list accounts, link/unlink
│   └── api.ts
└── views/
    ├── BenchPage.tsx             US-VIS-06
    ├── OverAllocatedPage.tsx     US-VIS-07
    └── ExpiringContractsPage.tsx US-MEM-06
```

`views/` sits under `supporting-platform/` even though it extends Unit 1's F-05 feature area, because
the unit boundary is what the code layout preserves. Each page imports the Unit 1 API helpers it needs
rather than duplicating them.

---

## 3. Routes Added

| Path | Component | Visible to |
|---|---|---|
| `/import` | `ImportPage` | `ADMIN` only |
| `/admin/accounts` | `AccountLinkPage` | `ADMIN` only |
| `/bench` | `BenchPage` | roles with `ALLOCATION_VIEW` read except `TEAM_MEMBER` |
| `/over-allocated` | `OverAllocatedPage` | as above |
| `/expiring-contracts` | `ExpiringContractsPage` | roles with `MEMBER` read except `TEAM_MEMBER` |

`TEAM_MEMBER` is excluded from all three list views: each is a cross-population question, and a list of
one person answers nothing. Their landing page stays `/my-assignments`.

---

## 4. The Rule That Governs All Role-Conditional Rendering

> **Hiding a control is a courtesy, never a control.** Every route above is also enforced server-side
> (§3 of `business-logic-model.md`). Navigating directly to `/import` as a `TEAM_LEAD` renders the page
> shell and the API returns **403**; the page shows that refusal rather than an empty state. FR-R-08
> requires exactly this: authorization "not solely by hiding UI elements".

A consequence worth stating: the frontend must **render a forbidden state**, not treat 403 as a bug.
Unit 1's `states.tsx` already has the error state; Unit 2 adds a distinct message for 403 so a refused
user is told they lack permission rather than shown "something went wrong".

---

## 5. F-07 Import

### 5.1 `ImportPage`

```
state:
  kind:      'MEMBER' | 'PROJECT'      -- radio, no default; forces a deliberate choice
  file:      File | null
  result:    ImportResult | null
  status:    'idle' | 'uploading' | 'done' | 'refused'
```

Flow:

```
  [1] choose what to import   (member / project)
  [2] download template  --------> text/csv, generated from the column contract (BR-IM-26)
  [3] choose a CSV file
        |
        client-side pre-check: extension is .csv, size <= 5 MB
        -> refuse immediately with the SAME message the server would give
        |
  [4] Upload  ------> POST multipart
        |
        button disabled while uploading; no second submit
        v
  [5] ImportResultReport
```

**The client-side pre-check duplicates a server rule on purpose**, and this is the one place duplication
is right: uploading 5 MB to be told the limit is 5 MB is a bad experience. The rules are the *same
message*, and the server check remains authoritative — the client check is never the enforcement
(BR-IM-01, BR-IM-02).

**No progress bar.** Q13:A made import synchronous, so there is no progress to report — only a pending
state. A fake progress bar for an operation with no observable progress is a lie about system state.

### 5.2 `ImportResultReport`

Three sections, always in this order, each rendered only when non-empty:

| Section | Content | Why separate |
|---|---|---|
| **Created** | "14 members created" | the only good news; goes first |
| **Conflicts** | line number · natural key · the existing record it matches (or the earlier line) | "already there" — the fix is to delete the row |
| **Failed** | line number · **all** reasons (BR-IM-12) | "wrong" — the fix is to correct the row |

Conflicts and failures are **not merged into one list**. They call for different corrections, and an
admin scanning 40 problems needs to know which are harmless re-runs and which are real errors.

**`ignoredColumns`** renders as a single notice: *"These columns were ignored: day_rate, po_number."*
This is how BR-M-09 stays visible — the admin learns their commercial columns did not import rather
than assuming they did.

**`NOTHING_CREATED`** renders as an explicit statement — *"No records were created. Every row either
failed or already exists."* — never as an empty success. Distinguishing this from `CREATED: 0` is the
whole reason `ImportOutcome` exists.

Per Q10:A the report is **not retrievable after leaving the page.** The page says so before the user
navigates away: *"This report is not saved. Copy anything you need."* An unsaveable report that does
not admit it is a trap.

---

## 6. `AccountLinkPage` (US-ACC-04)

`DataTable` of user accounts: username · role · home org unit · linked member (or "—").

| Action | Behaviour |
|---|---|
| **Link** | `Dialog` with a member search. On refusal, `FieldErrors` shows the named existing link (BR-L-02/03) — "Already linked to Ada Lovelace", not "conflict". |
| **Unlink** | Confirmation `Dialog`. For a `TEAM_MEMBER` account the confirmation states: *"This account will lose access to all data until it is linked again."* (BR-R-18) |

`MemberDetailPage` gains a read-only "Linked account" row — "—" when absent, which per BR-L-07 is a
complete and normal state, not a warning.

---

## 7. The Three View Pages

All three consume endpoints Unit 1 already built and tested. Each is a `DataTable` plus a date-range
control, following `AvailabilitySearchPage`'s established shape.

### 7.1 `BenchPage` (US-VIS-06) — `GET /api/allocations/unallocated`

Columns: member · org unit · role · employment type. Empty state is **positive** — *"Everyone has work
in this period."* — because an empty bench is good news, and Unit 1's generic "No results" would read
as a failed query.

### 7.2 `OverAllocatedPage` (US-VIS-07) — `GET /api/allocations/over-allocated`

One row **per offending sub-period**, not per member, matching what the endpoint returns. A member over
capacity in two separate windows appears twice, because the periods are what need fixing.

Columns: member · sub-period · total · contributing assignments. Uses `AllocationBar`, whose
over-allocation treatment already encodes the overflow three ways (distinct colour, hatched tail
breaking the track, never-clamped negative remainder).

**BR-R-13 shows up here.** For a scoped user the total includes assignments to projects outside their
org scope, and those projects are **named** (CQ1:A). Nothing is redacted, and the number is always the
member's real total. Empty state: *"No one is over capacity in this period."*

### 7.3 `ExpiringContractsPage` (US-MEM-06) — `GET /api/members/expiring-contracts`

`withinDays` input defaulting to the server's `CONTRACT_EXPIRY_WARN_DAYS` (30). Columns: member ·
vendor · contract end date · **days remaining** · current allocation.

Days-remaining is computed **from the server's date**, not the browser's, consistent with AS-03's
date-only UTC convention. A browser in a behind-UTC timezone would otherwise show "expires in 1 day"
for a contract that ended yesterday.

The row is a **flag, not an error**: an expiring contract is information, and Unit 1 already established
that a contract-window conflict is a non-blocking warning.

---

## 8. Navigation

Entries are filtered by the same permission matrix the server uses, sourced from the session — never
from a client-held role list.

| Group | Entries | Roles |
|---|---|---|
| Views | Allocations · Availability · **Bench** · **Over-allocated** · History | all but `TEAM_MEMBER` |
| People | Members · **Expiring contracts** | all but `TEAM_MEMBER` |
| Projects | Projects | all but `TEAM_MEMBER` |
| Mine | My assignments | `TEAM_MEMBER` |
| Admin | Reference data · Org units · **Accounts** · **Import** | `ADMIN` |

---

## 9. What Is NOT Built

| Not built | Why |
|---|---|
| Redaction UI for out-of-scope projects | **CQ1:A removed it.** Q4:A would have needed an "outside your visibility" block; Q3:C makes the assignment visible instead. Recorded because the earlier answer implied this component. |
| Permission-matrix admin screen | Q1:A — the matrix is a code constant. |
| Import history / past runs | Q10:A — nothing is persisted to list. |
| Import progress bar | Q13:A — synchronous; no observable progress. |
| Excel upload affordance | Q7:A — CSV only. The file input accepts `.csv` and the message names the restriction. |
| Assignment-change request form | Q6:A — deferred. |
| A combined "Attention" dashboard | Q14:A chose three dedicated pages. |

---

## 10. Testing Obligations

| Area | Must assert |
|---|---|
| Role-conditional nav | a `TEAM_LEAD` sees no Admin group **and** `/import` renders a forbidden state, not an empty one |
| Import result | `NOTHING_CREATED` renders distinctly from `CREATED` with zero rows |
| Import result | conflicts and failures render as **separate** sections |
| Import result | a row with several reasons shows **all** of them (BR-IM-12) |
| Import result | `ignoredColumns` notice appears when columns were dropped |
| Over-allocated | a scoped user's total is the **member's full total**, including out-of-scope projects (BR-R-13) |
| Bench / Over-allocated | empty states read as good news, not as failure |
| Unlink | the confirmation states that a `TEAM_MEMBER` loses all access |
| Link refusal | the existing link is **named** |

The BR-R-13 assertion is the one to write first and the one most likely to be silently wrong — a
scope-filtered sum looks entirely plausible and is exactly the failure the application exists to
prevent.

**Carried forward from Unit 1**: the ~200 React `act` warnings in the frontend suite are unresolved
(four fixes attempted, none worked; not suppressed, because suppression would hide real failures). Unit
2's tests will add to that noise. It remains a known defect, not a new one.
