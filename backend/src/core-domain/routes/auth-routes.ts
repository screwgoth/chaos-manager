/**
 * Auth routes — US-ACC-01, 02, 03.
 *
 * These are the only routes reachable without a session, and the only place a cookie is set
 * or cleared.
 */

import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../shared/config';
import type { Services } from '../services';
import { changePasswordSchema, signInSchema } from './schemas';
import {
  clearSessionCookie,
  requireSession,
  setSessionCookie,
} from './session-middleware';

export function registerAuthRoutes(
  app: FastifyInstance,
  services: Services,
  config: AppConfig,
): void {
  const { cookieName, cookieSecure } = config.session;

  /**
   * POST /api/auth/login — US-ACC-01, US-ACC-03.
   *
   * A failure throws UnauthorizedError carrying the single rejection message, so a wrong
   * password and an unknown username are indistinguishable here as well as in the component
   * (BR-AU-04). The response body deliberately contains no hint of which failed.
   */
  app.post('/api/auth/login', async (request, reply) => {
    const credentials = signInSchema.parse(request.body);

    const result = await services.auth.signIn(credentials.username, credentials.password);
    setSessionCookie(reply, cookieName, result.token, cookieSecure);

    // The token goes in the httpOnly cookie ONLY — never in the body, where page JavaScript
    // could read it and an XSS flaw could exfiltrate it.
    return reply.send({
      user: {
        userAccountId: result.identity.userAccountId,
        username: result.identity.username,
        role: result.identity.role,
        linkedMemberId: result.identity.linkedMemberId,
      },
      scope: { role: result.scope.role, ownMemberId: result.scope.ownMemberId },
    });
  });

  /** POST /api/auth/logout — US-ACC-02. Genuine server-side termination (BR-AU-11). */
  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[cookieName];
    if (token) await services.auth.signOut(token);

    // Cleared regardless, so a stale cookie cannot linger in the browser even if the session
    // was already dead.
    clearSessionCookie(reply, cookieName, cookieSecure);
    return reply.send({ signedOut: true });
  });

  /**
   * GET /api/auth/session — who am I?
   *
   * Returns 200 with `authenticated: false` rather than 401 when there is no session: the
   * frontend calls this on load to decide whether to show the sign-in page, and a 401 there
   * is an expected answer, not an error worth logging as one.
   */
  app.get('/api/auth/session', async (request, reply) => {
    if (!request.session) {
      return reply.send({ authenticated: false });
    }

    const { identity, scope, expiresAt } = request.session;
    return reply.send({
      authenticated: true,
      user: {
        userAccountId: identity.userAccountId,
        username: identity.username,
        role: identity.role,
        linkedMemberId: identity.linkedMemberId,
      },
      scope: { role: scope.role, ownMemberId: scope.ownMemberId },
      expiresAt: expiresAt.toISOString(),
    });
  });

  /**
   * POST /api/auth/password — change one's OWN password.
   *
   * The account id comes from the session, never from the body, so this route cannot be used
   * to change somebody else's password. Every other session for the account is terminated.
   */
  app.post('/api/auth/password', async (request, reply) => {
    const session = requireSession(request);
    const { newPassword } = changePasswordSchema.parse(request.body);

    const result = await services.auth.changePassword(
      session.identity.userAccountId,
      newPassword,
    );

    // The caller's own session is among those terminated, so the cookie must go too —
    // otherwise the client holds a token the server has already revoked.
    clearSessionCookie(reply, cookieName, cookieSecure);
    return reply.send({
      passwordChanged: true,
      terminatedSessions: result.terminatedSessions,
      reauthenticationRequired: true,
    });
  });
}
