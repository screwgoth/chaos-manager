/**
 * Translate PostgreSQL error codes into domain errors.
 *
 * Why this exists: the database enforces the natural-key uniqueness rules (BR-O-02,
 * BR-C-03, BR-M-05, BR-P-02, BR-AU-11) because a read-then-write check in application
 * code is a race — two concurrent creates both read "not taken" and both insert. The
 * application check gives a good message; the constraint is what actually guarantees
 * the rule. So a constraint violation is an EXPECTED outcome under concurrency, not a
 * crash, and must surface as a ConflictError the API can render.
 */

import { ConflictError } from '../errors';

/** unique_violation — https://www.postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
}

function asPgError(error: unknown): PgError | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as PgError;
  return typeof candidate.code === 'string' ? candidate : null;
}

/**
 * Maps a constraint name to the field and message a user should see.
 * Keys must match the index/constraint names in migrations/001_initial_schema.ts.
 */
const CONSTRAINT_MESSAGES: Record<string, { field: string; message: string }> = {
  org_unit_name_unique_root: {
    field: 'name',
    message: 'A department with this name already exists.',
  },
  org_unit_name_unique_child: {
    field: 'name',
    message: 'A team with this name already exists in the same department.',
  },
  reference_data_type_name_unique: {
    field: 'name',
    message: 'An entry with this name already exists for this reference type.',
  },
  member_email_unique: {
    field: 'email',
    message: 'This email address is already used by another member.',
  },
  member_external_ref_unique: {
    field: 'externalRef',
    message: 'This employee ID is already used by another member.',
  },
  project_code_unique: {
    field: 'code',
    message: 'This project code is already in use.',
  },
  user_username_unique: {
    field: 'username',
    message: 'This username is already taken.',
  },
  user_linked_member_unique: {
    field: 'linkedMemberId',
    message: 'This member is already linked to another user account.',
  },
  session_token_hash_unique: {
    field: 'tokenHash',
    message: 'Session token collision.',
  },
  history_revision_unique: {
    field: 'revisionNumber',
    message: 'A revision with this number already exists for the assignment.',
  },
  history_one_current_revision: {
    field: 'supersededAt',
    message:
      'An assignment may have only one current history revision (BR-A-17). ' +
      'A concurrent write superseded this one; retry the operation.',
  },
};

/**
 * Rethrows `error` as a domain error where it maps to one, otherwise rethrows unchanged.
 * Unknown database errors are deliberately NOT swallowed — a bug should surface as a
 * 500 with a logged stack, not as a misleading 409.
 */
export function translatePgError(error: unknown): never {
  const pg = asPgError(error);
  if (!pg) throw error;

  if (pg.code === UNIQUE_VIOLATION) {
    const known = pg.constraint ? CONSTRAINT_MESSAGES[pg.constraint] : undefined;
    if (known) {
      throw new ConflictError(known.message, { field: known.field, constraint: pg.constraint });
    }
    // Unmapped unique index: still a conflict, but say so without inventing a field.
    throw new ConflictError('A record with these values already exists.', {
      constraint: pg.constraint ?? null,
    });
  }

  if (pg.code === FOREIGN_KEY_VIOLATION) {
    throw new ConflictError(
      'A referenced record does not exist, or is still referenced by other records.',
      { constraint: pg.constraint ?? null },
    );
  }

  if (pg.code === CHECK_VIOLATION) {
    // A check violation means application validation let something through that the
    // database refused. That is a defect in the validating layer, so keep the
    // constraint name in the payload to make it diagnosable.
    throw new ConflictError('The record violates a database constraint.', {
      constraint: pg.constraint ?? null,
    });
  }

  throw error;
}

/** Runs `operation`, translating PostgreSQL constraint errors into domain errors. */
export async function withPgErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    translatePgError(error);
  }
}
