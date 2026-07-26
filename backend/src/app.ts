/**
 * Fastify application assembly.
 *
 * Separated from `server.ts` so tests can build an app over an injected database without
 * binding a port or reading the real environment.
 */

import cookie from '@fastify/cookie';
import staticPlugin from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig } from './shared/config';
import { LOG_REDACT_PATHS, redactSecrets } from './shared/config';
import { checkDatabase, type Db } from './shared/repository';
import { createServices, type Services } from './core-domain/services';
import { registerAdminRoutes } from './core-domain/routes/admin-routes';
import { registerAllocationRoutes } from './core-domain/routes/allocation-routes';
import { registerAssignmentRoutes } from './core-domain/routes/assignment-routes';
import { registerAuthRoutes } from './core-domain/routes/auth-routes';
import { mapError } from './core-domain/routes/error-mapper';
import { registerMemberRoutes } from './core-domain/routes/member-routes';
import { registerProjectRoutes } from './core-domain/routes/project-routes';
import { createSessionResolver } from './core-domain/routes/session-middleware';

export interface BuildAppOptions {
  db: Db;
  config: AppConfig;
  /** Pre-built services, for tests that need to substitute one. */
  services?: Services;
}

export interface BuiltApp {
  app: FastifyInstance;
  services: Services;
}

export function buildApp({ db, config, services: provided }: BuildAppOptions): BuiltApp {
  const services = provided ?? createServices(db, config);

  // Explicitly annotated: without it TypeScript resolves Fastify's overloads to the HTTP/2
  // variant, and every route registration then fails to typecheck against FastifyInstance.
  const app: FastifyInstance = Fastify({
    logger: {
      level: config.logLevel,
      /**
       * U1-NFR-O-04: secrets redacted AT THE LOGGER, so no call site has to remember.
       * Structural paths cover known fields; `redactSecrets` catches values interpolated
       * into messages, which paths cannot reach.
       */
      redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
      serializers: {
        err: (error: Error) => ({
          type: error.name,
          message: String(redactSecrets(error.message)),
          // Defaulted rather than optional: pino's serializer contract requires a string,
          // and an error without a stack is still worth logging.
          stack: error.stack ?? '',
        }),
      },
    },
    // Trust the reverse proxy for client addresses; Caddy terminates TLS in front of this.
    trustProxy: true,
    /**
     * Fastify's own request/response log PAIR is replaced by the single explicit line in the
     * onResponse hook below — one line per request is far easier to scan, and the duration is
     * what an operator actually wants.
     *
     * DEPRECATION, knowingly accepted: Fastify 5 warns that this option moves to
     * `logController` in v6. The replacement takes a LogController CLASS to subclass, which is
     * a lot of machinery for suppressing two log lines, so the warning stands until the v6
     * upgrade. Noted here so the upgrade has a pointer rather than a surprise.
     */
    disableRequestLogging: true,
  });

  app.register(cookie);

  /**
   * U1-NFR-O-01: one log line per request with method, path, status and duration.
   *
   * Written explicitly rather than using Fastify's default pair of lines, because one line
   * per request is far easier to scan and the duration is what an operator actually wants.
   * The query string is NOT logged: it can carry member ids, which are personal data.
   */
  app.addHook('onRequest', async (request) => {
    (request as { startTime?: bigint }).startTime = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request, reply) => {
    const start = (request as { startTime?: bigint }).startTime;
    const durationMs =
      start === undefined ? undefined : Number(process.hrtime.bigint() - start) / 1e6;

    request.log.info(
      {
        method: request.method,
        path: request.routeOptions?.url ?? request.url.split('?')[0],
        status: reply.statusCode,
        durationMs: durationMs === undefined ? undefined : Math.round(durationMs * 100) / 100,
        userAccountId: request.session?.identity.userAccountId ?? null,
      },
      'request',
    );
  });

  // Resolve the session before every handler. Does not reject — individual routes require it.
  app.addHook('preHandler', createSessionResolver({
    auth: services.auth,
    cookieName: config.session.cookieName,
  }));

  /**
   * The single error boundary (Q12:A). Every failure leaves in the same envelope.
   *
   * An unrecognised error is logged with its stack and returned as a generic 500 — echoing an
   * unknown error's message is how stack traces and SQL fragments reach browsers.
   */
  app.setErrorHandler(async (error, request, reply) => {
    const mapped = mapError(error);

    if (mapped.logCause !== null) {
      request.log.error({ err: mapped.logCause }, 'unhandled error');
    } else if (mapped.status >= 500) {
      request.log.error({ err: error }, 'server error');
    }

    return reply.code(mapped.status).send(mapped.body);
  });

  /**
   * GET /health — unauthenticated, by design.
   *
   * A health check that requires credentials cannot be used by the thing that needs it most:
   * the container orchestrator. It reports database connectivity but NOTHING about
   * configuration, versions or internals, so it is safe to leave open.
   *
   * Returns 503 when the database is unreachable, so a load balancer takes the instance out
   * of rotation rather than sending it traffic it cannot serve.
   */
  app.get('/health', async (_request, reply) => {
    const databaseReachable = await checkDatabase(db);
    return reply
      .code(databaseReachable ? 200 : 503)
      .send({ status: databaseReachable ? 'ok' : 'degraded', database: databaseReachable });
  });

  registerAuthRoutes(app, services, config);
  registerMemberRoutes(app, services);
  registerProjectRoutes(app, services);
  registerAssignmentRoutes(app, services);
  registerAllocationRoutes(app, services);
  registerAdminRoutes(app, services);

  // --- static frontend ----------------------------------------------------

  const assetRoot = config.staticDir === null ? null : resolve(config.staticDir);
  const servingAssets = assetRoot !== null && existsSync(assetRoot);

  if (servingAssets && assetRoot !== null) {
    app.register(staticPlugin, { root: assetRoot, prefix: '/' });
  }

  /**
   * EXACTLY ONE not-found handler.
   *
   * Fastify permits only one per encapsulation context and throws on a second registration —
   * an earlier version of this file registered one unconditionally and another inside the
   * static-assets branch, which meant the server refused to start whenever STATIC_DIR pointed
   * at a real directory. That is the deployment configuration, so it would have failed in
   * production and passed in development.
   *
   * An /api/ path always gets the JSON envelope, so a mistyped endpoint never returns HTML a
   * client cannot parse. Any other path serves index.html when assets are present, so
   * client-side routes survive a page refresh.
   */
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'No such endpoint.', violations: [] },
      });
    }
    if (servingAssets) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'Not found.', violations: [] },
    });
  });

  return { app, services };
}
