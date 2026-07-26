# Unit Test Execution

**Measured 2026-07-26.** Every number below came from running the command.

---

## 1. The one thing you must know first

**`npx jest` does not work for the API suites. Use `npm test`.**

```bash
cd backend && npm test
# which is: node --experimental-vm-modules node_modules/jest/bin/jest.js
```

`@fastify/cookie` uses a dynamic `import()` that fails inside Jest's CommonJS VM without
`--experimental-vm-modules`. Running `npx jest` directly makes all 35+ API tests fail with an error
that looks nothing like the cause. The flag lives in the `test` script for exactly this reason.

---

## 2. Run everything

### Backend — WITH PostgreSQL 16 (the full suite)

```bash
# A disposable database. The deployment's own `db` container publishes no port, deliberately,
# so do NOT expose it just to run tests — use a throwaway.
docker run -d --name chaos-test-db \
  -e POSTGRES_PASSWORD=test -e POSTGRES_USER=chaos -e POSTGRES_DB=chaos_test \
  -p 127.0.0.1:55432:5432 postgres:16-alpine

cd backend
export TEST_DATABASE_URL="postgres://chaos:test@127.0.0.1:55432/chaos_test"
npm test
```

**Measured: 501 passed / 21 suites / 0 failures, 37 s.** Verified deterministic across three
consecutive runs.

### Backend — WITHOUT a database

```bash
cd backend && npm test    # no TEST_DATABASE_URL
```

**Measured: 343 passed, 158 skipped, 21 suites (7 skipped), 8.8 s.** Also verified across three runs.

**Database-dependent suites SKIP, they do not silently pass.** That distinction is the point: a suite
that quietly passed without its database would report green while testing nothing. The
`describeDb = CONNECTION ? describe : describe.skip` idiom makes the omission visible in the output.

### Frontend

```bash
cd frontend && npm test
```

**Measured: 89 passed / 8 suites, 6.1 s.**

**590 tests across both workspaces.**

---

## 3. Coverage

**No coverage threshold is enforced, and none is claimed.** NFR-Q-01 defers the CI gate, so there is
no mechanism to enforce one. Stating a percentage here would imply a gate that does not exist.

What *is* asserted is more useful than a percentage:

| Property | Where |
|---|---|
| All 40 permission-matrix cells, table-driven | `authorization-component.test.ts` |
| Matrix exhaustiveness proven by DELETING a cell | same file |
| Org-scope enforcement proven by NEUTERING the component | `authorization-enforcement.test.ts` |
| BR-A-24 lock proven by removing the lock | `assignment-component.test.ts` (Unit 1) |
| No row contents in logs, by capturing `process.stdout` | `import.test.ts` |
| Both worked examples from the design, verbatim | `worked-examples.test.ts` (Unit 1) |

---

## 4. The verification standard this project holds to

> **A test that proves a guard must be confirmed to FAIL when the guard is removed.**

This is not a style preference. Unit 1's first BR-A-24 concurrency test — two `create` calls via
`Promise.all`, assert one fails — **passed with the lock removed**, because the calls never interleaved
at the critical point. It was deleted and replaced with one that forces the interleaving.

The same trap recurred three times in Unit 2, and each time the test was wrong before the code was:

| Test | How it was vacuous | Fix |
|---|---|---|
| BR-IM-24 "no row contents in logs" | patched `app.log.info`, but Fastify gives each request a **child** logger, so it captured **nothing** and asserted absence against an empty string | capture `process.stdout`; assert the capture WORKS before asserting absence |
| BR-IM-16 atomicity | branched on the outcome and merely warned if the database accepted the row | made unconditional |
| BR-R-12 `EXPLAIN` | ran against an **empty** table — "Seq Scan rows=0" answers nothing | populate 1,500 rows first |

**How to re-verify the X-1 enforcement claim by hand:**

```bash
# 1. Edit AuthorizationComponent.resolveScope: return orgUnitIds: 'ALL' for TEAM_LEAD.
# 2. Run:
cd backend && npm test -- tests/supporting-platform/
# 3. Expect ~16 of 83 tests to FAIL. If they all pass, the tests prove nothing — say so.
# 4. Revert.
```

Measured when done: **16 of 83 failed**.

---

## 5. If tests fail

1. **Read the actual output.** Jest names the file, line and expected-versus-received.
2. **Check whether the database is the cause.** No `TEST_DATABASE_URL` → suites *skip*; a wrong one →
   `password authentication failed`, which is a setup problem, not a code problem.
3. **Suspect the test before the code when it involves interception or measurement.** See §4 — three
   of Unit 2's nine defects were tests that were wrong.
4. **Never delete a failing assertion to go green.** If an assertion is wrong, fix it and record why
   in the test.

### Known noise

**~200 React `act` warnings** in the frontend suite, roughly one per simulated keystroke. Carried
from Unit 1; four fixes attempted (act-wrapping clicks, act-wrapping render, flushing macrotasks
inside act, `userEvent.setup()`) and none silenced them. The tests pass deterministically.

**Deliberately not suppressed** via `console.error` filtering, because that would also hide real
failures. Noise you can see beats silence you cannot audit.

**Import log lines appear in test output.** The BR-IM-24 test passes captured stdout through to the
real stream, which is what makes the capture honest. Cosmetic.
