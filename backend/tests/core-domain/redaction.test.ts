/**
 * Secret redaction — NFR-SE-02's "no credential, password, session token, or hash may
 * appear in any log line".
 *
 * These were written in Step 2 and had NO tests until Step 12's audit found the gap. That
 * matters more than it sounds: redaction is a function whose failure is invisible in
 * normal operation. Nothing breaks when it stops working — secrets simply start appearing
 * in the logs, and the first person to notice is whoever reads the log file.
 */

import { LOG_REDACT_PATHS, redactSecrets } from '../../src/shared/config';

describe('redactSecrets — object keys', () => {
  it('masks a password field by key name, whatever the value', () => {
    const result = redactSecrets({ username: 'admin', password: 'correct-horse' }) as Record<
      string,
      unknown
    >;

    expect(result.password).toBe('[REDACTED]');
    // Non-secret fields survive, or the logs become useless.
    expect(result.username).toBe('admin');
  });

  it('masks the key names that matter, case-insensitively', () => {
    const result = redactSecrets({
      password: 'a',
      Password: 'b',
      passwordHash: 'c',
      plainPassword: 'd',
      sessionToken: 'e',
      tokenHash: 'f',
      Authorization: 'g',
      cookie: 'h',
      apiSecret: 'i',
    }) as Record<string, unknown>;

    for (const key of Object.keys(result)) {
      expect(result[key]).toBe('[REDACTED]');
    }
  });

  it('recurses into nested objects', () => {
    // A secret one level down is just as exposed as one at the top.
    const result = redactSecrets({
      request: { body: { credentials: { password: 'secret-value' } } },
    }) as { request: { body: { credentials: { password: string } } } };

    expect(result.request.body.credentials.password).toBe('[REDACTED]');
  });

  it('recurses into arrays', () => {
    const result = redactSecrets([{ password: 'one' }, { password: 'two' }]) as {
      password: string;
    }[];

    expect(result.map((r) => r.password)).toEqual(['[REDACTED]', '[REDACTED]']);
  });

  it('does not mutate the input', () => {
    const input = { password: 'secret-value' };
    redactSecrets(input);
    // The caller still holds the real value — redaction is for output only.
    expect(input.password).toBe('secret-value');
  });

  it('leaves primitives and null alone', () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
    expect(redactSecrets(true)).toBe(true);
  });
});

describe('redactSecrets — connection URLs', () => {
  it('masks the password inside a PostgreSQL URL', () => {
    // Connection strings reach logs through error messages more often than through
    // deliberate logging, which is exactly why this is pattern-based rather than key-based.
    const message = 'failed to connect to postgres://appuser:sup3rs3cret@db:5432/chaos';
    const result = redactSecrets(message) as string;

    expect(result).not.toContain('sup3rs3cret');
    expect(result).toContain('[REDACTED]');
    // The rest stays readable, so the log is still diagnosable.
    expect(result).toContain('appuser');
    expect(result).toContain('db:5432/chaos');
  });

  it('handles the postgresql:// spelling too', () => {
    const result = redactSecrets('postgresql://u:p4ssw0rd@host/db') as string;
    expect(result).not.toContain('p4ssw0rd');
  });

  it('leaves a URL with no password untouched', () => {
    const url = 'postgres://localhost:5432/chaos';
    expect(redactSecrets(url)).toBe(url);
  });
});

/**
 * Value-based redaction, for secrets interpolated into free text where key-based redaction
 * cannot reach.
 *
 * The variable used here is INITIAL_ADMIN_PASSWORD because that is one of the three
 * secret-bearing variables the config contract actually defines (with DATABASE_URL and
 * POSTGRES_PASSWORD). An earlier version of this test used a SESSION_SECRET that does not
 * exist in this system and failed for that reason — the production code was correct. There
 * is no session signing secret by design: session tokens are 256 bits of randomness, so
 * there is nothing to sign.
 */
