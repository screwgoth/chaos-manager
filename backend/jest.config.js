/** Jest for the backend. CommonJS + ts-jest keeps configuration minimal (see
 *  core-domain-nfr-requirements-clarification-questions.md note on Q10). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
};
