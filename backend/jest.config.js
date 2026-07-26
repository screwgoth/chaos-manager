/** Jest for the backend. CommonJS + ts-jest keeps configuration minimal (see
 *  core-domain-nfr-requirements-clarification-questions.md note on Q10). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,

  /**
   * Serialise when a test database is configured.
   *
   * The integration suites share ONE database and each drops and recreates the `public`
   * schema in beforeAll, so running them in parallel makes them delete each other's
   * tables mid-run — which surfaced as 27 confusing failures with foreign-key and
   * missing-relation errors that had nothing to do with the code under test.
   *
   * The alternative (a schema or database per suite) buys parallelism these suites do not
   * need: they complete in a few seconds. Correctness first; revisit if the DB suite
   * grows slow enough to matter.
   *
   * Pure unit suites still run in parallel, because this only applies when
   * TEST_DATABASE_URL is set.
   */
  maxWorkers: process.env.TEST_DATABASE_URL ? 1 : '50%',
};

/**
 * NOTE on `--experimental-vm-modules`.
 *
 * `npm test` runs jest through `node --experimental-vm-modules` (see package.json). It is
 * required because @fastify/cookie loads its cookie parser with a dynamic `import()`, which
 * Jest's CommonJS VM refuses without that flag — the API suite fails with "A dynamic import
 * callback was invoked without --experimental-vm-modules" otherwise.
 *
 * Running `npx jest` directly will therefore fail on the API suite. Use `npm test`.
 */
