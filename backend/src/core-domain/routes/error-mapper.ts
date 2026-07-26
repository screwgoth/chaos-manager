/**
 * The error mapper — Q12:A's response envelope.
 *
 * EVERY failure leaves the API in the same shape, so a client has exactly one error format
 * to handle:
 *
 *   { error: { code, message, violations: [{ field, rule, detail }] } }
 *
 * `violations` carries ALL reasons, never only the first (US-MEM-07, US-PRJ-05, US-ASN-06),
 * which is what lets the frontend place each message beside its own input.
 *
 * THE UNEXPECTED-ERROR RULE. An error this mapper does not recognise becomes a 500 with a
 * GENERIC message, and the real error is logged server-side. Echoing an unknown error's
 * message to the client is how stack traces, SQL fragments and connection strings end up in
 * browsers — and `redactSecrets` cannot help, because by then the string has already left.
 */

import { ZodError } from 'zod';
import { AppError, type Violation } from '../../shared/errors';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    violations: Violation[];
  };
}

export interface MappedError {
  status: number;
  body: ErrorEnvelope;
  /** The error to log server-side. Present only for unexpected failures. */
  logCause: unknown;
}

/**
 * Zod's issues become field-level violations, so a malformed payload reads the same as a
 * business-rule failure to the client (Q4:A puts shape validation at the route and business
 * rules in the domain — but the client should not have to care which one rejected it).
 */
function fromZod(error: ZodError): Violation[] {
  return error.issues.map((issue) => ({
    // `path` is an array of keys/indexes; joining with dots matches the field naming the
    // domain layer already uses ('contract.endDate', 'period.start').
    field: issue.path.length > 0 ? issue.path.join('.') : null,
    rule: issue.code.toUpperCase(),
    detail: issue.message,
  }));
}

export function mapError(error: unknown): MappedError {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request could not be accepted.',
          violations: fromZod(error),
        },
      },
      logCause: null,
    };
  }

  if (error instanceof AppError) {
    // ValidationError carries violations; the other AppError subclasses do not, and an empty
    // array is correct for them rather than a fabricated single entry.
    const violations =
      'violations' in error && Array.isArray((error as { violations?: Violation[] }).violations)
        ? ((error as { violations: Violation[] }).violations)
        : [];

    /**
     * `detail` is surfaced when an error carries it — currently `ConflictError` only.
     *
     * ADDED AT UNIT 2, additively. R2 obligation 5 (US-ENB-04, client-agnostic API) requires
     * Unit 2's refusals to be machine-readable, and US-ACC-04's two link refusals must be
     * distinguishable by CODE rather than by matching prose: an admin client needs to know
     * whether to unlink this account or the other one. Every existing error carries no `detail`,
     * so no current response shape changes.
     */
    const detail =
      'detail' in error && error.detail !== undefined && error.detail !== null
        ? { detail: error.detail as Record<string, unknown> }
        : {};

    return {
      status: error.httpStatus,
      body: { error: { code: error.code, message: error.message, violations, ...detail } },
      logCause: null,
    };
  }

  // Unrecognised: generic message out, real error to the log.
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. The problem has been logged.',
        violations: [],
      },
    },
    logCause: error,
  };
}
