# C.H.A.O.S

**Centralized Hub for Aligning Organizational Squads.**

People move between projects constantly, and nobody can answer "who is free next month?" without
asking three other people first. C.H.A.O.S tracks who is allocated to what, how much, and when —
and tells you when someone is booked past their capacity.

It is deliberately **team-type agnostic**. Nothing in it assumes software: an Ops team, a Sales
team and an Engineering team all have people, projects and percentages. Roles, skills and project
types are lists you manage, not values baked into the code.

---

## What it does

- **People** — on-roll staff and off-roll contractors, with contract windows for the latter.
  No rates, contract values or PO numbers are stored (out of scope by decision, not by omission).
- **Projects** — code, owner, planned window, and who is on them.
- **Assignments** — a person on a project at a percentage, over an inclusive date range. Several
  concurrent assignments to the same project are allowed and sum normally.
- **Allocation** — who is booked, how much, and **when**. A person at 60% across a quarter might be
  at 100% for two weeks of it; the system shows the sub-periods rather than an average.
- **Over-allocation** — a *warning* you can override deliberately, never a hard block. Overrides
  stay visibly flagged.
- **History** — what the plan looked like on a past date, reconstructed from what the system
  actually believed at the time.

## Requirements

- Docker and Docker Compose (the only requirement for running it)
- For development: Node.js 22 LTS and a PostgreSQL 16 you can reach

## First run

```bash
git clone <repo> /opt/chaos-manager
cd /opt/chaos-manager

cp .env.example .env
```

Now **edit `.env`**. At minimum set:

| Variable | Set it to |
|---|---|
| `POSTGRES_PASSWORD` | a long random string |
| `CHAOS_HOSTNAME` | your hostname, or leave `localhost` for a LAN/laptop deployment |
| `INITIAL_ADMIN_USERNAME` | the first administrator's username |
| `INITIAL_ADMIN_PASSWORD` | a strong password, **at least 12 characters** |

Then:

```bash
docker compose build
docker compose up -d
docker compose logs -f app     # watch for "migrations applied" and "listening"
```

Open `https://<CHAOS_HOSTNAME>` and sign in.

> With `CHAOS_HOSTNAME=localhost`, Caddy issues a certificate from its own local CA, so your
> browser will warn once. With a real hostname it obtains a Let's Encrypt certificate
> automatically, and there is no warning.

### Immediately after your first sign-in

1. Change the administrator password.
2. **Remove `INITIAL_ADMIN_PASSWORD` from `.env`** and run `docker compose up -d` again.

The bootstrap account is created **only when no accounts exist at all**, so a lingering value
cannot silently reset a real password — but a secret sitting in `.env` is a secret in your shell
history, your backups and your deployment notes.

### What the first run creates

- One org unit, named **Organisation** — rename it to your department.
- Four starter roles: Team Member, Team Lead, Manager, Specialist.
- Three starter project types: Project, Internal Initiative, Support.
- **No skills.** A skill list is entirely organisation-specific, and any guess would be wrong for
  most teams. Add yours under **Lists → Skills**.

All of these are examples to rename, not a taxonomy you are stuck with. The seed is idempotent and
never re-adds something you deleted.

## Day-to-day operation

```bash
docker compose ps                    # what is running, and health status
docker compose logs -f app           # application log (one line per request)
docker compose restart app           # after changing .env
docker compose exec db psql -U chaos -d chaos    # a database shell
```

### Updating

```bash
cd /opt/chaos-manager
git pull
docker compose build
docker compose up -d
```

Migrations run automatically at startup, **before** the app accepts traffic. If a migration fails
the app refuses to start rather than serving against a half-upgraded schema — check
`docker compose logs app` and fix forward.

### Backup

```bash
docker compose exec -T db pg_dump -U chaos -d chaos --clean --if-exists \
  | gzip > "chaos-$(date +%F).sql.gz"
```

Restore:

```bash
gunzip -c chaos-2026-07-26.sql.gz | docker compose exec -T db psql -U chaos -d chaos
```

Test a restore before you need one. A backup you have never restored is a hypothesis.

### ⚠️ `docker compose down -v` DELETES YOUR DATA

`down` alone stops the containers and keeps everything. **`down -v` also removes the named
volumes**, which is where the entire database lives. There is no undo and no confirmation prompt.

```bash
docker compose down          # safe: stops containers, data intact
docker compose down -v       # DESTROYS the database and all TLS certificates
```

Take a backup before any command with `-v` in it.

## Ports and exposure

Only **80** and **443** are published, both on the proxy. The application (3000) and PostgreSQL
(5432) are reachable **only** on the internal Docker network.

Do not add `ports:` to the `db` service, not even temporarily. Use
`docker compose exec db psql` instead — it needs no published port at all.

## Local development

Two processes, with the frontend proxying `/api` to the backend:

