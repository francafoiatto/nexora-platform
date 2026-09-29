// Prepares the isolated E2E database: applies migrations (creating the DB if needed) and empties it.
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL ?? '';
if (!/\/nexora_e2e(\?|$)/.test(url)) {
  console.error(`Refusing to prepare a database that is not nexora_e2e: ${url.replace(/:[^:@/]+@/, ':***@')}`);
  process.exit(1);
}
const api = resolve(dirname(fileURLToPath(import.meta.url)), '../../api');
const run = (cmd, input) => execSync(cmd, { cwd: api, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit', input, env: process.env });

run('pnpm exec prisma migrate deploy');
run(
  'pnpm exec prisma db execute --stdin --schema prisma/schema.prisma',
  'TRUNCATE "Activity", "Task", "Project", "WorkspaceMember", "Workspace", "User" CASCADE;',
);
console.warn('E2E database ready.');
