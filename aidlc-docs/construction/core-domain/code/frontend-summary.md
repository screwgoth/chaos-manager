# Frontend Summary — `core-domain`

**Unit**: 1 of 2 · **Plan steps**: 18–22 · **Branch**: `aidlc/construction-core-domain`
**Verification**: `tsc --noEmit` clean · `jest` **63 passed / 5 suites** · `vite build` → 291 kB JS, 16.8 kB CSS · served live by the backend with a working sign-in

---

## 1. Structure

```
frontend/src/
├── shared/
│   ├── api/        client.ts (ApiClient + ApiError) · queries.ts (keys + invalidation) · types.ts
│   ├── session/    SessionProvider.tsx (useSession, RequireRole, useCanWrite)
│   ├── hooks/      lookups.ts (reference data, org units, name resolvers)
│   └── components/ AllocationBar · AllocationSegmentStrip · DataTable · Dialog ·
│                   FieldErrors/FormErrors · states · inputs · Button
├── core-domain/
│   ├── auth/         SignInPage · SessionGuard · SignOutButton
│   ├── members/      api · MemberListPage · MemberFormPage (+ContractFieldset, SkillTagEditor) · MemberDetailPage (+DeactivateMemberDialog)
│   ├── projects/     api · ProjectListPage · ProjectFormPage · ProjectDetailPage (+ProjectStaffingPanel, CloseProjectDialog)
│   ├── assignments/  api · AssignmentFormPage · OverAllocationDialog (+AssignmentConflictNotice)
│   ├── views/        AllocationViewPage · AvailabilitySearchPage · MyAssignmentsPage · HistoricalAllocationPage
│   └── admin/        ReferenceDataPage (+RetireReferenceDialog) · OrgUnitPage (+OrgUnitTree)
├── App.tsx           route map, role-based landing, shell
└── main.tsx          provider composition
```

## 2. State, exactly as Q13:A specifies

| Kind | Held in | Why not elsewhere |
|---|---|---|
| Server state | TanStack Query cache | Allocation data is server-owned and derived; caching it in a client store makes staleness the frontend's problem |
| Form state | Component `useState` | A form is the one place local state is genuinely local |
| Session | One React context | Read by almost every screen; prop-drilling it would touch every component |
| Ephemeral UI | Component local | Modal open/closed has no business leaving its component |

**No global client store.** Mutations invalidate query keys instead.

## 3. The cache invalidation map — the part that gets forgotten

An assignment change alters figures on **five** screens, only one of which the user is looking at.
Under-invalidating produces a UI that confidently shows an over-allocation the server no longer
has. Keys are hierarchical, so `['allocations']` clears every allocation query regardless of
filters — the design table's `allocations:*` wildcard made literal.

| Mutation | Invalidates |
|---|---|
| Assignment create / edit / end | `allocations`, `availability`, `assignments`, `staffing`, `member:{id}`, `project:{id}` |
| Member create / edit / deactivate | `members`, `allocations`, `availability`, `member:{id}`, `assignments` |
| Project create / edit / close | `projects`, `allocations`, `availability`, `staffing`, `project:{id}`, `assignments` |
| Reference data change | `referenceData:{type}`, **plus `members` and `projects`** |
| Org unit change | `orgUnits`, **plus `members` and `projects`** |

The last two rows look excessive and are not. BR-C-04 propagates a rename by identifier
*server-side*, but a cached page still holds the old **string** — so renaming a role would leave
the old label on screen until something else happened to refetch.

## 4. `AllocationBar` — one rule, three encodings

The design calls this "the most-seen component in the product", with speed of comprehension as
its criterion. The rule: **an over-allocated member must not look like a fully-booked one.** A bar
that simply fills to its end says "complete" — the most reassuring thing a UI can say — about the
one state that most needs attention.

So over-allocation is encoded three ways, because any single cue fails some reader:

1. **Colour** — a distinct token (`allocation-over`), not a shade of `allocation-full`.
2. **Shape** — a hatched tail breaking out *past* the track, so the bar is visibly the wrong size
   for its container. Survives greyscale and colour blindness, which colour alone does not.
3. **Number** — `120%` with `-20% left`. **Never clamped**, anywhere in the codebase.

Ten tests pin all three, including that the two colour tokens cannot converge.

