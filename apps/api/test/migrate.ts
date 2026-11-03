import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadLocalEnvironment, verifyTestDatabase } from './databaseSafety.js';

loadLocalEnvironment();
try {
  const targets = await verifyTestDatabase();
  const require = createRequire(import.meta.url);
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        // Prisma's output may include connection metadata; emit only our safe summary.
        stdio: 'ignore',
        env: { ...process.env, MIGRATION_DATABASE_URL: targets.migration },
      },
    );
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0)
    throw new Error('Test migration failed; inspect credentials and database grants locally');
  console.log('Dedicated test database safety verified; migrations applied successfully.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Test migration failed');
  process.exitCode = 1;
}
