/**
 * SignInPage tests — US-ACC-01, US-ACC-03.
 *
 * THE PROPERTY UNDER TEST is that this screen cannot be used to discover which usernames exist.
 * The server already returns one message for both a wrong password and an unknown username
 * (BR-AU-04); the risk here is the UI helpfully adding a distinction the server refused to make —
 * "no such user", or a different layout for the two cases. So these tests drive both failures
 * through the real component and assert the rendered output is IDENTICAL.
 *
 * `fetch` is stubbed rather than the session context mocked, so the ApiClient's envelope parsing
 * and the provider's state handling are both exercised.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from '../../shared/session/SessionProvider';
import { SignInPage } from './SignInPage';

/**
 * user-event v14's `setup()` is the current API and is used deliberately.
 *
 * KNOWN, UNRESOLVED: this suite still prints React "update was not wrapped in act" warnings —
 * one per keystroke. Four fixes were tried (act-wrapping the clicks, act-wrapping the render,
 * flushing macrotasks inside act, and switching from the legacy userEvent API to setup()) and
 * none silenced them. The tests are correct and deterministic; the noise is not. Left as-is
 * rather than suppressing console.error, which would also hide real failures.
 */
const userEvent = userEventLib.setup();


/** The single rejection the server returns for BOTH failure modes. */
const REJECTION = {
  error: {
    code: 'UNAUTHORIZED',
    message: 'The username or password is incorrect.',
    violations: [],
  },
};

/**
 * A minimal fetch response.
 *
 * NOT `new Response(...)`: jsdom provides no `Response` global, so constructing one throws a
 * ReferenceError that surfaces as a generic "Sign-in failed" message — which made an earlier
 * version of this test appear to prove the component ignored the server's message. It only
 * needs `ok`, `status` and `text()`, which is all ApiClient reads.
 */
function jsonResponse(body: unknown, status = 200): { ok: boolean; status: number; text: () => Promise<string> } {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function stubFetch(
  handler: (path: string, init?: RequestInit) => ReturnType<typeof jsonResponse>,
): jest.Mock {
  const mock = jest.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  (globalThis as { fetch: unknown }).fetch = mock;
  return mock as unknown as jest.Mock;
}

/**
 * Renders and lets the provider's mount-time session probe settle.
 *
 * SessionProvider fetches `/api/auth/session` on mount and sets state when it resolves; without
 * awaiting that inside `act`, every test prints an act warning for an update it did not cause.
 */
async function renderSignIn(): Promise<void> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <SessionProvider>
          <SignInPage />
        </SessionProvider>
      </QueryClientProvider>,
    );
  });
}

/**
 * Clicks submit and lets the handler's async continuation finish INSIDE act.
 *
 * The DOM submit event does not await an async handler's promise, so `userEvent.click` returns
 * before `signIn()` resolves and the resulting `setMessage`/`setPassword` land outside any act
 * scope. Yielding to the macrotask queue inside act is what absorbs them — without it every
 * test prints an act warning for a state update it did cause but could not await.
 */
async function submitAndSettle(): Promise<void> {
  await act(async () => {
    await userEvent.click(screen.getByTestId('signin-submit'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The session probe on mount must not be mistaken for a sign-in attempt. */
function loginCalls(mock: jest.Mock): unknown[][] {
  return mock.mock.calls.filter((call) => String(call[0]).includes('/api/auth/login'));
}

describe('empty fields are caught before any request (BR-AU-06)', () => {
  it('sends NO request when both fields are blank', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ authenticated: false }));
    await renderSignIn();

    await submitAndSettle();

    // The point of BR-AU-06: a blank submission cannot even reach the credential check.
    await waitFor(() => {
      expect(screen.getByTestId('username-required')).toBeInTheDocument();
    });
    expect(loginCalls(fetchMock)).toHaveLength(0);
  });

  it('sends no request when only the password is missing', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ authenticated: false }));
    await renderSignIn();

    await userEvent.type(screen.getByTestId('username'), 'admin');
    await submitAndSettle();

    expect(screen.getByTestId('password-required')).toBeInTheDocument();
    expect(loginCalls(fetchMock)).toHaveLength(0);
  });

  it('does not report a missing field before the first submit', async () => {
    stubFetch(() => jsonResponse({ authenticated: false }));
    await renderSignIn();

    // Shouting at a user before they have tried anything is noise.
    expect(screen.queryByTestId('username-required')).not.toBeInTheDocument();
    expect(screen.queryByTestId('password-required')).not.toBeInTheDocument();
  });
});

/**
 * ⭐ The critical property: the two failure modes must be indistinguishable.
 */
