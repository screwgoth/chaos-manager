# DEFECT U1-D01 — `IAuthorizationComponent.resolveScope` cannot resolve a real org scope

**Found**: 2026-07-26, Unit 2 Code Generation Step 2
**Origin**: Unit 1, `shared/types/authorization.ts` (X-1 interface design)
**Severity**: Blocks Step 2. The X-1 stand-in pattern did **not** fully achieve what it was built for.
**Status**: OPEN — awaiting a decision between the three options in §4

---

## 1. The Defect

`IAuthorizationComponent` declares:

```ts
resolveScope(identity: VerifiedIdentity): AccessScope;   // SYNCHRONOUS
```

`VerifiedIdentity` carries `homeOrgUnitId` — a **single** org unit id. But `AccessScope.orgUnitIds` is
consumed by the repositories as an **expanded list** of permitted units:

```ts
// member-repository.ts:77
(eb) => eb('member.org_unit_id', 'in', orgIds)
```

BR-R-08 requires a Team Lead's scope to be their home unit **plus its children**, and BR-R-09 requires a
Resource Manager to be organisation-wide **when their home unit is a root**. Both need data the identity
does not carry:

| Needed | Available synchronously? |
|---|---|
| the children of `homeOrgUnitId` | **No** — requires a query |
| whether `homeOrgUnitId` is a root unit | **No** — requires reading `parent_org_unit_id` |

**A synchronous function cannot do either.** The interface is shaped around what a *permissive*
stand-in needed — no I/O, because it returned `'ALL'` — rather than around what the real component needs.

## 2. Why the stand-in pattern did not catch this

This is the honest lesson. Unit 1 built the stand-in, verified that Unit 1 compiled and ran against it,
and concluded the interface was adequate. But a permissive stand-in exercises the *shape* of an interface
without exercising its *requirements*. The stand-in's own code says so, unwittingly:

```ts
// authorization-standin.ts:65-69
// ⚠️ THE GAP: the real component resolves this from the user's home org unit and its
// subtree (OrgUnitComponent.resolveScope already computes exactly that — it is
// deliberately NOT called here ...)
```

`OrgUnitComponent.resolveScope` is **async**. The comment names the exact call the real component must
make, and does not notice that the interface it sits behind cannot make it.

## 3. Blast radius, measured

| Metric | Count | Command |
|---|---|---|
| Call sites of `scopeFor` / `filterFor` / `filterForIdentity` / `resolveScope` | **90** | `grep -rn` over `backend/src` |
| Service files affected if the interface goes async | **7** | `member-service` 21, `reference-data-service` 16, `project-service` 16, `assignment-service` 15, `allocation-query-service` 13, `access-control-service` 3, `auth-service` 2 |
| Repository sites consuming the expanded org id list | **7** | `member-repository` ×2, `project-repository` ×2, `assignment-repository` ×2, `org-unit-repository` ×1 |

**The approved plan's Step 4 verification — "`git diff --stat` over `core-domain/` shows only
`services/index.ts`" — is unachievable under Option A below.** That is precisely why this is recorded as a
defect rather than absorbed.

## 4. Options

### Option A — make the interface async

```ts
resolveScope(identity: VerifiedIdentity): Promise<AccessScope>;
```

| | |
|---|---|
| Interface `shared/types/authorization.ts` | **CHANGED** — violates the FINAL constraint |
| Unit 1 call sites | **~90 across 7 service files** need `await` |
| Step 4 verification | **Fails** — large Unit 1 diff |
| Extra query per request | 1 |
| Honesty | Highest — the interface says what it does |

This is the rework the stand-in pattern existed to prevent, paid in full. It is also the least surprising
end state for a future reader.

### Option B — expand the subtree **inside SQL** (recommended)

`AccessScope.orgUnitIds` / `ScopeFilter.orgUnitIds` carry the **scope roots** rather than the expanded
set. The repositories expand in the query they were already going to run:

```sql
-- instead of:  member.org_unit_id IN ($1, $2, ...)
member.org_unit_id IN (
  SELECT id FROM org_unit WHERE id = ANY($roots) OR parent_org_unit_id = ANY($roots)
)
-- and BR-R-09's root test, also in SQL:
OR EXISTS (SELECT 1 FROM org_unit h WHERE h.id = ANY($roots) AND h.parent_org_unit_id IS NULL)
```

| | |
|---|---|
| Interface | **UNCHANGED** — shape and synchrony both preserved |
| Unit 1 service call sites | **0** |
| Files changed | **3 repositories** in `shared/` — which `unit-of-work.md` explicitly assigns to Unit 2 as "C-11 extensions — scope-filter application inside queries" |
| Extra query per request | **0** — the expansion rides inside the existing query |
| Step 4 verification | **Passes** — `core-domain/` still shows only `services/index.ts` |
| Alignment with FR-R-08 / R2-1 rule 1 | **Stronger** than the original design — the filter is now genuinely applied inside SQL rather than assembled in the application and passed in |

**The cost, stated plainly.** It changes the *meaning* of `orgUnitIds` from "the permitted units" to "the
roots of the permitted scope" without changing its *type*. A future reader who passes an already-expanded
list gets a superset, not an error. That degradation is safe in this schema — org units are exactly two
levels (BR-O-01), so expanding an already-expanded list adds nothing — but the semantics must be
documented loudly in the type's comment or it becomes a trap.

### Option C — in-memory org-tree snapshot

`resolveScope` stays synchronous and reads a process-local snapshot of the org tree, refreshed on org-unit
writes.

| | |
|---|---|
| Interface | UNCHANGED |
| Unit 1 call sites | 0 |
| Repositories | unchanged |
| Extra query per request | 0 |
| Cost | **Reintroduces the cache that N-Q1:A explicitly declined**, and puts cache-invalidation code in the component where being wrong is least acceptable. A missed invalidation is a silent authorization error. |

## 5. Recommendation

**Option B.** It is the only option with no interface change, no Unit 1 service churn, no cache and no
extra round trip — and it moves scope enforcement *further* inside SQL, which is the direction FR-R-08
and R2-1 rule 1 already point. Its single real cost is a semantic reinterpretation of a shared type,
which is containable with an emphatic comment and a test asserting the subtree behaviour.

Option A is the more *honest* design and would be right if the interface were not declared FINAL and if
90 call sites did not sit behind it. Option C is rejected on the same grounds N-Q1:A rejected caching.

## 6. What must be recorded regardless of the choice

The X-1 stand-in pattern is reported in Unit 1's artifacts as a success. It was **partially** successful:
it kept Unit 1 building and demonstrable without Unit 2, which was its primary purpose. It did **not**
validate that the interface could support the real implementation, because a permissive stand-in returns
a constant and therefore never needs the data the real component needs.

**The transferable lesson**: a stand-in that is deliberately trivial cannot validate an interface. To do
that, the stand-in would have had to be *restrictive* — plan option Q6:B — because a restrictive stand-in
must compute a real scope and would have hit this wall during Unit 1, when the interface was still cheap
to change.
