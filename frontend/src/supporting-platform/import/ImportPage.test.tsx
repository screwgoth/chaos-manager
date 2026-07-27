/**
 * ImportPage — the FORBIDDEN state. Step 16.
 *
 * This is the test that proves hiding a nav entry is a courtesy and not the control (FR-R-08,
 * U2-NFR-U-02/03). A non-admin who navigates straight to `/import` must be TOLD they lack
 * permission — not shown an empty form they cannot use, and not shown "something went wrong".
 *
 * The API refuses them independently with 403; this only covers what the screen says.
 */

import { render, screen } from '@testing-library/react';
import { ImportPage } from './ImportPage';

const mockSession = jest.fn();

jest.mock('../../shared/session/SessionProvider', () => ({
  useSession: () => mockSession(),
}));

function asRole(role: string): void {
  mockSession.mockReturnValue({
    user: { id: 'u-1', username: 'someone', role, linkedMemberId: null },
  });
}

describe('ImportPage access', () => {
  it.each(['TEAM_LEAD', 'TEAM_MEMBER', 'EXECUTIVE', 'RESOURCE_MANAGER'])(
    'renders a FORBIDDEN state for %s, not an empty form',
    (role) => {
      asRole(role);
      render(<ImportPage />);

      expect(screen.getByTestId('import-forbidden')).toHaveTextContent(
        /only an administrator can import/i,
      );
      // The form must not be reachable — a disabled form would invite retrying.
      expect(screen.queryByTestId('import-kind-select')).not.toBeInTheDocument();
      expect(screen.queryByTestId('import-submit')).not.toBeInTheDocument();
    },
  );

  it('renders the form for an ADMIN', () => {
    asRole('ADMIN');
    render(<ImportPage />);

    expect(screen.queryByTestId('import-forbidden')).not.toBeInTheDocument();
    expect(screen.getByTestId('import-kind-select')).toBeInTheDocument();
  });

  it('the kind selector has NO default, so the choice is deliberate', () => {
    asRole('ADMIN');
    render(<ImportPage />);
    // Importing people into the project registry is not a mistake worth making easy.
    expect(screen.getByTestId('import-kind-select')).toHaveValue('');
  });

  it('shows no file input until a kind is chosen', () => {
    asRole('ADMIN');
    render(<ImportPage />);
    expect(screen.queryByTestId('import-file-input')).not.toBeInTheDocument();
  });
});