describe('a wrong password and an unknown username are indistinguishable (BR-AU-04)', () => {
  /**
   * Renders fresh each call and returns the rendered message.
   *
   * `cleanup()` first, because two renders in ONE test would otherwise leave both mounted and
   * every query would match twice.
   */
  async function attemptSignIn(username: string): Promise<string> {
    cleanup();
    stubFetch((path) =>
      path.includes('/api/auth/login')
        ? jsonResponse(REJECTION, 401)
        : jsonResponse({ authenticated: false }),
    );
    await renderSignIn();

    await userEvent.type(screen.getByTestId('username'), username);
    await userEvent.type(screen.getByTestId('password'), 'some-password');
    await submitAndSettle();

    const error = await screen.findByTestId('signin-error');
    return error.textContent ?? '';
  }

  it('shows ONE generic message, quoting the server verbatim', async () => {
    const message = await attemptSignIn('admin');
    expect(message).toBe('The username or password is incorrect.');
  });

  it('renders the SAME text for a real user and for one that does not exist', async () => {
    const wrongPassword = await attemptSignIn('admin');
    const unknownUser = await attemptSignIn('nobody-at-all');

    // If these ever diverge, the UI has become a username oracle regardless of what the
    // server does.
    expect(unknownUser).toBe(wrongPassword);
  });

  it('never says the account does not exist, or anything like it', async () => {
    await attemptSignIn('nobody-at-all');

    for (const forbidden of [/no such/i, /not found/i, /does not exist/i, /unknown user/i, /wrong password/i]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });

  it('clears the password but KEEPS the username after a failure', async () => {
    await attemptSignIn('admin');

    // Retyping a username you already got right is friction with no security benefit.
    expect(screen.getByTestId('username')).toHaveValue('admin');
    expect(screen.getByTestId('password')).toHaveValue('');
  });

  it('announces the failure as an alert', async () => {
    await attemptSignIn('admin');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

/**
 * BR-AU-07 — an inactive account IS told, because that is not a credential secret and leaving
 * the user guessing generates support tickets. The server only says it once the password is
 * confirmed, so this message cannot be used to probe for usernames.
 */
describe('an inactive account gets its own message (BR-AU-07)', () => {
  it('shows the server not-active message', async () => {
    stubFetch((path) =>
      path.includes('/api/auth/login')
        ? jsonResponse(
            {
              error: {
                code: 'UNAUTHORIZED',
                message: 'This account is not active. Ask an administrator to reactivate it.',
                violations: [],
              },
            },
            401,
          )
        : jsonResponse({ authenticated: false }),
    );
    await renderSignIn();

    await userEvent.type(screen.getByTestId('username'), 'retired-person');
    await userEvent.type(screen.getByTestId('password'), 'correct-password');
    await submitAndSettle();

    expect(await screen.findByTestId('signin-error')).toHaveTextContent(/not active/i);
  });
});

describe('a successful sign-in', () => {
  it('posts the trimmed username and the password', async () => {
    const fetchMock = stubFetch((path) =>
      path.includes('/api/auth/login')
        ? jsonResponse({
            user: {
              userAccountId: 'u-1',
              username: 'admin',
              role: 'ADMIN',
              linkedMemberId: null,
            },
            scope: { role: 'ADMIN', ownMemberId: null },
          })
        : jsonResponse({ authenticated: false }),
    );
    await renderSignIn();

    await userEvent.type(screen.getByTestId('username'), '  admin  ');
    await userEvent.type(screen.getByTestId('password'), 'admin-password');
    await submitAndSettle();

    await waitFor(() => expect(loginCalls(fetchMock)).toHaveLength(1));

    const [, init] = loginCalls(fetchMock)[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      // Trimmed, so a copy-pasted username with stray whitespace still works.
      username: 'admin',
      password: 'admin-password',
    });
    // The cookie is the transport, so credentials must be included or the session is lost.
    expect(init.credentials).toBe('include');
  });

  it('shows no error message', async () => {
    stubFetch((path) =>
      path.includes('/api/auth/login')
        ? jsonResponse({
            user: { userAccountId: 'u-1', username: 'admin', role: 'ADMIN', linkedMemberId: null },
            scope: { role: 'ADMIN', ownMemberId: null },
          })
        : jsonResponse({ authenticated: false }),
    );
    await renderSignIn();

    await userEvent.type(screen.getByTestId('username'), 'admin');
    await userEvent.type(screen.getByTestId('password'), 'admin-password');
    await submitAndSettle();

    await waitFor(() => {
      expect(screen.queryByTestId('signin-error')).not.toBeInTheDocument();
    });
  });
});
