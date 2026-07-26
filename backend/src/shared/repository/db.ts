/**
 * Database access. Kysely over node-postgres.
 *
 * R2-1 (data access strategy):
 *   - repositories fetch; C-04 Allocation computes. C-04 issues no queries.
 *   - scope filters are applied INSIDE queries, never as a post-fetch trim.
 *   - transaction boundaries live in the service layer, not here.
 */

import {
  Kysely,
  PostgresDialect,
  sql,
  type RawBuilder,
  type SqlBool,
  type Transaction,
} from 'kysely';
import { Pool, types as pgTypes } from 'pg';
import type { Database } from './schema';
import type { ScopeFilter } from '../types/authorization';

/**
 * CRITICAL: return SQL `date` columns as plain 'YYYY-MM-DD' strings.
 *
 * By default node-postgres parses `date` into a JS Date at LOCAL midnight, which
 * shifts the calendar date in any timezone west of UTC and silently corrupts every
 * allocation boundary. The date-only convention (shared/util/dates.ts) depends on
 * this override.
 */
const PG_DATE_OID = 1082;
pgTypes.setTypeParser(PG_DATE_OID, (value: string) => value);

/** Return bigint/int8 as a number rather than a string; our counts are small. */
pgTypes.setTypeParser(20, (value: string) => Number.parseInt(value, 10));

export type Db = Kysely<Database>;
export type DbOrTx = Db | Transaction<Database>;

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export function createDb(pool: Pool): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/** True when the filter permits everything — lets callers skip a redundant WHERE. */
export function isUnrestricted(filter: ScopeFilter): boolean {
  return filter.orgUnitIds === 'ALL' && filter.restrictToMemberId === null;
}

/**
 * Scope ROOT org-unit ids, or null for unrestricted.
 *
 * ⚠️ THESE ARE ROOTS, NOT THE EXPANDED PERMITTED SET. See `orgScopeMatches` below and
 * defect U1-D01. Repositories must expand them via `orgScopeMatches`, never use them in a
 * bare `IN`, or a Team Lead will see their own unit and none of its children.
 */
export function permittedOrgUnitIds(filter: ScopeFilter): string[] | null {
  return filter.orgUnitIds === 'ALL' ? null : filter.orgUnitIds;
}

/**
 * Expand scope roots to the set of org units they permit — INSIDE the query.
 *
 * WHY THIS EXISTS (defect U1-D01). `IAuthorizationComponent.resolveScope` is SYNCHRONOUS and
 * receives only `VerifiedIdentity.homeOrgUnitId` — a single id. BR-R-08 requires a Team Lead's
 * scope to include their unit's CHILDREN, and BR-R-09 requires a Resource Manager rooted at a
 * top-level unit to be unrestricted. Both need a database read, which a synchronous function
 * cannot perform. Rather than make the FINAL interface async — 90 call sites across 7 Unit 1
 * services — the scope carries the ROOTS and the expansion happens here, in the query that was
 * going to run anyway. Zero extra round trips, and the filter is more genuinely "inside SQL"
 * (FR-R-08, R2-1 rule 1) than an application-assembled list ever was.
 *
 * BR-R-08: id = ANY(roots) OR parent_org_unit_id = ANY(roots). Org units are exactly two levels
 * (BR-O-01), so one non-recursive level is the whole subtree — no recursive CTE needed.
 *
 * BR-R-09 is NOT handled here. A Resource Manager rooted at a top-level unit resolves to
 * `'ALL'` in the authorization component, so it never reaches this function.
 *
 * ⚠️ Passing an already-expanded list still yields a correct (superset-free) result, because
 * expanding a child adds nothing at two levels. That makes misuse safe rather than silently
 * wrong — but it is misuse, and the roots contract is what the authorization component honours.
 *
 * PARAMETERIZED (U1-NFR-SE-06): `sql.ref` quotes the column identifier and `sql.val` binds the
 * root ids as a single array parameter. No value is concatenated into SQL text.
 */
export function orgScopeMatches(
  columnRef: 'member.org_unit_id' | 'project.owning_org_unit_id',
  roots: readonly string[],
): RawBuilder<SqlBool> {
  const rootArray = [...roots];
  return sql<SqlBool>`${sql.ref(columnRef)} in (
    select id from org_unit
    where id = any(${sql.val(rootArray)}) or parent_org_unit_id = any(${sql.val(rootArray)})
  )`;
}

/**
 * BR-A-24: lock the MEMBER row before the over-allocation check, and hold it through
 * the write. The member is what has finite capacity, so it is the correct lock target.
 *
 * Without this, two concurrent writers can both pass the check and both commit,
 * producing an over-allocation that was never warned about and carries no override flag.
 * Must be called inside a transaction.
 */
export async function lockMemberForUpdate(tx: Transaction<Database>, memberId: string): Promise<void> {
  await tx
    .selectFrom('member')
    .select('id')
    .where('id', '=', memberId)
    .forUpdate()
    .executeTakeFirst();
}

export async function checkDatabase(db: Db): Promise<boolean> {
  try {
    await db.selectFrom('org_unit').select('id').limit(1).execute();
    return true;
  } catch {
    return false;
  }
}
