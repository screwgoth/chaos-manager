/**
 * Migration 001 — initial schema for `core-domain`.
 *
 * Forward-only (U1-NFR-M-08). There is no `down` migration: recovery from a bad
 * migration is restore-from-dump, not a rollback script (deployment-architecture.md
 * section 5). A `down` is provided ONLY for local development convenience and is not
 * part of the production recovery path.
 *
 * Database constraints here are not belt-and-braces. With no automated test suite in
 * Phase 1 (NFR-Q-01), they are the only mechanism that catches a rule violation the
 * application logic missed — U1-NFR-R-06 states this as a requirement.
 */

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);

  // --- org_unit: exactly two levels (BR-O-01) -----------------------------
  await db.schema
    .createTable('org_unit')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(120)', (c) => c.notNull())
    .addColumn('parent_org_unit_id', 'uuid', (c) => c.references('org_unit.id'))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('org_unit_no_self_parent', sql`parent_org_unit_id IS NULL OR parent_org_unit_id <> id`)
    .execute();

  // Unique name among siblings, case-insensitive (BR-O-02). Two partial indexes are
  // needed because NULL parent values do not compare equal in a plain unique index.
  await sql`
    CREATE UNIQUE INDEX org_unit_name_unique_root
      ON org_unit (lower(name)) WHERE parent_org_unit_id IS NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX org_unit_name_unique_child
      ON org_unit (parent_org_unit_id, lower(name)) WHERE parent_org_unit_id IS NOT NULL
  `.execute(db);

  // Enforce the two-level rule in the database: a unit with a parent may not itself
  // be a parent. Application rule BR-O-01 is backed here so it cannot be bypassed.
  await sql`
    CREATE OR REPLACE FUNCTION org_unit_enforce_two_levels() RETURNS trigger AS $$
    BEGIN
      IF NEW.parent_org_unit_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM org_unit p
                   WHERE p.id = NEW.parent_org_unit_id AND p.parent_org_unit_id IS NOT NULL) THEN
          RAISE EXCEPTION 'org_unit hierarchy is limited to two levels';
        END IF;
      END IF;
      IF NEW.parent_org_unit_id IS NULL AND EXISTS (
           SELECT 1 FROM org_unit c WHERE c.parent_org_unit_id = NEW.id) THEN
        RETURN NEW;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER org_unit_two_levels
      BEFORE INSERT OR UPDATE ON org_unit
      FOR EACH ROW EXECUTE FUNCTION org_unit_enforce_two_levels()
  `.execute(db);

  // --- reference_data_entry: roles, skills, project types (FR-C-02) -------
  await db.schema
    .createTable('reference_data_entry')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('reference_type', 'varchar(20)', (c) => c.notNull())
    .addColumn('name', 'varchar(120)', (c) => c.notNull())
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      'reference_type_valid',
      sql`reference_type IN ('ROLE','SKILL','PROJECT_TYPE')`,
    )
    .execute();
  await sql`
    CREATE UNIQUE INDEX reference_data_type_name_unique
      ON reference_data_entry (reference_type, lower(name))
  `.execute(db);

  // --- member: on-roll and off-roll in ONE entity (FR-M-02) --------------
  await db.schema
    .createTable('member')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('external_ref', 'varchar(64)')
    .addColumn('full_name', 'varchar(200)', (c) => c.notNull())
    .addColumn('email', 'varchar(254)', (c) => c.notNull())
    .addColumn('org_unit_id', 'uuid', (c) => c.notNull().references('org_unit.id'))
    .addColumn('employment_type', 'varchar(10)', (c) => c.notNull())
    .addColumn('role_id', 'uuid', (c) => c.notNull().references('reference_data_entry.id'))
    .addColumn('status', 'varchar(10)', (c) => c.notNull().defaultTo('ACTIVE'))
    .addColumn('deactivated_on', 'date')
    .addColumn('vendor_name', 'varchar(200)')
    .addColumn('contract_start_date', 'date')
    .addColumn('contract_end_date', 'date')
    .addColumn('contract_status', 'varchar(60)')
    // BR-C-09: reserved for Phase 2 custom fields. Unused in Phase 1.
    .addColumn('attributes', 'jsonb', (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('member_employment_type_valid', sql`employment_type IN ('ON_ROLL','OFF_ROLL')`)
    .addCheckConstraint('member_status_valid', sql`status IN ('ACTIVE','INACTIVE')`)
    // BR-M-06: off-roll members must carry contract fields.
    .addCheckConstraint(
      'member_offroll_requires_contract',
      sql`employment_type <> 'OFF_ROLL' OR (
            vendor_name IS NOT NULL AND contract_start_date IS NOT NULL
            AND contract_end_date IS NOT NULL AND contract_status IS NOT NULL)`,
    )
    // BR-M-08
    .addCheckConstraint(
      'member_contract_date_order',
      sql`contract_start_date IS NULL OR contract_end_date IS NULL
          OR contract_end_date >= contract_start_date`,
    )
    .execute();
  await sql`CREATE UNIQUE INDEX member_email_unique ON member (lower(email))`.execute(db);
  await sql`
    CREATE UNIQUE INDEX member_external_ref_unique
      ON member (external_ref) WHERE external_ref IS NOT NULL
  `.execute(db);
  await sql`CREATE INDEX member_org_status_idx ON member (org_unit_id, status)`.execute(db);
  await sql`CREATE INDEX member_role_idx ON member (role_id)`.execute(db);
  await sql`
    CREATE INDEX member_contract_expiry_idx
      ON member (employment_type, contract_end_date) WHERE employment_type = 'OFF_ROLL'
  `.execute(db);

  // --- member_skill ------------------------------------------------------
  await db.schema
    .createTable('member_skill')
    .addColumn('member_id', 'uuid', (c) => c.notNull().references('member.id').onDelete('cascade'))
    .addColumn('skill_id', 'uuid', (c) => c.notNull().references('reference_data_entry.id'))
    .addPrimaryKeyConstraint('member_skill_pk', ['member_id', 'skill_id'])
    .execute();
  await sql`CREATE INDEX member_skill_by_skill_idx ON member_skill (skill_id, member_id)`.execute(db);

  // --- project ----------------------------------------------------------
  await db.schema
    .createTable('project')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('code', 'varchar(40)', (c) => c.notNull())
    .addColumn('name', 'varchar(200)', (c) => c.notNull())
    .addColumn('description', 'text')
    .addColumn('owning_org_unit_id', 'uuid', (c) => c.notNull().references('org_unit.id'))
    .addColumn('project_type_id', 'uuid', (c) => c.notNull().references('reference_data_entry.id'))
    .addColumn('start_date', 'date', (c) => c.notNull())
    .addColumn('planned_end_date', 'date', (c) => c.notNull())
    .addColumn('status', 'varchar(10)', (c) => c.notNull().defaultTo('ACTIVE'))
    .addColumn('closed_on', 'date')
    .addColumn('attributes', 'jsonb', (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('project_status_valid', sql`status IN ('ACTIVE','CLOSED')`)
    .addCheckConstraint('project_date_order', sql`planned_end_date >= start_date`) // BR-P-03
    .execute();
  await sql`CREATE UNIQUE INDEX project_code_unique ON project (lower(code))`.execute(db);
  await sql`CREATE INDEX project_org_status_idx ON project (owning_org_unit_id, status)`.execute(db);
  await sql`CREATE INDEX project_type_idx ON project (project_type_id)`.execute(db);

  // --- assignment -------------------------------------------------------
  await db.schema
    .createTable('assignment')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('member_id', 'uuid', (c) => c.notNull().references('member.id'))
    .addColumn('project_id', 'uuid', (c) => c.notNull().references('project.id'))
    // Integer tenths, so summation is exact (BR-A-03).
    .addColumn('allocation_tenths', 'integer', (c) => c.notNull())
    .addColumn('start_date', 'date', (c) => c.notNull())
    .addColumn('end_date', 'date', (c) => c.notNull())
    .addColumn('project_role_id', 'uuid', (c) => c.references('reference_data_entry.id'))
    .addColumn('saved_as_override', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('status', 'varchar(10)', (c) => c.notNull().defaultTo('ACTIVE'))
    .addColumn('ended_early_on', 'date')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('created_by_user_id', 'uuid')
    .addColumn('updated_by_user_id', 'uuid')
    .addCheckConstraint('assignment_status_valid', sql`status IN ('ACTIVE','ENDED')`)
    // BR-A-02: 0.1% .. 100.0% in tenths. Zero and negatives rejected at the database too.
    .addCheckConstraint('assignment_tenths_range', sql`allocation_tenths BETWEEN 1 AND 1000`)
    .addCheckConstraint('assignment_date_order', sql`end_date >= start_date`) // BR-A-04
    .execute();
  // The single most important index in the system (domain-entities.md section 12):
  // every allocation, availability and over-allocation query depends on it.
  await sql`
    CREATE INDEX assignment_member_range_idx ON assignment (member_id, start_date, end_date)
  `.execute(db);
  await sql`
    CREATE INDEX assignment_project_range_idx ON assignment (project_id, start_date, end_date)
  `.execute(db);

  // --- assignment_history: append-only snapshots (Q1:B) -----------------
  await db.schema
    .createTable('assignment_history')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('assignment_id', 'uuid', (c) => c.notNull().references('assignment.id'))
    .addColumn('revision_number', 'integer', (c) => c.notNull())
    .addColumn('operation', 'varchar(12)', (c) => c.notNull())
    .addColumn('recorded_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('superseded_at', 'timestamptz')
    .addColumn('actor_user_id', 'uuid')
    .addColumn('member_id', 'uuid', (c) => c.notNull())
    .addColumn('project_id', 'uuid', (c) => c.notNull())
    .addColumn('allocation_tenths', 'integer', (c) => c.notNull())
    .addColumn('start_date', 'date', (c) => c.notNull())
    .addColumn('end_date', 'date', (c) => c.notNull())
    .addColumn('project_role_id', 'uuid')
    .addColumn('saved_as_override', 'boolean', (c) => c.notNull())
    .addColumn('status', 'varchar(10)', (c) => c.notNull())
    .addCheckConstraint(
      'history_operation_valid',
      sql`operation IN ('CREATE','UPDATE','END_EARLY','AUTO_END')`,
    )
    .addUniqueConstraint('history_revision_unique', ['assignment_id', 'revision_number'])
    .execute();
  // BR-A-17: exactly one current revision per assignment. Enforced in the database so the
  // invariant cannot drift even if application logic has a defect.
  await sql`
    CREATE UNIQUE INDEX history_one_current_revision
      ON assignment_history (assignment_id) WHERE superseded_at IS NULL
  `.execute(db);
  await sql`
    CREATE INDEX history_asof_idx
      ON assignment_history (assignment_id, recorded_at, superseded_at)
  `.execute(db);
  await sql`
    CREATE INDEX history_member_asof_idx
      ON assignment_history (member_id, recorded_at, superseded_at)
  `.execute(db);

  // --- user_account -----------------------------------------------------
  await db.schema
    .createTable('user_account')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('username', 'varchar(120)', (c) => c.notNull())
    .addColumn('password_hash', 'text', (c) => c.notNull())
    .addColumn('password_algorithm', 'varchar(40)', (c) => c.notNull())
    .addColumn('role', 'varchar(20)', (c) => c.notNull())
    .addColumn('home_org_unit_id', 'uuid', (c) => c.references('org_unit.id'))
    .addColumn('linked_member_id', 'uuid', (c) => c.references('member.id'))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      'user_role_valid',
      sql`role IN ('ADMIN','RESOURCE_MANAGER','TEAM_LEAD','TEAM_MEMBER','EXECUTIVE')`,
    )
    .execute();
  await sql`CREATE UNIQUE INDEX user_username_unique ON user_account (lower(username))`.execute(db);
  // BR-AU-13: at most one account per member.
  await sql`
    CREATE UNIQUE INDEX user_linked_member_unique
      ON user_account (linked_member_id) WHERE linked_member_id IS NOT NULL
  `.execute(db);

  // --- session ----------------------------------------------------------
  await db.schema
    .createTable('session')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('token_hash', 'text', (c) => c.notNull())
    .addColumn('user_account_id', 'uuid', (c) =>
      c.notNull().references('user_account.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('last_seen_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('expires_at', 'timestamptz', (c) => c.notNull())
    .addColumn('terminated_at', 'timestamptz')
    .execute();
  await sql`CREATE UNIQUE INDEX session_token_hash_unique ON session (token_hash)`.execute(db);
  await sql`CREATE INDEX session_user_idx ON session (user_account_id)`.execute(db);
}

/** Local development convenience only. NOT the production recovery path (U1-NFR-M-08). */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('session').ifExists().execute();
  await db.schema.dropTable('assignment_history').ifExists().execute();
  await db.schema.dropTable('assignment').ifExists().execute();
  await db.schema.dropTable('user_account').ifExists().execute();
  await db.schema.dropTable('project').ifExists().execute();
  await db.schema.dropTable('member_skill').ifExists().execute();
  await db.schema.dropTable('member').ifExists().execute();
  await db.schema.dropTable('reference_data_entry').ifExists().execute();
  await sql`DROP TRIGGER IF EXISTS org_unit_two_levels ON org_unit`.execute(db);
  await sql`DROP FUNCTION IF EXISTS org_unit_enforce_two_levels()`.execute(db);
  await db.schema.dropTable('org_unit').ifExists().execute();
}
