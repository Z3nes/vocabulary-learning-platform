import { describe, expect, it } from 'vitest';
import { validateTestTargets } from './databaseSafety.js';

const env = {
  DATABASE_URL: 'postgresql://app:placeholder@localhost/dev',
  TEST_DATABASE_URL: 'postgresql://app:placeholder@localhost/project_test',
  TEST_MIGRATION_DATABASE_URL: 'postgresql://migrator:placeholder@localhost/project_test',
};
describe('test database safety before connecting', () => {
  it('accepts different roles targeting the same test database', () => {
    expect(validateTestTargets(env).name).toBe('project_test');
  });
  it.each([
    { TEST_DATABASE_URL: undefined },
    { TEST_MIGRATION_DATABASE_URL: undefined },
    { DATABASE_URL: undefined },
    { TEST_DATABASE_URL: 'postgresql://app@localhost/dev' },
    { TEST_MIGRATION_DATABASE_URL: 'postgresql://migrator@localhost/other_test' },
    { DATABASE_URL: 'postgresql://other-role@localhost/project_test' },
    { TEST_DATABASE_URL: 'postgresql://app@localhost/project_test?database=dev' },
  ])('refuses unsafe or ambiguous targets: %j', (overrides) => {
    expect(() => validateTestTargets({ ...env, ...overrides })).toThrow();
  });
});
