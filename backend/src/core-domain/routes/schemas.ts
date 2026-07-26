/**
 * Route input schemas — SHAPE VALIDATION ONLY (Q4:A).
 *
 * WHAT BELONGS HERE: is this a string, is it present, is it a well-formed date, is this
 * number within the representable range.
 *
 * WHAT DOES NOT: any rule that needs to look at the database or at another field's meaning.
 * "Is this org unit active", "does this exceed the member's capacity", "is the email already
 * taken" are business rules and live in the domain layer. Duplicating one here creates two
 * places to change it and two chances for them to disagree.
 *
 * The one apparent exception is `refine` on date ranges (end >= start), which is pure shape:
 * it needs nothing but the two values already in the payload. It is duplicated in the domain
 * layer on purpose — the domain must not trust that a caller went through a route.
 */

import { z } from 'zod';

/** A calendar date, not an instant. Rejects '2026-02-30' as well as malformed strings. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    // Round-tripping catches impossible dates, which the Date constructor otherwise rolls
    // over silently (31 February becoming 3 March).
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'That is not a real date.');

export const uuidSchema = z.string().uuid('That is not a valid identifier.');

export const dateRangeSchema = z
  .object({ start: isoDateSchema, end: isoDateSchema })
  .refine((range) => range.end >= range.start, {
    message: 'The end date cannot be before the start date.',
    path: ['end'],
  });

/**
 * Allocation percentage: 0.1 – 100.0 with at most one decimal place.
 *
 * The precision check is here as well as in the domain because a client that sends 37.55
 * deserves a field-level message rather than a generic rejection — but the domain repeats it,
 * since it cannot assume the route ran.
 */
export const allocationPercentageSchema = z
  .number()
  .min(0.1, 'An allocation must be at least 0.1%.')
  .max(100, 'An allocation cannot exceed 100%.')
  .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9, {
    message: 'An allocation supports at most one decimal place (for example 37.5).',
  });

const trimmedString = (max: number) => z.string().trim().min(1).max(max);

/** Pagination, with a hard ceiling so a client cannot request the whole table. */
export const paginationSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Comma-separated query lists ('?skillIds=a,b,c'), the shape a browser query string gives. */
const csvUuids = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined || value.trim() === ''
      ? null
      : value.split(',').map((part) => part.trim()).filter((part) => part !== ''),
  );

const optionalCsv = csvUuids;

// --- auth -----------------------------------------------------------------

export const signInSchema = z.object({
  // NOT length-validated beyond presence: a minimum length here would tell an attacker which
  // submissions are worth trying, and the credential check is constant-shaped by design.
  username: z.string().min(1, 'A username is required.'),
  password: z.string().min(1, 'A password is required.'),
});

export const changePasswordSchema = z.object({
  newPassword: z.string().min(1, 'A password is required.'),
});

// --- members --------------------------------------------------------------

export const contractSchema = z.object({
  vendorName: trimmedString(200),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  status: trimmedString(50),
});

export const memberCreateSchema = z.object({
  fullName: trimmedString(200),
  email: z.string().trim().email('That does not look like an email address.').max(254),
  orgUnitId: uuidSchema,
  employmentType: z.enum(['ON_ROLL', 'OFF_ROLL']),
  roleId: uuidSchema,
  externalRef: z.string().trim().max(100).nullable().default(null),
  skillIds: z.array(uuidSchema).default([]),
  // Conditional requirement (BR-M-06) is NOT expressed here — it is a business rule, and the
  // domain reports it with the four field-level violations a form needs.
  contract: contractSchema.nullable().default(null),
});

export const memberUpdateSchema = memberCreateSchema.partial();

export const memberSearchSchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional().transform((v) => v ?? null),
  orgUnitIds: optionalCsv,
  employmentType: z.enum(['ON_ROLL', 'OFF_ROLL']).optional().transform((v) => v ?? null),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().transform((v) => v ?? null),
  skillIds: optionalCsv,
  roleId: uuidSchema.optional().transform((v) => v ?? null),
});

export const skillParamSchema = z.object({ skillId: uuidSchema });

export const expiringContractsSchema = z.object({
  withinDays: z.coerce.number().int().min(1).max(365).default(30),
});

// --- projects -------------------------------------------------------------

