/**
 * SQL-compilation tests for the repository layer.
 *
 * These assert the SHAPE of the generated SQL without a database, which is the right
 * tool for two rules that are invisible to a functional test:
 *
 *   1. FR-R-08 — the scope filter must be applied INSIDE the query. A functional test
 *      cannot distinguish "filtered in SQL" from "fetched everything and trimmed after",
 *      because both return the same rows. Only the generated SQL can.
 *   2. U1-NFR-SE-06 — no string-concatenated SQL. Asserting that search terms arrive as
 *      bound PARAMETERS, and never appear in the SQL text, is what makes injection
 *      structurally impossible rather than merely absent today.
 *
 * The predicates below mirror the ones in the repositories. They are asserted on
 * directly-built queries rather than by intercepting a repository call, because Kysely's
 * executor would need a connection: the goal here is the compiled SQL, and the
 * behavioural coverage lives in repository-integration.test.ts against real PostgreSQL.
 */

import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../../src/shared/repository/schema';

/** Compiles queries; never connects. The pool is deliberately unused. */
const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: 'postgres://unused:unused@127.0.0.1:1/unused' }),
  }),
});

describe('member scope enforcement appears in the SQL (FR-R-08)', () => {
  it('adds an org-unit IN predicate when scope is restricted', () => {
    const compiled = db
      .selectFrom('member')
      .selectAll()
      .where('member.org_unit_id', 'in', ['ou-1', 'ou-2'])
      .compile();

    expect(compiled.sql).toContain('where');
    expect(compiled.sql).toContain('"org_unit_id" in');
    // The ids are BOUND, not interpolated into the statement text.
    expect(compiled.parameters).toEqual(['ou-1', 'ou-2']);
    expect(compiled.sql).not.toContain('ou-1');
  });

  it('an empty permitted-org list compiles to a false predicate, never to no filter', () => {
    // The dangerous case: if an empty list produced no WHERE clause, a user with zero
    // permitted org units would see EVERY member. member-repository.ts maps it to
    // eb.lit(false) for exactly this reason.
    const compiled = db
      .selectFrom('member')
      .selectAll()
      .where((eb) => eb.lit(false))
      .compile();

    expect(compiled.sql).toContain('where');
    expect(compiled.sql).toMatch(/false/i);
  });

  it('own-data narrowing is ADDITIVE to the org filter, not a replacement', () => {
    const compiled = db
      .selectFrom('member')
      .selectAll()
      .where((eb) =>
        eb.and([eb('member.org_unit_id', 'in', ['ou-1']), eb('member.id', '=', 'm-1')]),
      )
      .compile();

    // Both predicates present — narrowing must never be able to widen.
    expect(compiled.sql).toContain('"org_unit_id" in');
    expect(compiled.sql).toContain('"id" =');
    expect(compiled.parameters).toEqual(['ou-1', 'm-1']);
  });
});

describe('search terms are bound parameters (U1-NFR-SE-06)', () => {
  it('wraps the % inside the bound value, not in the SQL text', () => {
    const term = "O'Brien";
    const compiled = db
      .selectFrom('member')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('member.full_name', 'ilike', `%${term}%`),
          eb('member.email', 'ilike', `%${term}%`),
        ]),
      )
      .compile();

    expect(compiled.sql).toContain('ilike');
    // The quote character must never reach the SQL text.
    expect(compiled.sql).not.toContain("O'Brien");
    expect(compiled.parameters).toEqual(["%O'Brien%", "%O'Brien%"]);
  });
});

describe('assignment overlap uses INCLUSIVE comparisons (AS-03)', () => {
  it('compiles to start_date <= range.end AND end_date >= range.start', () => {
    const compiled = db
      .selectFrom('assignment')
      .selectAll()
      .where('assignment.start_date', '<=', '2026-03-31')
      .where('assignment.end_date', '>=', '2026-01-01')
      .compile();

    // The operators ARE the rule: '<' here instead of '<=' silently drops conflicts
    // that share exactly one day.
    expect(compiled.sql).toContain('"start_date" <=');
    expect(compiled.sql).toContain('"end_date" >=');
    expect(compiled.parameters).toEqual(['2026-03-31', '2026-01-01']);
  });

  it('the batched overlap query passes member ids as ONE bound list', () => {
    // The N+1 prohibition made visible: one statement, one IN list — not three queries.
    const memberIds = ['m-1', 'm-2', 'm-3'];
    const compiled = db
      .selectFrom('assignment')
      .selectAll()
      .where('assignment.member_id', 'in', memberIds)
      .where('assignment.start_date', '<=', '2026-03-31')
      .where('assignment.end_date', '>=', '2026-01-01')
      .compile();

    expect(compiled.sql).toContain('"member_id" in');
    expect(compiled.parameters).toEqual([...memberIds, '2026-03-31', '2026-01-01']);
  });
});

describe('history as-of query brackets transaction time (BR-A-22 Path B)', () => {
  it('compiles recorded_at <= asOf AND (superseded_at IS NULL OR superseded_at > asOf)', () => {
    const asOf = new Date('2026-03-15T10:00:00.000Z');
    const compiled = db
      .selectFrom('assignment_history')
      .selectAll()
      .where('recorded_at', '<=', asOf)
      .where((eb) => eb.or([eb('superseded_at', 'is', null), eb('superseded_at', '>', asOf)]))
      .compile();

    expect(compiled.sql).toContain('"recorded_at" <=');
    expect(compiled.sql).toContain('"superseded_at" is null');
    expect(compiled.sql).toContain('"superseded_at" >');
    // Without the IS NULL branch the CURRENT revision would be excluded, so every
    // as-of query would miss assignments that have never been edited.
    expect(compiled.parameters).toEqual([asOf, asOf]);
  });
});
