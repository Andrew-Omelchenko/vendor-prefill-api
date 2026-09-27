/** @type {import('jest').Config} */
// Smoke tests only. Opt-in: the suite activates when SMOKE_BASE_URL is set,
// otherwise its cases are skipped. Run with: npm run test:smoke
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/smoke'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
};