describe('redactSecrets — values drawn from the environment', () => {
  const ORIGINAL = process.env.INITIAL_ADMIN_PASSWORD;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.INITIAL_ADMIN_PASSWORD;
    else process.env.INITIAL_ADMIN_PASSWORD = ORIGINAL;
  });

  it('masks a known secret value even when it appears in free text', () => {
    process.env.INITIAL_ADMIN_PASSWORD = 'a-very-distinctive-secret-value';
    const result = redactSecrets(
      'bootstrap failed using password a-very-distinctive-secret-value',
    ) as string;

    expect(result).not.toContain('a-very-distinctive-secret-value');
    expect(result).toContain('[REDACTED]');
  });

  it('masks every occurrence, not only the first', () => {
    process.env.INITIAL_ADMIN_PASSWORD = 'repeated-secret-value';
    const result = redactSecrets(
      'repeated-secret-value appeared, then repeated-secret-value again',
    ) as string;
    expect(result).not.toContain('repeated-secret-value');
  });

  it('ignores a suspiciously short secret rather than redacting everything', () => {
    // A 3-character secret would match constantly and turn every log line into
    // [REDACTED] soup, destroying the logs while protecting nothing.
    process.env.INITIAL_ADMIN_PASSWORD = 'abc';
    const result = redactSecrets('abc appears in this ordinary message') as string;
    expect(result).toContain('abc');
  });

  it('covers the three secret-bearing variables in the config contract', () => {
    // If a fourth secret variable is ever added to .env.example, SECRET_KEYS must grow with
    // it — otherwise its value can be logged verbatim. This test documents the current set.
    for (const key of ['DATABASE_URL', 'POSTGRES_PASSWORD', 'INITIAL_ADMIN_PASSWORD']) {
      const original = process.env[key];
      process.env[key] = 'sentinel-value-for-this-key-only';
      try {
        expect(redactSecrets(`leaked sentinel-value-for-this-key-only via ${key}`)).not.toContain(
          'sentinel-value-for-this-key-only',
        );
      } finally {
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
      }
    }
  });
});

describe('LOG_REDACT_PATHS — the structural pino paths', () => {
  it('covers the credential-bearing fields', () => {
    for (const path of ['password', 'plainPassword', 'passwordHash', 'tokenHash']) {
      expect(LOG_REDACT_PATHS).toContain(path);
    }
  });

  it('covers the request headers that carry credentials', () => {
    // A cookie header contains the session token; an authorization header contains
    // whatever proves identity. Both are logged by default by most HTTP loggers.
    expect(LOG_REDACT_PATHS).toContain('req.headers.cookie');
    expect(LOG_REDACT_PATHS).toContain('req.headers.authorization');
  });

  it('covers nested occurrences via wildcards', () => {
    expect(LOG_REDACT_PATHS).toContain('*.password');
    expect(LOG_REDACT_PATHS).toContain('*.passwordHash');
  });
});

/**
 * The end-to-end shape of the property: a realistic request-ish object carrying every kind
 * of secret this system handles, asserted to emerge with none of them.
 */
describe('a realistic log payload emerges with no secrets (NFR-SE-02)', () => {
  it('strips passwords, hashes and tokens together', () => {
    const payload = {
      msg: 'sign-in attempt',
      req: {
        headers: {
          cookie: 'chaos_session=eyJhbGciOi-real-token-value',
          authorization: 'Bearer real-bearer-token',
          'user-agent': 'Mozilla/5.0',
        },
        body: { username: 'admin', password: 'correct-horse-battery-staple' },
      },
      account: {
        username: 'admin',
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
      },
      session: { tokenHash: 'e3b0c44298fc1c149afbf4c8996fb924' },
    };

    const serialised = JSON.stringify(redactSecrets(payload));

    for (const secret of [
      'correct-horse-battery-staple',
      '$argon2id$',
      'e3b0c44298fc1c149afbf4c8996fb924',
      'real-bearer-token',
      'eyJhbGciOi-real-token-value',
    ]) {
      expect(serialised).not.toContain(secret);
    }

    // And the diagnostically useful parts survive.
    expect(serialised).toContain('sign-in attempt');
    expect(serialised).toContain('admin');
    expect(serialised).toContain('Mozilla/5.0');
  });
});
