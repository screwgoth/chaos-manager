/**
 * Process entry point.
 *
 * Order matters and is deliberate:
 *   1. load and validate configuration — fail fast, naming EVERY missing variable
 *   2. connect
 *   3. run migrations
 *   4. seed the bootstrap admin, if configured and if no accounts exist
 *   5. listen
 *   6. install signal handlers for graceful shutdown
 *
 * Migrating before listening means the process never serves traffic against a schema it has
 * not finished upgrading. Failing fast on configuration means a missing variable is a startup
 * error naming the variable, not a mystery 500 on the first request that happens to need it.
 */

import { buildApp } from './app';
import { loadConfig } from './shared/config';
import { createDb, createPool, runMigrations, seedReferenceData } from './shared/repository';

async function main(): Promise<void> {
  // Throws with every missing variable listed at once (U1-NFR-O-03). A loop that threw on the
  // first one would make fixing a fresh deployment an iterative guessing game.
  const config = loadConfig();

  const pool = createPool(config.databaseUrl);
  const db = createDb(pool);

  const { app, services } = buildApp({ db, config });

  try {
    const migration = await runMigrations(db);
    if (migration.error) {
      app.log.error({ err: migration.error }, 'migration failed — refusing to start');
      throw migration.error;
    }
    if (migration.applied.length > 0) {
      app.log.info({ applied: migration.applied }, 'migrations applied');
    }

    // Idempotent: guarded by counts, so this is a no-op on every start after the first.
    const seed = await seedReferenceData(db);
    if (!seed.alreadySeeded) {
      app.log.info(
        {
          orgUnits: seed.orgUnitsCreated,
          roles: seed.rolesCreated,
          projectTypes: seed.projectTypesCreated,
        },
        'starter reference data created — rename these to match your organisation',
      );
    }

    await seedBootstrapAdmin(services, config, app.log);

    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info({ port: config.port }, 'listening');
  } catch (error) {
    app.log.error({ err: error }, 'startup failed');
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  /**
   * Graceful shutdown.
   *
   * Fastify's close() waits for in-flight requests, then the pool is drained. Without this, a
   * container restart can abort a request mid-transaction — and for an assignment write, that
   * means the assignment row and its history revision could be interrupted between the two
   * (the transaction protects the data, but the client never learns the outcome).
   */
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return; // a second SIGTERM must not race the first
    shuttingDown = true;

    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await pool.end();
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown');
      process.exitCode = 1;
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/**
 * Creates the first administrator account, ONLY when no user accounts exist at all.
 *
 * The guard is what makes this safe to leave in place: on every subsequent start the account
 * count is non-zero and nothing happens, so a lingering INITIAL_ADMIN_PASSWORD in the
 * environment cannot silently reset a real admin's credentials.
 *
 * The password is never logged, and the log line tells the operator to change it — a
 * bootstrap credential that stays in the environment is a credential in a shell history, a
 * deployment manifest, and a backup.
 */
async function seedBootstrapAdmin(
  services: ReturnType<typeof buildApp>['services'],
  config: ReturnType<typeof loadConfig>,
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void },
): Promise<void> {
  const { adminUsername, adminPassword } = config.bootstrap;
  if (!adminUsername || !adminPassword) return;

  const existing = await services.identity.countAccounts();
  if (existing > 0) return;

  await services.identity.createAccount(
    { username: adminUsername, role: 'ADMIN', homeOrgUnitId: null },
    adminPassword,
  );

  log.warn(
    { username: adminUsername },
    'bootstrap administrator created — change this password and remove INITIAL_ADMIN_PASSWORD from the environment',
  );
}

void main();
