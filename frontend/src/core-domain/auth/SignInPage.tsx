/**
 * SignInPage — US-ACC-01, US-ACC-03.
 *
 * THE ONE THING THIS SCREEN MUST NOT DO is tell an attacker which usernames exist. The server
 * returns a single message for both a wrong password and an unknown username (BR-AU-04); this
 * page displays whatever it receives and never elaborates.
 *
 * BR-AU-06: an empty field is caught here, with NO request sent — so a blank submission cannot
 * even reach the credential check.
 */

import { useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { Button, Field, TextInput } from '../../shared/components';
import { useSession } from '../../shared/session/SessionProvider';

export function SignInPage(): JSX.Element {
  const { signIn, expiredNotice, clearExpiredNotice } = useSession();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState<{ username: boolean; password: boolean }>({
    username: false,
    password: false,
  });

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    clearExpiredNotice();

    // BR-AU-06 — checked before any request.
    const blanks = { username: username.trim() === '', password: password === '' };
    setMissing(blanks);
    if (blanks.username || blanks.password) {
      setMessage(null);
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      await signIn(username.trim(), password);
    } catch (error) {
      // Displayed verbatim. The server decides how much to say; the UI must not add to it.
      setMessage(
        error instanceof ApiError ? error.message : 'Sign-in failed. Try again in a moment.',
      );
      // The password is cleared, the username kept — retyping a username you already got right
      // is friction with no security benefit.
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">C.H.A.O.S</h1>
          <p className="mt-1 text-sm text-slate-500">
            Centralized Hub for Aligning Organizational Squads
          </p>
        </div>

        {expiredNotice ? (
          <div
            className="mb-4 rounded border border-allocation-full/40 bg-allocation-full/5 px-3 py-2 text-sm text-slate-700"
            role="status"
            data-testid="session-expired-notice"
          >
            Your session ended. Sign in to continue.
          </div>
        ) : null}

        <form onSubmit={onSubmit} noValidate className="rounded-lg border border-slate-200 bg-white p-6">
          {message ? (
            <div
              className="mb-4 rounded border border-allocation-over/30 bg-allocation-over/5 px-3 py-2 text-sm text-allocation-over"
              role="alert"
              data-testid="signin-error"
            >
              {message}
            </div>
          ) : null}

          <Field label="Username" htmlFor="username" required>
            <TextInput
              id="username"
              data-testid="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            {missing.username ? (
              <p className="mt-1 text-xs text-allocation-over" data-testid="username-required">
                Enter your username.
              </p>
            ) : null}
          </Field>

          <Field label="Password" htmlFor="password" required>
            <TextInput
              id="password"
              data-testid="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {missing.password ? (
              <p className="mt-1 text-xs text-allocation-over" data-testid="password-required">
                Enter your password.
              </p>
            ) : null}
          </Field>

          <Button type="submit" disabled={submitting} className="w-full" data-testid="signin-submit">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
