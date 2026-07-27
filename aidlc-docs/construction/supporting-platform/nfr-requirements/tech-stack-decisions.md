# Tech Stack Decisions — `supporting-platform` (Unit 2)

**Unit**: 2 of 2 · **Stage**: NFR Requirements

Unit 1 settled the stack. This document records only what Unit 2 **adds**, and — equally
deliberately — what it does not.

---

## 1. Inherited, Not Re-decided

| Layer | Choice | Decided at |
|---|---|---|
| Runtime | Node.js 22 LTS | Unit 1 NFR Requirements (NFR-T-02) |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | Unit 1 |
| HTTP | Fastify 5 | Unit 1 |
| Database | PostgreSQL 16 | Unit 1 (OD-01 closed) |
| Query builder | Kysely | Unit 1 |
| Validation | Zod (shape only; business rules live in components) | Unit 1 |
| Password hashing | `@node-rs/argon2` | Unit 1 (FR-AU-02) |
| Dates | `date-fns`, date-only UTC convention (AS-03) | Unit 1 |
| Frontend | React 18, Vite, TanStack Query v5, Tailwind 3, React Router 6 | Unit 1 |
| Tests | Jest + ts-jest, `@testing-library/react` | Unit 1 |
| Deployment | Docker Compose + Caddy, on-premises | Unit 1 Infrastructure Design |

**No inherited choice is revisited.** Unit 2 introduces no alternative to any of the above.

---

## 2. New Dependencies — exactly two, both backend

### 2.1 `@fastify/multipart` — file upload handling

| | |
|---|---|
| **Why needed** | The import endpoint receives a file. Fastify has no built-in multipart parser. |
| **Alternative rejected** | Base64-encoding the CSV into a JSON body. It inflates a 5 MB file to ~6.7 MB, makes `curl -F` impossible (breaking the client-agnostic property, US-ENB-04), and the encode/decode step buys nothing. |
| **Configuration** | `limits: { fileSize: 5 MB, files: 1, fields: 2 }` — matching BR-IM-02 at the framework boundary, so an oversized upload is rejected **before** the handler allocates anything. |
| **Disk** | `attachFieldsToBody` / buffer mode only. **No temp-file mode**, satisfying BR-IM-25. |
| **Scope** | Registered so the 5 MB limit applies to the **import route only** (N-Q4:A); every other route keeps Fastify's 1 MB default. |
| **Maintenance** | First-party Fastify plugin, versioned with the framework. |

### 2.2 `csv-parse` — CSV parsing

| | |
|---|---|
| **Why needed** | BR-IM-01 accepts RFC 4180 CSV: quoted fields, embedded commas and newlines inside quotes, CRLF line endings, and a tolerated UTF-8 BOM. |
| **Alternative rejected** | A hand-rolled parser (N-Q7:B). Rejected because its failure mode is **silent column shifting**, not an error: one unquoted comma in a member's name moves their email into the org-unit column, and the row then fails for a confusing reason — or, worse, validates. Real spreadsheet exports contain exactly these cases. |
| **Configuration** | `columns: true` (header-driven, order-independent per BR-IM-03), `bom: true`, `skip_empty_lines: true`, `relax_column_count: false` — a row with the wrong field count is an **error**, not silently padded. |
| **Mode** | Synchronous/buffered parse of an in-memory buffer, consistent with Q13:A's synchronous processing and BR-IM-02's 5 MB cap. No stream needed at this size. |
| **Not used for** | Writing CSV. The template (BR-IM-26) is a fixed header row that needs no serializer. |
| **Maintenance** | `csv-parse` is part of the long-established `node-csv` project, dependency-free, and widely used. |

### `relax_column_count: false` is a deliberate choice

The permissive setting silently pads short rows with empty values and truncates long ones. That converts
a malformed file into a set of plausible-looking rows with fields in the wrong places — the failure this
library was chosen to avoid. A wrong field count must fail the row and be reported (BR-IM-12).

---

## 3. Dependencies Deliberately NOT Added