```bash
# Terminal 1 — a database
docker run -d --name chaos-dev-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=chaos postgres:16-alpine

# Terminal 2 — backend on :3000
cd backend
npm install
DATABASE_URL=postgres://postgres:devpassword@localhost:5432/chaos \
  INITIAL_ADMIN_USERNAME=admin INITIAL_ADMIN_PASSWORD=dev-password-12345 \
  SESSION_COOKIE_SECURE=false npm run dev

# Terminal 3 — frontend on :5173
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### Tests

```bash
cd backend  && npm test      # 387 tests; the integration suites need a database (see below)
cd frontend && npm test      # 63 tests
```

**Use `npm test`, not `npx jest`.** Jest needs `--experimental-vm-modules` for `@fastify/cookie`'s
dynamic import, and the npm script supplies it. `npx jest` fails on the API suite.

The database-backed suites are **skipped** unless `TEST_DATABASE_URL` is set:

```bash
docker run -d --name chaos-test-db -p 55432:5432 \
  -e POSTGRES_PASSWORD=testpw -e POSTGRES_DB=chaos_test postgres:16-alpine

cd backend
TEST_DATABASE_URL='postgres://postgres:testpw@localhost:55432/chaos_test' npm test
```

> Those suites **drop and recreate the `public` schema**. Point them only at a throwaway database.

## Configuration

Every variable is documented in `.env.example`. The application **fails fast at startup** and names
*every* missing required variable at once, rather than failing on the first request that needs one.

Notable settings:

| Variable | Default | Notes |
|---|---|---|
| `SESSION_IDLE_MINUTES` | 30 | Sliding inactivity timeout, not total session age |
| `SESSION_COOKIE_SECURE` | true | Must stay true wherever TLS terminates in front of the app |
| `ARGON2_MEMORY_KIB` | 19456 | OWASP minimum floor. Raising it does not invalidate existing passwords |
| `CONTRACT_EXPIRY_WARN_DAYS` | 30 | Horizon for the expiring-contracts view |

## Architecture, briefly

One Node process serves both the JSON API and the built SPA, behind Caddy for TLS.

```
browser ──HTTPS──> Caddy ──HTTP──> Fastify (API + static SPA) ──> PostgreSQL
                   :80/:443        :3000 (internal)              :5432 (internal)
```

Inside the backend: **route → service → component → repository**. Routes validate shape only;
business rules live in components; scope filters are applied inside SQL queries so out-of-scope
rows are never fetched.

## Loading data from a spreadsheet

Admin only. **Order matters** — import matches names and never creates vocabulary, so anything it
references must exist first:

1. **Admin → Org units** — create your org structure (two levels: units and their children).
2. **Admin → Lists** — create the roles, skills and project types your file uses.
3. **Import** — choose People or Projects, download the template, fill it in, upload it.

CSV only (see limitations). The template lists every column and which are required, and it is
generated from the same definition the parser uses, so a downloaded template always imports.

**Re-running an import is safe.** Existing records are reported as conflicts rather than duplicated,
so if you are unsure whether a file went through, upload it again — the worst case is a report full
of conflicts and nothing created.

Two things the report tells you that are easy to miss:

- **Ignored columns.** Anything not in the template is skipped and named back to you. If your export
  had a rate or PO column, it did **not** import — there is no field for it in this phase.
- **Nothing is saved.** The report exists only on screen. Copy anything you need before navigating
  away.

If every row fails on an org unit or role, you skipped steps 1–2.

## Known limitations in this phase

- **CSV only — Excel is not supported.** Open an `.xlsx` and "Save As" a `.csv` first. This leaves
  requirement FR-I-01 partially satisfied and is recorded as such rather than counted as delivered.
- **An import leaves no audit trail.** Row counts and failure reasons are logged; who imported what
  is not reconstructable afterwards.
- **Team Leads cannot request assignment changes.** They have read access within their org unit and
  no write path at all; the "request a change" flow is deferred.
- **A new *root* org unit needs a restart** before a Resource Manager attached to it gets
  organisation-wide visibility. Until then they see their own subtree — it under-grants, never
  over-grants.
- **Capacity is fixed at 100% per person.** Part-time and fractional capacity are not modelled.
- **No automated CI gate.** Tests exist and pass; nothing yet stops a commit that breaks them.
- **No screen has been visually verified.** The UI typechecks, builds, is unit-tested and is served
  correctly, but no browser has rendered it during development.

### Now enforced (was a limitation in the previous phase)

**Org-scope visibility.** A Team Lead and a Resource Manager attached to a child org unit see only
their own unit and its children. An account of either role with **no** org unit assigned sees
**nothing** — that is deliberate fail-closed behaviour, and it looks exactly like a broken account, so
check `home_org_unit_id` before assuming a bug.

One deliberate exception worth knowing: a Team Lead **can** see people from other org units when
those people are staffed on a project their unit owns. You cannot staff a project you own without
seeing who is on it.

## Documentation

| Document | What it covers |
|---|---|
| `aidlc-docs/construction/core-domain/code/api-documentation.md` | Every endpoint, with request and response shapes |
| `aidlc-docs/construction/core-domain/code/business-logic-summary.md` | The allocation algorithm, bi-temporality, every rule decision |
| `aidlc-docs/construction/core-domain/code/api-layer-summary.md` | HTTP layer, status-code choices, security posture |
| `aidlc-docs/construction/core-domain/code/frontend-summary.md` | SPA structure, cache invalidation, the allocation bar |
| `aidlc-docs/construction/core-domain/code/repository-layer-summary.md` | Data access, the N+1 prohibition, scope filtering |
| `aidlc-docs/inception/requirements/requirements.md` | The 59 functional requirements |
