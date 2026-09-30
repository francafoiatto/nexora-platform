import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  swaggerEnabled: boolean;
  logFormat: 'pretty' | 'json';
  authRateLimit: number;
  /** Number of reverse-proxy hops to trust for client IP (Express "trust proxy"); 0 = trust none. */
  trustProxy: number;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/** Secrets that appear in examples or older builds and must never protect a real deployment. */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'local-only-secret',
  'replace-with-a-local-development-secret',
  'changeme',
  'secret',
]);

export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Loads `apps/api/.env` when present. Real environment variables always win,
 * so CI and hosted environments are unaffected.
 */
export function loadDotEnv(): void {
  // src/config (ts) and dist/src/config (compiled) both resolve to apps/api/.env.
  const candidates = [resolve(__dirname, '../../.env'), resolve(__dirname, '../../../.env'), resolve(process.cwd(), '.env')];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) process.loadEnvFile(found);
}

/**
 * Explicit configuration policy: there are no silent fallbacks for security-relevant values.
 * JWT_SECRET and DATABASE_URL are always required; production additionally requires CORS_ORIGINS.
 */
export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const problems: string[] = [];
  const nodeEnv = (env.NODE_ENV ?? 'development') as NodeEnv;
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    problems.push(`NODE_ENV must be development, test or production (got "${env.NODE_ENV}")`);
  }

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) problems.push('DATABASE_URL is required');
  else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push('DATABASE_URL must be a PostgreSQL connection string');

  const jwtSecret = env.JWT_SECRET ?? '';
  if (!jwtSecret) {
    problems.push('JWT_SECRET is required (no default is provided on purpose)');
  } else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  } else if (KNOWN_PLACEHOLDER_SECRETS.has(jwtSecret)) {
    problems.push('JWT_SECRET is a known placeholder value; generate a random secret');
  }

  const jwtExpiresIn = env.JWT_EXPIRES_IN?.trim() || '2h';
  if (!/^\d+[smhd]$/.test(jwtExpiresIn)) problems.push('JWT_EXPIRES_IN must look like 15m, 2h or 1d');

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) problems.push('PORT must be a valid TCP port');

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.includes('*')) problems.push('CORS_ORIGINS must list explicit origins; "*" is not allowed');
  if (nodeEnv === 'production' && corsOrigins.length === 0) problems.push('CORS_ORIGINS is required in production');
  if (nodeEnv !== 'production' && corsOrigins.length === 0) corsOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');

  const swaggerEnabled = env.SWAGGER_ENABLED === undefined ? nodeEnv !== 'production' : env.SWAGGER_ENABLED === 'true';
  const logFormat = env.LOG_FORMAT === 'json' || (env.LOG_FORMAT === undefined && nodeEnv === 'production') ? 'json' : 'pretty';

  const authRateLimit = Number(env.AUTH_RATE_LIMIT ?? 10);
  if (!Number.isInteger(authRateLimit) || authRateLimit < 1) problems.push('AUTH_RATE_LIMIT must be a positive integer');

  const host = env.HOST?.trim() || '0.0.0.0';

  // Behind a platform proxy (e.g. Railway) every request arrives from the proxy's address. Trusting exactly the
  // declared number of hops lets req.ip (used for rate limiting) be the real client, without trusting spoofable
  // X-Forwarded-For entries added by the client itself.
  const trustProxy = Number(env.TRUST_PROXY ?? 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5) problems.push('TRUST_PROXY must be an integer between 0 and 5');

  if (problems.length) throw new ConfigError(problems);
  return { nodeEnv, port, host, databaseUrl, jwtSecret, jwtExpiresIn, corsOrigins, swaggerEnabled, logFormat, authRateLimit, trustProxy };
}
