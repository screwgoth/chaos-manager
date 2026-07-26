/**
 * ApiClient — the single place the frontend talks to the server.
 *
 * WHY ONE PLACE. Three things must happen on every call and none of them can be left to
 * individual call sites:
 *   1. `credentials: 'include'`, or the session cookie is not sent and everything 401s.
 *   2. The `violations` envelope is parsed into a typed error, so a form can place each
 *      message beside its own input (Q12:A).
 *   3. A 401 mid-session routes to sign-in exactly once, rather than each screen inventing
 *      its own handling of an expired session.
 */

export interface Violation {
  field: string | null;
  rule: string;
  detail: string;
}

/**
 * A failed request. Carries the violations so callers can render field-level messages
 * instead of a single banner.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly violations: Violation[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Violations for one field, for `FieldErrors`. */
  forField(field: string): Violation[] {
    return this.violations.filter((violation) => violation.field === field);
  }

  /** Violations not tied to any field — rendered at the top of a form. */
  get general(): Violation[] {
    return this.violations.filter((violation) => violation.field === null);
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/**
 * Called when the server rejects a request with 401 while the app believed it had a session.
 * Set once by SessionProvider; the client itself knows nothing about routing.
 */
type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/** Endpoints where a 401 is an ANSWER, not a session expiry. */
const EXPECTED_401 = ['/api/auth/login', '/api/auth/session'];

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    // Without this the session cookie is not sent and every authenticated call fails.
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text === '' ? null : safeParse(text);

  if (!response.ok) {
    const envelope = payload as
      | { error?: { code?: string; message?: string; violations?: Violation[] } }
      | null;

    const error = new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? 'The request failed.',
      envelope?.error?.violations ?? [],
    );

    // Sign-in returning 401 is a rejected credential, not an expired session — routing to
    // sign-in from the sign-in page would produce a redirect loop.
    if (error.isUnauthorized && !EXPECTED_401.includes(path.split('?')[0] ?? path)) {
      onUnauthorized?.();
    }

    throw error;
  }

  return payload as T;
}

/**
 * A non-JSON error body (a proxy's HTML 502 page, say) must not crash the client with a
 * parse error on top of the original failure.
 */
function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Builds a query string, omitting empty values so the server sees absent rather than ''. */
export function query(params: Record<string, string | number | boolean | string[] | null | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    // Arrays go as comma-separated, matching the server's csv parsing.
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }

  const rendered = search.toString();
  return rendered === '' ? '' : `?${rendered}`;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown): Promise<T> => request<T>('PATCH', path, body),
  delete: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};
