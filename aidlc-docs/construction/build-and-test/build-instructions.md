# Build Instructions

**Scope**: both units. `core-domain` and `supporting-platform` are modules inside ONE deployable, so
there is no per-unit build — one backend build and one frontend build cover both.

Every command below was executed on 2026-07-26 and the timings are real.

---

## Prerequisites

| | |
|---|---|
| **Node.js** | 22 LTS (`node -v` → v22.19.0 as measured) |
| **npm** | 10.x (10.9.3 as measured) |
| **Docker** | with Compose v2, for the container build and for running the stack |
| **PostgreSQL 16** | only for the database-backed tests; the app's own container brings its own |
| **Disk** | ~600 MB for both `node_modules` trees plus ~310 MB for the runtime image |
| **Memory** | 2 GB is comfortable |

**No environment variables are required to BUILD.** They are required to *run* — see `.env.example`
and the README. This matters: a build that needed secrets could not run in CI.

---

## Build Steps

### 1. Install dependencies

Use `npm ci`, not `npm install`. `ci` installs strictly from the lockfile and **fails** if
`package.json` and the lockfile disagree — which is exactly the check you want, and is how a missing
declaration gets caught.

```bash
cd backend  && npm ci     # measured: 11.0 s
cd ../frontend && npm ci  # measured:  8.1 s
```

> **Why this step is a real check, not a formality.** Unit 1 shipped a defect where
> `@testing-library/user-event` was present in `node_modules` but absent from `package.json`. It
> worked locally and failed the moment anything installed from the manifest alone. A clean
> `npm ci` — or `docker build` — is the only thing that catches it.

**Expected audit output**: `npm ci` reports high-severity advisories against `kysely@0.27.5`. See
`security-test-instructions.md` §3 — all three were verified **not reachable** in this codebase.
This is a known, documented acceptance, not an oversight.

### 2. Build the backend

```bash
cd backend && npm run build    # tsc; measured: 5.5 s
```

**Artifacts**: `backend/dist/src/**` and `backend/dist/migrations/**`.

**Verify no test files leaked into the build** — the production `tsconfig` excludes them, which is
what stops the release artifact depending on devDependencies:

```bash
ls backend/dist/src/server.js          # must exist
find backend/dist -name '*.test.js'    # must be EMPTY
```

### 3. Build the frontend

```bash
cd frontend && npm run build   # vite; measured: 10.3 s total, 3.2 s in vite
```

**Artifacts**: `frontend/dist/` — `index.html`, one JS bundle, one CSS bundle.

**Measured sizes**:

| Asset | Raw | Gzipped |
|---|---|---|
| JS | 308.82 kB | **90.33 kB** |
| CSS | 18.52 kB | 4.22 kB |

The bundle is **unsplit**, deliberately: for an internal tool on a LAN, 90 kB gzipped over one
request beats code-splitting complexity.

### 4. Build the container (this is the authoritative build)

```bash
docker build -t chaos-manager .        # measured: ~4 s warm, ~2 min cold
```

Three stages: backend build, frontend build, runtime. **This is the build that matters** — it
installs from the manifests alone, so it proves what a fresh clone would do.

**Verify the runtime image**:

```bash
# Runs unprivileged
docker run --rm --entrypoint sh chaos-manager -c 'id'
# → uid=1000(node) gid=1000(node)

# No build tooling shipped
docker run --rm --entrypoint sh chaos-manager -c 'ls node_modules/.bin/jest node_modules/.bin/tsc 2>/dev/null || echo none'
# → none

# ⚠️ The authorization stand-in must be ABSENT — verified in the IMAGE, not the source tree.
# A source-tree check does not prove it is gone from an image built earlier.
docker run --rm --entrypoint sh chaos-manager -c "find /app -iname '*authorization-standin*'"
# → (empty)
```

### 5. Verify the composed stack

```bash
docker compose config >/dev/null && echo valid
docker compose config | grep -c published    # must be 2 — ports 80 and 443 ONLY
```

---

## Expected output and acceptable warnings

| Output | Acceptable? |
|---|---|
| `tsc` prints nothing | ✅ that is success |
| `vite` reports bundle sizes | ✅ |
| `npm ci` reports kysely advisories | ✅ documented, not reachable |
| A Fastify deprecation notice about `disableRequestLogging` | ✅ known; moves to `logController` in Fastify 6 |
| **Any `tsc` error** | ❌ the build is broken |
| **`npm ci` reporting a lockfile mismatch** | ❌ a dependency was added without committing the lockfile |

---

## Troubleshooting

### `npm ci` fails: "lockfile does not satisfy package.json"

**Cause**: a dependency was added with `npm install` but `package-lock.json` was not committed.
**Fix**: run `npm install` locally, commit **both** files, re-run `npm ci`.

### `tsc` fails with errors in `node_modules`

**Cause**: mismatched `@types` versions, usually after a partial install.
**Fix**: `rm -rf node_modules && npm ci`. Never patch a type error inside `node_modules`.

### `docker build` fails pulling a base image with 403

**Cause**: registry access, not the build. This happened during development.
**Fix**: retry on a network that can reach the registry. For local testing without the proxy image,
`docker-compose.no-tls.yml` exists — read its header first, it removes TLS.

### Frontend build fails on a missing module that exists locally

**Cause**: the classic undeclared-dependency defect. It resolves from `node_modules` locally and
fails in a clean install.
**Fix**: add it to `package.json` explicitly, commit the lockfile, verify with `docker build`.

### `tsc` succeeds but the container will not start

**Cause**: almost always configuration, not compilation. Startup validates every variable and fails
fast, naming all missing ones at once.
**Fix**: read the first log line — `docker compose logs app`. Compare against `.env.example`.
