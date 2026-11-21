module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testRegex: '.*\.spec\.ts$',
  // Limit CPU/RAM so the laptop stays responsive; types are checked separately with `tsc --noEmit`.
  maxWorkers: 2,
  workerIdleMemoryLimit: '512MB',
  transform: {
    '^.+\.(t|j)s$': ['ts-jest', { isolatedModules: true, diagnostics: false }],
  },
};