export const projectCreateSchema = z
  .object({
    code: trimmedString(40),
    name: trimmedString(200),
    description: z.string().trim().max(2000).nullable().default(null),
    owningOrgUnitId: uuidSchema,
    projectTypeId: uuidSchema,
    startDate: isoDateSchema,
    plannedEndDate: isoDateSchema,
  })
  .refine((project) => project.plannedEndDate >= project.startDate, {
    message: 'The planned end date cannot be before the start date.',
    path: ['plannedEndDate'],
  });

/** Partial cannot carry the cross-field refine, so the domain enforces it on update. */
export const projectUpdateSchema = z.object({
  code: trimmedString(40).optional(),
  name: trimmedString(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  owningOrgUnitId: uuidSchema.optional(),
  projectTypeId: uuidSchema.optional(),
  startDate: isoDateSchema.optional(),
  plannedEndDate: isoDateSchema.optional(),
});

export const projectSearchSchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional().transform((v) => v ?? null),
  orgUnitIds: optionalCsv,
  projectTypeId: uuidSchema.optional().transform((v) => v ?? null),
  status: z.enum(['ACTIVE', 'CLOSED']).optional().transform((v) => v ?? null),
});

export const projectCloseSchema = z.object({
  /** The second step of BR-P-06's two-phase close. */
  confirmOpenAssignments: z.boolean().default(false),
});

export const staffingQuerySchema = z.object({ asOf: isoDateSchema });

// --- assignments ----------------------------------------------------------

export const assignmentCreateSchema = z.object({
  memberId: uuidSchema,
  projectId: uuidSchema,
  allocationPercentage: allocationPercentageSchema,
  period: dateRangeSchema,
  projectRoleId: uuidSchema.nullable().default(null),
  /**
   * The second step of the two-step override protocol (US-ASN-05).
   *
   * Accepting this from the client is correct — it is a user DECISION. What is never taken
   * from the client is `savedAsOverride`, which the domain derives from the detection result
   * (BR-A-11), so a client cannot flag a row as an accepted override that was never one.
   */
  overrideOverAllocation: z.boolean().default(false),
});

export const assignmentUpdateSchema = z.object({
  allocationPercentage: allocationPercentageSchema.optional(),
  period: dateRangeSchema.optional(),
  projectRoleId: uuidSchema.nullable().optional(),
  overrideOverAllocation: z.boolean().default(false),
});

export const assignmentEndSchema = z.object({ effectiveEndDate: isoDateSchema });

export const assignmentQuerySchema = z.object({
  memberId: uuidSchema.optional().transform((v) => v ?? null),
  projectId: uuidSchema.optional().transform((v) => v ?? null),
  start: isoDateSchema.optional().transform((v) => v ?? null),
  end: isoDateSchema.optional().transform((v) => v ?? null),
});

export const asOfQuerySchema = z.object({
  asOf: isoDateSchema,
  start: isoDateSchema,
  end: isoDateSchema,
  memberIds: optionalCsv,
});

// --- allocation views -----------------------------------------------------

export const allocationViewSchema = paginationSchema.extend({
  asOf: isoDateSchema,
  orgUnitIds: optionalCsv,
  employmentType: z.enum(['ON_ROLL', 'OFF_ROLL']).optional().transform((v) => v ?? null),
  roleId: uuidSchema.optional().transform((v) => v ?? null),
  skillIds: optionalCsv,
});

export const availabilitySchema = paginationSchema.extend({
  start: isoDateSchema,
  end: isoDateSchema,
  orgUnitIds: optionalCsv,
  employmentType: z.enum(['ON_ROLL', 'OFF_ROLL']).optional().transform((v) => v ?? null),
  roleId: uuidSchema.optional().transform((v) => v ?? null),
  skillIds: optionalCsv,
  minimumAvailablePercentage: z.coerce.number().min(0).max(100).optional(),
});

export const rangeQuerySchema = z.object({ start: isoDateSchema, end: isoDateSchema });

// --- reference data and org units ----------------------------------------

export const referenceTypeSchema = z.enum(['ROLE', 'SKILL', 'PROJECT_TYPE']);

export const referenceListSchema = z.object({
  type: referenceTypeSchema,
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const referenceCreateSchema = z.object({
  referenceType: referenceTypeSchema,
  name: trimmedString(120),
});

export const referenceRenameSchema = z.object({ name: trimmedString(120) });

export const orgUnitCreateSchema = z.object({
  name: trimmedString(120),
  parentOrgUnitId: uuidSchema.nullable().default(null),
});

export const orgUnitUpdateSchema = z.object({ name: trimmedString(120) });

export const includeInactiveSchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const idParamSchema = z.object({ id: uuidSchema });
