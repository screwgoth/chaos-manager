/**
 * Session middleware — cookie → token hash → resolved identity → scope.
 *
 * BR-R-06 IS ENFORCED HERE, STRUCTURALLY. The identity attached to a request comes only from
 * a resolved session cookie. There is no code path that reads a role, an org unit, a member
 * id, or a scope from a header, a query parameter or a body — so a client cannot assert who
 * it is, only present a token.
 *
 * The token itself never reaches a log: `LOG_REDACT_PATHS` covers `req.headers.cookie`, and
 * nothing here logs the raw value.
 */

// Imported for its TYPE AUGMENTATION, not for a value: @fastify/cookie is what adds
// `request.cookies`, `reply.setCookie` and `reply.clearCookie` to Fastify's interfaces.
// Without this import they do not exist as far as TypeScript is concerned.
import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors';
import type { AccessScope } from '../../shared/types/authorization';
import type { VerifiedIdentity } from '../../shared/types/domain';
import type { AuthService } from '../services';

/** Attached to the request once a session resolves. */
export interface RequestSession {
  identity: VerifiedIdentity;
  scope: AccessScope;
  sessionId: string;
  expiresAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Present only when a valid session cookie was supplied. */
    session?: RequestSession;
  }
}

export interface SessionMiddlewareOptions {
  auth: AuthService;
  cookieName: string;
}

/**
 * Resolves the session if a cookie is present, and attaches it. Does NOT reject — that is
 * `requireSession`'s job, so unauthenticated routes (sign-in, health) can share the same
 * pipeline.
 */
export function createSessionResolver({ auth, cookieName }: SessionMiddlewareOptions) {
  return async function resolveSession(request: FastifyRequest): Promise<void> {
    const token = request.cookies[cookieName];
    if (!token) return;

    const session = await auth.currentSession(token);
    // An expired or unknown session leaves `request.session` undefined, exactly as if no
    // cookie had been sent (BR-AU-12: no state from it carries forward).
    if (session) request.session = session;
  };
}

/**
 * Guard for authenticated routes.
 *
 * Throws rather than returning a reply so the single error mapper produces the envelope —
 * two places generating 401 bodies is two places for them to diverge.
 */
export function requireSession(request: FastifyRequest): RequestSession {
  if (!request.session) {
    throw new UnauthorizedError('Sign in to continue.');
  }
  return request.session;
}

/** Convenience: the identity every service method takes as its first authorization input. */
export function identityOf(request: FastifyRequest): VerifiedIdentity {
  return requireSession(request).identity;
}

/**
 * Sets the session cookie.
 *
 * httpOnly: JavaScript cannot read it, so an XSS flaw cannot exfiltrate the session.
 * sameSite lax: blocks cross-site POST CSRF while still allowing normal top-level
 *   navigation into the app.
 * secure: from configuration, because a local HTTP deployment would otherwise never receive
 *   the cookie at all — but it MUST be true wherever TLS terminates in front of the app.
 * maxAge is deliberately ABSENT: a session cookie dies with the browser session, and the
 *   authoritative expiry is the server-side sliding timeout, not a client-side timer.
 */
export function setSessionCookie(
  reply: FastifyReply,
  cookieName: string,
  token: string,
  secure: boolean,
): void {
  reply.setCookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  });
}

export function clearSessionCookie(
  reply: FastifyReply,
  cookieName: string,
  secure: boolean,
): void {
  reply.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}
