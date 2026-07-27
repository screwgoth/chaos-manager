/**
 * First-run seed.
 *
 * IDEMPOTENT BY CONSTRUCTION. Every insert is guarded by a count, so this runs on every start and
 * does nothing after the first. That is what makes it safe to leave in the startup path rather
 * than a one-off script an operator must remember to run — and a script that must be remembered
 * is a script that gets skipped.
 *
 * ⚠️ FR-C-01: THE VOCABULARY HERE MUST STAY TEAM-TYPE-AGNOSTIC.
 *
 * The whole point of the product is that it serves Sales and Ops as well as Engineering. Seeding
 * "Backend Engineer" and "Sprint" would silently make it an engineering tool, and every later
 * screenshot, demo and training doc would reinforce that. The starters below are deliberately
 * plain: they are examples an admin renames, not a taxonomy they inherit.
 *
 * An empty list would be defensible too, but a first-run product with no roles cannot create a
 * single person, and "add a role before you can add anyone" is a poor first minute.
 */

import type { Db } from './db';

/** One department, so the first member has somewhere to go. */
const STARTER_ORG_UNIT = 'Organisation';

/**
 * Starter reference data.
 *
 * Generic on purpose (FR-C-01). "Team Member" and "Team Lead" describe a position in any function;
 * "Project" and "Internal Initiative" describe work without implying software. None of these
 * mention sprints, tickets, deals, or shifts.
 */
const STARTER_ROLES = ['Team Member', 'Team Lead', 'Manager', 'Specialist'];
const STARTER_SKILLS: string[] = [];
const STARTER_PROJECT_TYPES = ['Project', 'Internal Initiative', 'Support'];

export interface SeedResult {
  orgUnitsCreated: number;
  rolesCreated: number;
  skillsCreated: number;
  projectTypesCreated: number;
  /** True when nothing was written, i.e. every subsequent start. */
  alreadySeeded: boolean;
}

export async function seedReferenceData(db: Db): Promise<SeedResult> {
  const result: SeedResult = {
    orgUnitsCreated: 0,
    rolesCreated: 0,
    skillsCreated: 0,
    projectTypesCreated: 0,
    alreadySeeded: true,
  };

  // Each guard is independent, so a partially-seeded database (an admin deleted the starter roles
  // but kept the org unit) is not re-filled with things they removed on purpose.
  const orgUnitCount = await count(db, 'org_unit');
  if (orgUnitCount === 0) {
    await db.insertInto('org_unit').values({ name: STARTER_ORG_UNIT, parent_org_unit_id: null }).execute();
    result.orgUnitsCreated = 1;
    result.alreadySeeded = false;
  }

  const referenceCount = await count(db, 'reference_data_entry');
  if (referenceCount === 0) {
    const rows = [
      ...STARTER_ROLES.map((name) => ({ reference_type: 'ROLE' as const, name })),
      ...STARTER_SKILLS.map((name) => ({ reference_type: 'SKILL' as const, name })),
      ...STARTER_PROJECT_TYPES.map((name) => ({ reference_type: 'PROJECT_TYPE' as const, name })),
    ];

    if (rows.length > 0) {
      await db.insertInto('reference_data_entry').values(rows).execute();
    }

    result.rolesCreated = STARTER_ROLES.length;
    // Skills are deliberately NOT seeded: a skill list is entirely organisation-specific, and any
    // guess would be wrong for most teams. The member form already tells a user what to do when a
    // skill is missing (BR-M-11), which is a better first encounter than a misleading list.
    result.skillsCreated = STARTER_SKILLS.length;
    result.projectTypesCreated = STARTER_PROJECT_TYPES.length;
    result.alreadySeeded = false;
  }

  return result;
}

async function count(db: Db, table: 'org_unit' | 'reference_data_entry'): Promise<number> {
  const row = await db
    .selectFrom(table)
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}
