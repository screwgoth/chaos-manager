/**
 * Configuration from environment variables (U1-NFR-O-06).
 *
 * Rules from infrastructure-design.md section 5:
 *   1. Startup FAILS FAST on any missing required variable, naming every one of them.
 *      No degraded start (U1-NFR-O-03).
 *   2. No secret has a default. A missing POSTGRES_PASSWORD must stop the deployment,
 *      not silently become an empty string.
 *   3. No secret is ever logged, including in startup diagnostics (U1-NFR-O-04).
 */

export interface AppConfig {
  nodeEnv: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  session: {
    cookieName: string;
    cookieSecure: boolean;
    idleMinutes: number;
  };
  contractExpiryWarnDays: number;
  /** Unit 2 import ceilings (BR-IM-02). Non-secret; safe defaults. */
  import: {
    maxRows: number;
    maxBytes: number;
  };
  argon2: {
    memoryKiB: number;
    iterations: number;
    parallelism: number;
  };
  bootstrap: {
    adminUsername: string | null;
    adminPassword: string | null;
  };
  /** Directory of built frontend assets to serve, when present. */
  staticDir: string | null;
}

/** Variables with no safe default. Absence is a startup failure. */
const REQUIRED = ['DATABASE_URL'] as const;

/** Variables whose values must never appear in a log line. */
const SECRET_KEYS = [
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
  'INITIAL_ADMIN_PASSWORD',
] as const;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Configuration error: ${name} must be an integer, got "${raw}".`);
  }
  return parsed;
}

/**
 * Like `intFromEnv`, but refuses zero and negatives.
 *
 * `intFromEnv` accepts them, which is fine for a warning-day count. For an import ceiling it is
 * not: `IMPORT_MAX_ROWS=0` would refuse every file with "over the 0 row limit", which reads as a
 * broken feature rather than a bad value. Failing at startup names the variable instead.
 */
function positiveIntFromEnv(name: string, fallback: number): number {
  const value = intFromEnv(name, fallback);
  if (value <= 0) {
    throw new Error(`Configuration error: ${name} must be greater than zero, got "${value}".`);
  }
  return value;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/**
 * Loads and validates configuration. Collects EVERY missing variable before throwing,
 * so a misconfigured deployment is fixed in one pass rather than one variable per restart.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = REQUIRED.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Configuration error: required environment variable(s) missing or empty: ${missing.join(', ')}. ` +
        `See .env.example. Startup aborted rather than continuing in a degraded state.`,
    );
  }

  const databaseUrl = env.DATABASE_URL as string;

  return {
    nodeEnv: env.NODE_ENV ?? 'production',
    port: intFromEnv('PORT', 3000),
    logLevel: env.LOG_LEVEL ?? 'info',
    databaseUrl,
    session: {
      cookieName: env.SESSION_COOKIE_NAME ?? 'chaos_session',
      cookieSecure: boolFromEnv('SESSION_COOKIE_SECURE', true),
      idleMinutes: intFromEnv('SESSION_IDLE_MINUTES', 30),
    },
    contractExpiryWarnDays: intFromEnv('CONTRACT_EXPIRY_WARN_DAYS', 30),
    import: {
      // BR-IM-02. Validated as POSITIVE, not merely integer: a row cap of 0 would silently refuse
      // every import, and a negative byte cap would refuse every file — both look like the
      // feature is broken rather than misconfigured.
      maxRows: positiveIntFromEnv('IMPORT_MAX_ROWS', 2000),
      maxBytes: positiveIntFromEnv('IMPORT_MAX_BYTES', 5 * 1024 * 1024),
    },
    argon2: {
      memoryKiB: intFromEnv('ARGON2_MEMORY_KIB', 19456),
      iterations: intFromEnv('ARGON2_ITERATIONS', 2),
      parallelism: intFromEnv('ARGON2_PARALLELISM', 1),
    },
    bootstrap: {
      adminUsername: env.INITIAL_ADMIN_USERNAME ?? null,
      adminPassword: env.INITIAL_ADMIN_PASSWORD ?? null,
    },
    staticDir: env.STATIC_DIR ?? null,
  };
}

/**
 * Redacts secret values from anything about to be logged (U1-NFR-O-04).
 * Applied at the logger, not at each call site, so a new log line cannot forget it.
 */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const key of SECRET_KEYS) {
      const secret = process.env[key];
      if (secret && secret.length > 3) out = out.split(secret).join('[REDACTED]');
    }
    // Also mask credentials embedded in any connection URL that appears in text.
    return out.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/gi, '$1[REDACTED]@');
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /password|secret|token|authorization|cookie/i.test(k) ? '[REDACTED]' : redactSecrets(v);
    }
    return out;
  }
  return value;
}

/** Keys pino should redact structurally, in addition to redactSecrets. */
export const LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'password',
  'plainPassword',
  'passwordHash',
  'tokenHash',
  '*.password',
  '*.passwordHash',
];
