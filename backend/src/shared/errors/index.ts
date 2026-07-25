/**
 * Domain error types.
 *
 * Q12:A — every rule violation surfaces as a structured object with a list of
 * field-level violations, so the frontend can place each message beside its input
 * and any client receives the same payload. ALL reasons are reported, never only
 * the first (US-MEM-07, US-PRJ-05, US-ASN-06 acceptance criteria).
 */

export interface Violation {
  /** Client-facing field name; null for whole-record violations. */
  field: string | null;
  /** Machine-readable rule identifier, e.g. 'REQUIRED', 'DUPLICATE', 'DATE_ORDER'. */
  rule: string;
  /** Human-readable detail. Names the conflicting record where one exists —
   *  "already used by member M-104" is actionable, "duplicate" is not. */
  detail: string;
}

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    readonly violations: Violation[],
  ) {
    super('VALIDATION_FAILED', message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super('NOT_FOUND', `${what} was not found.`, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super('FORBIDDEN', message, 403);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.') {
    super('UNAUTHORIZED', message, 401);
  }
}

/** Refused because something still references the target, or a natural key collides. */
export class ConflictError extends AppError {
  constructor(
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super('CONFLICT', message, 409);
  }
}

/** Accumulates violations so a caller can report ALL of them at once, not just the first. */
export class ViolationCollector {
  private readonly violations: Violation[] = [];

  add(field: string | null, rule: string, detail: string): this {
    this.violations.push({ field, rule, detail });
    return this;
  }

  addIf(condition: boolean, field: string | null, rule: string, detail: string): this {
    if (condition) this.add(field, rule, detail);
    return this;
  }

  get hasAny(): boolean {
    return this.violations.length > 0;
  }

  list(): Violation[] {
    return [...this.violations];
  }

  /** Throws with every collected violation, or returns if there are none. */
  throwIfAny(message: string): void {
    if (this.hasAny) throw new ValidationError(message, this.list());
  }
}
