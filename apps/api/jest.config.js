/** @type {import('jest').Config} */
const shared = {
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }] },
  moduleNameMapper: { '^@nexora/contracts$': '<rootDir>/../../packages/contracts/src/index.ts' },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
};

module.exports = {
  testTimeout: 30000,
  projects: [
    // Pure unit tests: no database, no network.
    { ...shared, displayName: 'unit', roots: ['<rootDir>/src', '<rootDir>/test'], testRegex: '(?<!int-)\\.spec\\.ts$' },
    // Integration tests: full Nest app + real PostgreSQL (nexora_test database).
    {
      ...shared,
      displayName: 'integration',
      roots: ['<rootDir>/test'],
      testRegex: '\\.int-spec\\.ts$',
      globalSetup: '<rootDir>/test/global-setup.ts',
      setupFiles: ['<rootDir>/test/env.ts'],
    },
  ],
};
