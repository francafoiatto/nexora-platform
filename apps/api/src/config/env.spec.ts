import { ConfigError, parseConfig } from './env';

const SECRET = 'x'.repeat(40);
const base = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db', JWT_SECRET: SECRET };

const problemsOf = (env: NodeJS.ProcessEnv) => {
  try {
    parseConfig(env);
    return [];
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
};

describe('parseConfig', () => {
  it('applies safe development defaults', () => {
    expect(parseConfig(base)).toEqual({
      nodeEnv: 'development',
      port: 3000,
      databaseUrl: base.DATABASE_URL,
      jwtSecret: SECRET,
      jwtExpiresIn: '2h',
      corsOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      swaggerEnabled: true,
      logFormat: 'pretty',
      authRateLimit: 10,
    });
  });

  it('never falls back to a default JWT secret', () => {
    expect(problemsOf({ DATABASE_URL: base.DATABASE_URL })).toContain('JWT_SECRET is required (no default is provided on purpose)');
  });

  it('rejects short secrets and known placeholders', () => {
    expect(problemsOf({ ...base, JWT_SECRET: 'local-only-secret' })).toEqual(['JWT_SECRET must be at least 32 characters']);
    expect(problemsOf({ ...base, JWT_SECRET: 'replace-with-a-local-development-secret' })).toEqual([
      'JWT_SECRET is a known placeholder value; generate a random secret',
    ]);
  });

  it('requires a PostgreSQL DATABASE_URL', () => {
    expect(problemsOf({ JWT_SECRET: SECRET })).toContain('DATABASE_URL is required');
    expect(problemsOf({ ...base, DATABASE_URL: 'mysql://x' })).toContain('DATABASE_URL must be a PostgreSQL connection string');
  });

  it('requires explicit CORS origins in production and disables Swagger by default there', () => {
    expect(problemsOf({ ...base, NODE_ENV: 'production' })).toEqual(['CORS_ORIGINS is required in production']);
    const config = parseConfig({ ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com, https://admin.example.com' });
    expect(config.corsOrigins).toEqual(['https://app.example.com', 'https://admin.example.com']);
    expect(config.swaggerEnabled).toBe(false);
    expect(config.logFormat).toBe('json');
  });

  it('refuses wildcard CORS', () => {
    expect(problemsOf({ ...base, CORS_ORIGINS: '*' })).toContain('CORS_ORIGINS must list explicit origins; "*" is not allowed');
  });

  it('validates port, expiry and NODE_ENV together', () => {
    const problems = problemsOf({ ...base, PORT: 'abc', JWT_EXPIRES_IN: 'forever', NODE_ENV: 'staging' });
    expect(problems).toHaveLength(3);
  });
});
