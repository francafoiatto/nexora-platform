import { JwtService } from '@nestjs/jwt';
import { createTestApp, path, registerUser, resetDatabase, type TestContext } from './helpers';

describe('auth', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.db);
  });
  afterAll(() => ctx.app.close());

  describe('POST /auth/register', () => {
    it('creates an account, normalizes the email and returns a session without the password hash', async () => {
      const res = await ctx
        .http()
        .post(path('/auth/register'))
        .send({ name: '  Jordan Lee ', email: ' Jordan@Example.TEST ', password: 'correct-horse-battery' })
        .expect(201);
      expect(res.body).toEqual({
        accessToken: expect.any(String),
        expiresIn: 900,
        user: { id: expect.any(String), name: 'Jordan Lee', email: 'jordan@example.test' },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|correct-horse/);
      const stored = await ctx.db.user.findUniqueOrThrow({ where: { email: 'jordan@example.test' } });
      expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    });

    it('rejects a duplicate email (case-insensitive) with 409 EMAIL_TAKEN', async () => {
      const res = await ctx
        .http()
        .post(path('/auth/register'))
        .send({ name: 'Jordan', email: 'JORDAN@example.test', password: 'another-password' })
        .expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN', details: [{ field: 'email' }] });
    });

    it('validates input with field-level details', async () => {
      const res = await ctx.http().post(path('/auth/register')).send({ name: 'J', email: 'nope', password: 'short' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      const fields = res.body.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    });

    it('rejects unknown properties', async () => {
      const res = await ctx
        .http()
        .post(path('/auth/register'))
        .send({ name: 'Mallory', email: 'm@example.test', password: 'long-enough-pw', role: 'OWNER' })
        .expect(400);
      expect(res.body.details).toEqual([{ field: 'role', message: 'property role should not exist' }]);
    });
  });

  describe('POST /auth/login', () => {
    it('returns a session for valid credentials', async () => {
      const res = await ctx.http().post(path('/auth/login')).send({ email: 'jordan@example.test', password: 'correct-horse-battery' }).expect(200);
      expect(res.body.user.email).toBe('jordan@example.test');
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const wrong = await ctx.http().post(path('/auth/login')).send({ email: 'jordan@example.test', password: 'wrong-password' }).expect(401);
      const unknown = await ctx.http().post(path('/auth/login')).send({ email: 'ghost@example.test', password: 'wrong-password' }).expect(401);
      expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      expect({ ...unknown.body, requestId: undefined }).toEqual({ ...wrong.body, requestId: undefined });
    });

    it('validates the payload', async () => {
      const res = await ctx.http().post(path('/auth/login')).send({ email: 'bad' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user', async () => {
      const user = await registerUser(ctx, 'Me Test');
      const res = await ctx.http().get(path('/auth/me')).set(user.auth).expect(200);
      expect(res.body).toEqual({ id: user.id, name: 'Me Test', email: user.email });
    });

    it('requires a token', async () => {
      const res = await ctx.http().get(path('/auth/me')).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', details: [] });
    });

    it('rejects tokens signed with another secret', async () => {
      const foreign = new JwtService({ secret: 'some-other-secret-that-is-also-long-0123456789' }).sign({ sub: 'x' });
      await ctx.http().get(path('/auth/me')).set('Authorization', `Bearer ${foreign}`).expect(401);
    });

    it('rejects expired tokens', async () => {
      const user = await registerUser(ctx);
      const expired = new JwtService({ secret: process.env.JWT_SECRET }).sign({ sub: user.id }, { expiresIn: -10 });
      await ctx.http().get(path('/auth/me')).set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('rejects "alg: none" tokens', async () => {
      const user = await registerUser(ctx);
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id })}.`;
      await ctx.http().get(path('/auth/me')).set('Authorization', `Bearer ${unsigned}`).expect(401);
    });

    it('rejects a valid token whose user no longer exists', async () => {
      const user = await registerUser(ctx);
      await ctx.db.user.delete({ where: { id: user.id } });
      await ctx.http().get(path('/auth/me')).set(user.auth).expect(401);
    });
  });
});

describe('auth rate limiting', () => {
  let ctx: TestContext;
  const previous = process.env.AUTH_RATE_LIMIT;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '3';
    ctx = await createTestApp();
  });
  afterAll(async () => {
    process.env.AUTH_RATE_LIMIT = previous;
    await ctx.app.close();
  });

  it('returns 429 RATE_LIMITED after too many login attempts', async () => {
    const attempt = () => ctx.http().post(path('/auth/login')).send({ email: 'ghost@example.test', password: 'nope-nope' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });
});

describe('rate limiting behind a proxy', () => {
  const previous = { limit: process.env.AUTH_RATE_LIMIT, proxy: process.env.TRUST_PROXY };
  afterEach(() => {
    process.env.AUTH_RATE_LIMIT = previous.limit;
    process.env.TRUST_PROXY = previous.proxy;
  });

  const attempt = (ctx: TestContext, clientIp: string) =>
    ctx.http().post(path('/auth/login')).set('X-Forwarded-For', clientIp).send({ email: 'ghost@example.test', password: 'nope-nope' });

  it('with TRUST_PROXY=1 each client IP gets its own bucket', async () => {
    process.env.AUTH_RATE_LIMIT = '2';
    process.env.TRUST_PROXY = '1';
    const ctx = await createTestApp();
    try {
      for (let i = 0; i < 2; i++) expect((await attempt(ctx, '203.0.113.10')).status).toBe(401);
      expect((await attempt(ctx, '203.0.113.10')).status).toBe(429);
      // A different real client behind the same proxy is not blocked by the first one.
      expect((await attempt(ctx, '198.51.100.20')).status).toBe(401);
    } finally {
      await ctx.app.close();
    }
  });

  it('without a trusted proxy a spoofed X-Forwarded-For does not bypass the limit', async () => {
    process.env.AUTH_RATE_LIMIT = '2';
    delete process.env.TRUST_PROXY;
    const ctx = await createTestApp();
    try {
      expect((await attempt(ctx, '203.0.113.1')).status).toBe(401);
      expect((await attempt(ctx, '203.0.113.2')).status).toBe(401);
      expect((await attempt(ctx, '203.0.113.3')).status).toBe(429);
    } finally {
      await ctx.app.close();
    }
  });
});
