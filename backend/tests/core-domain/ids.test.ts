/**
 * Tests for identifier validation.
 *
 * These exist because of a real failure, not a hypothetical: the repository integration
 * test passed the literal 'missing-id' to findActiveIdsOfType and PostgreSQL raised
 * `invalid input syntax for type uuid`, which would have surfaced as a 500 on a request
 * carrying a malformed skill id. The guard turns that into "no such row", which is both
 * true and safe.
 */

import { isUuid, keepUuids } from '../../src/shared/util/ids';

describe('isUuid', () => {
  it('accepts canonical UUIDs in either case', () => {
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(true);
    expect(isUuid('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(true);
  });

  it('rejects the values that actually caused the failure', () => {
    expect(isUuid('missing-id')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('1')).toBe(false);
  });

  it('rejects near-misses that a looser check would let through', () => {
    // Too short in the last group.
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c330')).toBe(false);
    // Non-hex character.
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c330g')).toBe(false);
    // Missing hyphens.
    expect(isUuid('3f2504e04f8911d39a0c0305e82c3301')).toBe(false);
    // Trailing whitespace would break the SQL literal too.
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301 ')).toBe(false);
  });

  it('rejects non-strings without throwing', () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid({})).toBe(false);
  });

  it('rejects a SQL-injection-shaped string', () => {
    // Defence in depth: parameters are already bound, but an id that reaches a query
    // should never be anything but a uuid.
    expect(isUuid("' OR 1=1 --")).toBe(false);
  });
});

describe('keepUuids', () => {
  it('keeps valid ids and drops invalid ones', () => {
    const valid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    expect(keepUuids([valid, 'missing-id', '', valid])).toEqual([valid, valid]);
  });

  it('returns an empty array when nothing is valid', () => {
    // Callers treat this as "query nothing", which is correct: none of these ids can
    // match a row, so the result set is empty either way.
    expect(keepUuids(['a', 'b'])).toEqual([]);
    expect(keepUuids([])).toEqual([]);
  });
});
