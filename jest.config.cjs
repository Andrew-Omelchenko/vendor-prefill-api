/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  // Smoke tests hit a deployed stage and are opt-in (see test:smoke).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/smoke/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/entry/**', // composition root / cold-start wiring, exercised at deploy time
    '!src/domain/types.ts', // re-exports only
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: { statements: 90, branches: 78, functions: 90, lines: 90 },
  },
};
