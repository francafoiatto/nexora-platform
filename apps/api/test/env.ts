import { randomBytes } from 'node:crypto';

/** Environment for integration tests. Never points at the development database. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://nexora:nexora@127.0.0.1:5432/nexora_test?schema=public';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
// Fresh random secret per test run: nothing secret-looking is committed.
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN = '15m';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.AUTH_RATE_LIMIT = process.env.AUTH_RATE_LIMIT ?? '1000';
process.env.SWAGGER_ENABLED = 'true';
