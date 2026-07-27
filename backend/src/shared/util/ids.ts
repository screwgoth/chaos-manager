/**
 * Identifier validation.
 *
 * Every id in this system is a database-generated UUID, and ids reach repositories from
 * CLIENT INPUT — a path parameter, or a submitted list of skill ids. PostgreSQL rejects a
 * malformed uuid literal with `invalid input syntax for type uuid`, which surfaces as an
 * unhandled 500 rather than the 404 or field-level validation error the caller deserves.
 *
 * Guarding lookups with `isUuid` makes a malformed id behave exactly like an id that does
 * not exist, which is both truthful (it cannot match any row) and safe (no error text
 * echoing input, no 500 for a bad path parameter).
 *
 * Found by the repository integration test, not by inspection: passing 'missing-id' to
 * findActiveIdsOfType threw instead of reporting the id as absent.
 */

/** Canonical 8-4-4-4-12 hex form, any version, case-insensitive. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Keeps only the syntactically-valid ids from a caller-supplied list.
 *
 * Dropping invalid ids is correct rather than lenient: an id that cannot be a uuid
 * cannot identify a row, so excluding it from the query yields the same answer as
 * including it would have — minus the crash. Callers compare the returned set against
 * what they asked for, so every dropped id is still reported as missing.
 */
export function keepUuids(values: readonly unknown[]): string[] {
  return values.filter(isUuid);
}
