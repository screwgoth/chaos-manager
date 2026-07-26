/**
 * FieldErrors and FormErrors tests — Q12:A.
 *
 * The server reports EVERY violation, not just the first, so a user can fix a form in one pass.
 * That is only useful if each message appears beside the input it belongs to; ten violations in
 * one banner is worse than one violation, because nothing tells the user which field to look at.
 */

import { render, screen } from '@testing-library/react';
import { ApiError } from '../api/client';
import { FieldErrors, FormErrors } from './FieldErrors';

const VALIDATION_ERROR = new ApiError(400, 'VALIDATION_FAILED', 'The member could not be created.', [
  { field: 'email', rule: 'DUPLICATE', detail: 'This email address is already used.' },
  { field: 'fullName', rule: 'REQUIRED', detail: 'A full name is required.' },
  { field: 'email', rule: 'INVALID_FORMAT', detail: 'That does not look like an email address.' },
  { field: null, rule: 'CONFLICT', detail: 'Something about the record as a whole.' },
]);

describe('FieldErrors', () => {
  it('shows only the violations for its own field', () => {
    render(<FieldErrors error={VALIDATION_ERROR} field="fullName" />);

    expect(screen.getByText('A full name is required.')).toBeInTheDocument();
    // The email problems belong beside the email input, not here.
    expect(screen.queryByText(/email address/i)).not.toBeInTheDocument();
  });

  it('shows ALL violations for one field, not just the first', () => {
    // Two problems with the same field is a real case: duplicate AND malformed.
    render(<FieldErrors error={VALIDATION_ERROR} field="email" />);

    expect(screen.getByText('This email address is already used.')).toBeInTheDocument();
    expect(screen.getByText('That does not look like an email address.')).toBeInTheDocument();
  });

  it('renders nothing when the field is clean', () => {
    const { container } = render(<FieldErrors error={VALIDATION_ERROR} field="orgUnitId" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no error at all', () => {
    const { container } = render(<FieldErrors error={null} field="email" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('handles nested field paths, which is how the domain names contract fields', () => {
    const nested = new ApiError(400, 'VALIDATION_FAILED', 'Rejected.', [
      { field: 'contract.endDate', rule: 'DATE_ORDER', detail: 'The end cannot precede the start.' },
    ]);

    render(<FieldErrors error={nested} field="contract.endDate" />);
    expect(screen.getByText('The end cannot precede the start.')).toBeInTheDocument();
  });

  it('is findable by field for tests and for assistive tooling', () => {
    render(<FieldErrors error={VALIDATION_ERROR} field="email" />);
    expect(screen.getByTestId('field-errors-email')).toBeInTheDocument();
  });
});

describe('FormErrors', () => {
  it('shows whole-record violations, which belong to no single input', () => {
    render(<FormErrors error={VALIDATION_ERROR} />);
    expect(screen.getByText('Something about the record as a whole.')).toBeInTheDocument();
  });

  it('does NOT repeat field-level violations at the top', () => {
    // Duplicating them would say the same thing twice and bury the field-specific placement.
    render(<FormErrors error={VALIDATION_ERROR} />);
    expect(screen.queryByText('A full name is required.')).not.toBeInTheDocument();
  });

  it('falls back to the message for an error with no violations at all', () => {
    // A 403 or 409 carries a message and nothing else; it still needs showing.
    const forbidden = new ApiError(403, 'FORBIDDEN', 'The EXECUTIVE role cannot make changes here.', []);
    render(<FormErrors error={forbidden} />);

    expect(screen.getByText(/EXECUTIVE role cannot make changes/i)).toBeInTheDocument();
  });

  it('renders nothing when there is no error', () => {
    const { container } = render(<FormErrors error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces itself as an alert', () => {
    render(<FormErrors error={VALIDATION_ERROR} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('ApiError helpers', () => {
  it('partitions violations by field', () => {
    expect(VALIDATION_ERROR.forField('email')).toHaveLength(2);
    expect(VALIDATION_ERROR.forField('fullName')).toHaveLength(1);
    expect(VALIDATION_ERROR.general).toHaveLength(1);
  });

  it('recognises an unauthorized status, which drives the sign-in redirect', () => {
    expect(new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue.', []).isUnauthorized).toBe(true);
    expect(VALIDATION_ERROR.isUnauthorized).toBe(false);
  });
});
