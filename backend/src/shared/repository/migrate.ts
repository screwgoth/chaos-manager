/**
 * Migration runner.
 *
 * Invoked at startup BEFORE the server listens (deployment-architecture.md section 2,
 * step 4). This guarantees the schema matches the code about to serve traffic, and
 * removes the need for a separate migration step in the deployment procedure — which
 * matters because there is no CI to run one (NFR-Q-01).
 *
 * Consequence, stated rather than hidden: a failing migration means the app does not
 * start. That is correct — serving traffic against a half-migrated schema is worse —
 * but it does mean a bad migration takes the service down rather than degrading it.
 */

import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { FileMigrationProvider, Migrator } from 'kysely';
import type { Db } from './db';

export interface MigrationOutcome {
  applied: string[];
  failed: string | null;
  error: Error | null;
}

function migrationsFolder(): string {
  // Compiled output lives in dist/shared/repository; migrations sit at backend/migrations.
  // Resolve relative to this file so it works from both src (tsx) and dist (node).
  return path.resolve(__dirname, '../../../migrations');
}

export async function runMigrations(db: Db): Promise<MigrationOutcome> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: migrationsFolder(),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  const applied: string[] = [];
  let failed: string | null = null;

  for (const result of results ?? []) {
    if (result.status === 'Success') applied.push(result.migrationName);
    else if (result.status === 'Error') failed = result.migrationName;
  }

  return {
    applied,
    failed,
    error: error instanceof Error ? error : error ? new Error(String(error)) : null,
  };
}

/** Standalone entry point: `npm run migrate`. */
if (require.main === module) {
  void (async () => {
    const { loadConfig } = await import('../config');
    const { createPool, createDb } = await import('./db');
    const config = loadConfig();
    const pool = createPool(config.databaseUrl);
    const db = createDb(pool);
    try {
      const outcome = await runMigrations(db);
      for (const name of outcome.applied) process.stdout.write(`applied: ${name}\n`);
      if (outcome.error) {
        process.stderr.write(`migration failed at ${outcome.failed}: ${outcome.error.message}\n`);
        process.exitCode = 1;
      } else if (outcome.applied.length === 0) {
        process.stdout.write('no pending migrations\n');
      }
    } finally {
      await db.destroy();
    }
  })();
}
