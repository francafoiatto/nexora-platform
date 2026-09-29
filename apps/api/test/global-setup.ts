import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { TEST_DATABASE_URL } from './env';

/** Applies all migrations to the isolated test database (Prisma creates it if missing). */
export default function globalSetup() {
  if (/\/nexora(\?|$)/.test(TEST_DATABASE_URL)) {
    throw new Error('Refusing to run integration tests against the development database "nexora".');
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
