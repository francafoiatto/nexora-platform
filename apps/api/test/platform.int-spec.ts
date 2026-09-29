import { createTestApp, path, type TestContext } from './helpers';

describe('platform', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());

  it('GET /health reports database status without authentication', async () => {
    const res = await ctx.http().get(path('/health')).expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', uptimeSeconds: expect.any(Number) });
  });

  it('serves the OpenAPI document with auth and core routes', async () => {
    const res = await ctx.http().get('/api/docs-json').expect(200);
    expect(res.body.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/me',
        '/api/v1/workspaces/{workspaceId}',
        '/api/v1/workspaces/{workspaceId}/summary',
        '/api/v1/workspaces/{workspaceId}/members',
        '/api/v1/workspaces/{workspaceId}/activities',
        '/api/v1/projects/{projectId}',
        '/api/v1/projects/{projectId}/tasks',
        '/api/v1/tasks/{taskId}',
      ]),
    );
    expect(res.body.components.schemas).toHaveProperty('ErrorResponseDto');
    expect(res.body.components.schemas).toHaveProperty('TaskDto');
  });

  it('returns the error envelope with a request id and no stack trace for unknown routes', async () => {
    const res = await ctx.http().get(path('/does-not-exist')).set('x-request-id', 'trace-12345678').expect(404);
    expect(res.headers['x-request-id']).toBe('trace-12345678');
    expect(res.body).toEqual({ statusCode: 404, code: 'NOT_FOUND', message: expect.any(String), details: [], requestId: 'trace-12345678' });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|\.ts:\d+/);
  });

  it('rejects malformed JSON with the error envelope', async () => {
    const res = await ctx.http().post(path('/auth/login')).set('Content-Type', 'application/json').send('{"email":').expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('only allows configured CORS origins', async () => {
    const allowed = await ctx.http().options(path('/workspaces')).set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await ctx.http().options(path('/workspaces')).set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets security headers', async () => {
    const res = await ctx.http().get(path('/health'));
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