| Not added | Why |
|---|---|
| **`xlsx` / `exceljs`** | Q7:A defers Excel. These carry a substantially larger parsing surface for untrusted input than a CSV parser, and `xlsx` in particular has a history of parsing advisories. **FR-I-01 remains partially satisfied** as a consequence; the gap is recorded, not hidden. |
| **A caching library** (`lru-cache`, Redis) | N-Q1:A resolves scope per request. No cache, therefore no cache dependency, no invalidation code, and no possibility of serving a stale authorization scope. |
| **A rate limiter** (`@fastify/rate-limit`) | Import is Admin-only at low-tens concurrency (N-Q8:A). Adding a limiter would be machinery for a load this deployment cannot produce. |
| **A background job runner** (BullMQ, Agenda) | Q13:A chose synchronous processing within a 2,000-row cap. A job queue would need Redis, a worker process, job-state persistence and a polling UI — for a stated need of ~200 rows. |
| **An authorization library** (CASL, Casbin, OPA) | The policy is 5 flat roles × 8 resource kinds with a two-level org tree, expressed in ~80 explicit table cells. A policy engine adds a DSL, its own evaluation semantics and a second place for authorization to be wrong. A typed constant is smaller, exhaustively checkable at compile time (U2-NFR-M-02), and readable by anyone reviewing the security model. |
| **A file-upload storage layer** (S3, MinIO, disk) | BR-IM-25 holds the file in memory for the request only. Nothing is stored, so nothing needs a store. |
| **New frontend dependencies** | The five new screens compose Unit 1's existing components. No charting, no table library, no upload widget — a plain `<input type="file">` plus `FormData` covers it. |

### The authorization-library decision, stated plainly

Reaching for CASL or OPA here would be the conventional choice and the wrong one. The requirement is
fixed by FR-R-01 to FR-R-07 — five roles, no hierarchy, no per-record sharing, no delegation. A policy
engine earns its complexity when policy changes without a deploy; Q1:A explicitly decided that changing
a permission **should** be a code change and a code review, because it is a security control. Adding an
engine would contradict the decision it was meant to serve.

---

## 4. Configuration Added

| Setting | Value | Rationale |
|---|---|---|
| `IMPORT_MAX_ROWS` | `2000` | BR-IM-02; configurable so the ceiling can be lowered if U2-NFR-P-03's measurement demands it |
| `IMPORT_MAX_BYTES` | `5242880` (5 MB) | BR-IM-02, enforced at the multipart boundary |
| Import route `bodyLimit` | 5 MB | N-Q4:A — per-route, not global |
| Request timeout for the import route | **60 s** | U2-NFR-P-03 targets < 30 s; the timeout is set to double the budget so a slow-but-succeeding import is not killed mid-transaction |
| `LOG_REDACT_PATHS` | **extended** | add any import-payload path, so a stray log of a parsed row cannot leak contents (BR-IM-24) |

**No new secret is introduced**, so `.env.example` gains no value-bearing key — only the two numeric
limits, which have safe defaults and are not secrets.

The 60 s route timeout against a 30 s budget is deliberate: a timeout that fires *during* the write
transaction would abort a request whose transaction is mid-commit. BR-IM-16 makes that safe — it rolls
back — but the user would see a failure for work that nearly succeeded, and would then re-upload. Better
to let a slow import finish and record its true duration.

---

## 5. Verification of Stack Additions

| Check | How |
|---|---|
| Both new packages are declared in `backend/package.json` | **`docker build`** — it installs from the manifest alone. This is how Unit 1 caught `@testing-library/user-event` present in `node_modules` but absent from the manifest. |
| No new frontend dependency | `frontend/package.json` diff is empty |
| Multipart limit applies to the import route only | inspect the route registration; assert a 2 MB body is refused on a non-import route |
| No temp file is created during import | list the container filesystem before and after a 5 MB import |
| CSV edge cases parse correctly | tests for quoted commas, embedded newlines, CRLF, BOM, and a wrong field count |

The `docker build` check is listed first on purpose. A dependency that works locally because it is
present in `node_modules` but missing from `package.json` is invisible to every other check, and Unit 1
shipped exactly that defect once.

---

## 6. Summary

| | Count |
|---|---|
| New backend runtime dependencies | **2** (`@fastify/multipart`, `csv-parse`) |
| New backend dev dependencies | 0 |
| New frontend dependencies | **0** |
| New database migrations | **0** — unless N-Q2:A's `EXPLAIN` measurement forces an index |
| New configuration values | 2 numeric limits, no secrets |
| Inherited choices revisited | **0** |

Two dependencies for a unit that adds file upload and CSV parsing is close to the floor. The notable
figure is the zero: no cache, no job queue, no policy engine, no storage layer, and no frontend addition
— each of which a conventional implementation of this unit would have added, and each of which was
declined against a specific decision recorded above.
