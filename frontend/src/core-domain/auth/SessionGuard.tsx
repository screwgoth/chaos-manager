/**
 * SessionGuard and SignOutButton — US-ACC-02.
 *
 * ⚠️ The guard decides what to RENDER, not what a user may access. Access is enforced by the
 * server on every request. See `SessionProvider`'s header.
 */

import type { ReactNode } from 'react';
import { LoadingState } from '../../shared/components';
import { Button } from '../../shared/components';
import { useSession } from '../../shared/session/SessionProvider';
import { SignInPage } from './SignInPage';

export function SessionGuard({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading } = useSession();

  // Rendering the sign-in page during the initial session probe would flash a login form at
  // an already-signed-in user on every page refresh.
  if (loading) return <LoadingState label="Loading C.H.A.O.S" />;
  if (!user) return <SignInPage />;
  return <>{children}</>;
}

export function SignOutButton(): JSX.Element {
  const { signOut } = useSession();
  return (
    <Button variant="ghost" onClick={() => void signOut()} data-testid="sign-out">
      Sign out
    </Button>
  );
}