`AllocationSegmentStrip` is the time dimension of the same story: segment widths are proportional
to their share of the range in days, so the strip reads as a calendar. It reuses the same hatching
for over-allocated segments, so the two components speak one visual language.

## 5. Security posture — what the frontend does and does not do

> ⚠️ **The frontend enforces nothing.** `RequireRole` and `useCanWrite` exist to avoid showing
> people buttons that will fail. The role in the session context came from the server, but a user
> can edit it in devtools in five seconds.

Every rule is enforced server-side, and `api.test.ts` proves a TEAM_MEMBER calling the API
directly is refused on six separate routes — with a control asserting an ADMIN *does* see both
members, so the refusals cannot pass vacuously.

Structural properties that do hold client-side:

- **The token is never readable by page JavaScript**: it lives only in an httpOnly cookie and is
  never placed in a response body (asserted by test).
- **`MyAssignmentsPage` has no route parameter.** It resolves through the session, so it is
  structurally incapable of displaying another member — on top of the server's refusal.
- **`queryClient.clear()` on sign-in and sign-out**, not invalidate. Leaving the previous user's
  member list in memory would let it flash on screen before the refetch lands.
- **The 401 handler excludes `/api/auth/login` and `/api/auth/session`.** A 401 there is an
  *answer*, not an expiry; including them would loop the sign-in page against itself.

## 6. Interaction decisions worth knowing

| Decision | Reason the alternative is worse |
|---|---|
| Over-allocation is a **blocking modal** (Q14:A) | An inline warning beside a save button gets clicked past, and this decision affects other people's projects |
| Conflicts (BR-A-13/14) are **inline and non-blocking** | Assigning a contractor past their contract end is often deliberate; blocking would force a contract edit first |
| Filter drafts apply **on submit** | A request per keystroke against a scoped joined query, and intent is unknowable mid-word |
| Lookups fetch inactive; **pickers** filter to active | A retired role must still resolve for the member holding it (BR-C-05) without being offered anew |
| Deactivate dialog states the **count** and that reactivation won't restore | BR-M-13's cascade changes other people's plans; BR-M-15 is the part users assume wrongly |
| Close dialog **lists** the affected assignments | A silent close is indistinguishable from data loss to whoever's work vanished |
| Retire dialog offers **deactivation** when delete is refused | A bare "cannot delete" leaves the admin at a dead end |
| Org unit tree renders two levels **literally**, no recursion | BR-O-01 becomes visible in the UI rather than only enforced on submit |
| `data-testid` uses **entity ids** | An index breaks on sort, filter and insert — and silently starts asserting against a different record |

## 7. Defects found during Steps 18–22

| # | Defect | Found by |
|---|---|---|
| 15 | Test stub used `new Response(...)`, but **jsdom has no `Response` global** — the ReferenceError surfaced as the component's generic fallback, so the test appeared to prove the component ignored the server's message | running the sign-in suite, then a throwaway probe that logged the actual thrown constructor |
| 16 | Two assertions matched too loosely (`getByText('120%')` matched both the headline and the sub-period row) | the same run |
| 17 | A test helper rendered twice in one test without `cleanup()`, so every query matched two mounted trees | the same run |

Defect 15 is the instructive one: my first hypothesis was a downlevel-target `instanceof`
failure — plausible and wrong. The probe disproved it in one run. **A test that fails for the
wrong reason sends the fix into the wrong file.**

## 8. Carried forward

- **No screen has been visually verified.** Playwright has no Chromium in this environment, so
  layout, spacing and colour rendering are unchecked. The `AllocationBar` overflow treatment is
  asserted by CSS class and accessible text, not by appearance. **This is the largest open gap in
  the frontend.**
- **React `act` warnings, ~one per keystroke.** Four fixes attempted (act-wrapping clicks,
  act-wrapping the render, flushing macrotasks inside act, moving to `userEvent.setup()`); none
  silenced them. Tests pass deterministically. Not suppressed via `console.error`, which would
  hide real failures too.
- **`MemberListPage` fetches allocations with `limit: 200`** to annotate the visible page. Fine at
  the stated scale; a member count in the thousands needs the allocation figures folded into the
  member query instead.
- **Bundle is 291 kB (86 kB gzipped)**, unsplit. Acceptable for an internal tool on a LAN; route-level
  code splitting is the first thing to try if first paint matters later.
