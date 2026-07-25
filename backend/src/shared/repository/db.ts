/**
 * Database access. Kysely over node-postgres.
 *
 * R2-1 (data access strategy):
 *   - repositories fetch; C-04 Allocation computes. C-04 issues no queries.
 *   - scope filters are applied INSIDE queries, never as a post-fetch trim.
 *   - transaction boundaries live in the service layer, not here.
 */

import { Kysely, PostgresDialect, type Transaction } from 'kysely';
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
 * Org-unit ids the filter permits, or null for unrestricted.
 * Repositories use this to add a WHERE clause; they must never fetch-then-trim.
 */
export function permittedOrgUnitIds(filter: ScopeFilter): string[] | null {
  return filter.orgUnitIds === 'ALL' ? null : filter.orgUnitIds;
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
