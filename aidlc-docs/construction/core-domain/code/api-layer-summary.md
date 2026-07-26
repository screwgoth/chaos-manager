# API Layer Summary — `core-domain`

**Unit**: 1 of 2 · **Plan steps**: 14–17 · **Branch**: `aidlc/construction-core-domain`
**Verification**: `npx tsc --noEmit` clean · `npm test` **387 passed / 17 suites** with PostgreSQL 16 (296 passed + 91 skipped without a database) · `npm run build` produces `dist/src/server.js` · server smoke-tested live: `/health` 200, unauthenticated 401, unknown endpoint JSON 404

---

## 1. Layers, and what each is allowed to know

```
route      shape validation (Zod), presentation, HTTP status choice
  ↓        no business rules, no database access
service    derives AccessScope from the SESSION, authorizes, orchestrates
  ↓        no SQL, no transactions of its own
component  business rules, transaction boundaries, the invariants
  ↓
repository fetches; scope filters applied INSIDE queries
```

A route never touches a repository, and a component never sees an HTTP concept. The one
deliberate exception to "services own transactions" is the assignment write, where the lock
and the transaction must span the capacity check and the write (BR-A-24) — so C-03 owns it,
and `AssignmentService` only orchestrates.

## 2. Files

| File | Responsibility |
|---|---|
| `src/app.ts` | Fastify assembly, logging, error boundary, `/health`, static SPA serving |
| `src/server.ts` | Bootstrap: config → connect → migrate → seed admin → listen → signal handlers |
| `routes/error-mapper.ts` | The single response envelope (Q12:A) |
| `routes/session-middleware.ts` | cookie → token hash → identity → scope |
| `routes/schemas.ts` | Zod shape validation only |
| `routes/auth-routes.ts` | 4 routes — the only unauthenticated ones, the only cookie writer |
| `routes/member-routes.ts` | 10 routes |
| `routes/project-routes.ts` | 8 routes |
| `routes/assignment-routes.ts` | 6 routes, incl. the two-step override protocol |
| `routes/allocation-routes.ts` | 6 routes, tenths → percentages |
| `routes/admin-routes.ts` | 13 routes (reference data + org units) |
| `services/*` | S-01…S-08, plus the composition root in `services/index.ts` |

## 3. BR-R-06 is enforced structurally, not by discipline

The identity attached to a request comes **only** from a resolved session cookie. There is no
code path anywhere that reads a role, an org unit, a member id, or a scope from a header, a
query parameter, or a body. A client cannot assert who it is — only present a token.

Every service method takes a `VerifiedIdentity` and derives the scope itself. A route cannot
pass a scope in, because no service accepts one.

## 4. Two status-code decisions worth knowing

**Over-allocation returns 200, not 409.** BR-A-09 makes over-allocation a warning permitting
override, never a hard block. Step one of the two-step protocol returns `200` with
`assignment: null`, `requiresOverrideConfirmation: true`, and each offending sub-period —
having written nothing (BR-A-10). The warning *is* the successful outcome of step one; a 4xx
would tell clients otherwise and push a normal flow into error handling.

**Blocked removals return 200 with `removed: false`.** BR-C-06 and BR-O-05 refuse removal of
a referenced record and report what blocks it. The caller asked "can this go?"; the answer is
"no, and here is why, and here is the alternative". That is a successful answer to a
reasonable question.

Chosen the other way: **an out-of-scope record returns 404, not 403.** "Forbidden" would
confirm the record exists, leaking exactly what the scope filter hides. This is the route a
TEAM_MEMBER would use to probe for colleagues.

## 5. Two-step override: re-submit, not a token

The design left the protocol open ("re-submit versus a confirmation token"). **Re-submit** was
chosen:

- A token needs server-side storage with its own expiry — a second thing to get wrong.
- A stale token could authorise a save against capacity that has since changed.
- Re-submitting re-runs the check against current data, **inside the member lock**, so the
  decision the user confirmed is the decision the database sees.

`overrideOverAllocation` is accepted from the client because it is a user *decision*. What is
never accepted from the client is `savedAsOverride`, which C-03 derives from the detection
result (BR-A-11) — a test asserts that a client sending `overrideOverAllocation: true` on a
non-over-allocated save does **not** get a flagged row, since BR-A-12 would keep that flag
visible forever.

## 6. Security properties at the boundary

| Property | How |
|---|---|
| Token never readable by page JavaScript | httpOnly cookie; never in a response body (tested) |
| CSRF on cross-site POST | `sameSite: lax` |
| Session dies server-side on sign-out | `terminatedAt` set; the same cookie is then refused (tested) |
| Password change evicts other sessions | `terminateAllForUser`, plus the caller's own cookie cleared |
| No secret in any log line | `LOG_REDACT_PATHS` structurally + `redactSecrets` on error messages |
| No stack trace or SQL to the client | unrecognised errors → generic 500, real error logged (tested) |
| Query strings not logged | they can carry member ids, which are personal data |
| `/health` unauthenticated but empty | reports connectivity only; no config, versions or internals (tested) |

## 7. Defects found and fixed during Steps 14–17

| # | Defect | Found by |
|---|---|---|
| 10 | **`setNotFoundHandler` registered TWICE** — Fastify throws on the second. The server would have refused to start whenever `STATIC_DIR` pointed at a real directory, i.e. in production but not in development | self-review while wiring static assets |
| 11 | `member-service.ts` silently never written — a `cd` failure short-circuited the `&&` chain | `ls` of the services directory |
| 12 | Fastify overload resolution picked the HTTP/2 instance type, breaking every route registration | `tsc` |
| 13 | `@fastify/cookie` type augmentation absent without importing the module | `tsc` |
| 14 | `@fastify/cookie` dynamic `import()` fails under Jest's CJS VM — all 35 API tests failed | running the API suite |

Defect 10 is the one worth remembering: it was a **production-only** failure. Development
runs without built assets, so `STATIC_DIR` is absent and the second handler never registers.

`npm test` now runs Jest through `node --experimental-vm-modules` (defect 14). **`npx jest`
directly will fail on the API suite** — noted in `jest.config.js`.

## 8. Carried forward

- **`availability`'s `total` is the unfiltered member count.** When
  `minimumAvailablePercentage` is supplied, the capacity filter runs *after* the query, so the
  page may hold fewer items than `total` implies. Moving the filter into SQL would require the
  segmentation to run there — precisely what C-04's purity exists to prevent. Stated in code
  rather than silently wrong.
- **`disableRequestLogging` is deprecated** in Fastify 5 and moves to a `logController` class
  in v6. Accepted knowingly: the replacement is a lot of machinery to suppress two log lines.
  Noted in `app.ts` so the upgrade has a pointer.
- **`overAllocated` and `unallocated` fetch up to 5000 members unpaginated.** Over-allocation
  is a whole-population question — paginating it would hide problems on page two, which
  defeats a warning list. Fine at the stated scale; revisit past a few thousand members.
- **X-1 remains open.** The composition root has ONE line to change
  (`const AUTHORIZATION = new PermissiveAuthorizationStandIn()`), then the stand-in directory
  is deleted. While it stands, TEAM_LEAD and RESOURCE_MANAGER see all org units.
