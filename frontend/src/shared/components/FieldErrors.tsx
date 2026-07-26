/**
 * FieldErrors — the server's violations, beside the input they belong to (Q12:A).
 *
 * The server reports EVERY violation, not just the first, so a user fixes a form in one pass
 * rather than discovering problems one submit at a time. This component is what makes that
 * worth doing: without per-field placement, ten violations become one unreadable banner.
 */

import type { ApiError } from '../api/client';

export function FieldErrors({
  error,
  field,
}: {
  error: ApiError | null;
  field: string;
}): JSX.Element | null {
  const violations = error?.forField(field) ?? [];
  if (violations.length === 0) return null;

  return (
    <ul className="mt-1 space-y-0.5" data-testid={`field-errors-${field}`}>
      {violations.map((violation) => (
        <li key={`${violation.rule}-${violation.detail}`} className="text-xs text-allocation-over">
          {violation.detail}
        </li>
      ))}
    </ul>
  );
}

/** Violations with no field — shown once at the top of a form. */
export function FormErrors({ error }: { error: ApiError | null }): JSX.Element | null {
  if (!error) return null;
  const general = error.general;

  // A 403 or 409 carries a message but no violations; it still needs showing.
  const messages = general.length > 0 ? general.map((v) => v.detail) : [error.message];
  if (error.violations.length > 0 && general.length === 0) return null;

  return (
    <div
      className="mb-4 rounded border border-allocation-over/30 bg-allocation-over/5 px-3 py-2"
      role="alert"
      data-testid="form-errors"
    >
      {messages.map((message) => (
        <p key={message} className="text-sm text-allocation-over">
          {message}
        </p>
      ))}
    </div>
  );
}
