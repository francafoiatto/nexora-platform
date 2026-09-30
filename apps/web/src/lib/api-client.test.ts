import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(apiUrl: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', apiUrl ?? '');
  return import('./api-client');
}

describe('API location', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the same-origin proxy path when VITE_API_URL is not set', async () => {
    const { API_URL, API_ORIGIN } = await load(undefined);
    expect(API_URL).toBe('/api/v1');
    expect(API_ORIGIN).toBeUndefined();
  });

  it('derives the API origin (used by Socket.IO) from an absolute VITE_API_URL', async () => {
    const { API_URL, API_ORIGIN } = await load('https://api.example.com/api/v1');
    expect(API_URL).toBe('https://api.example.com/api/v1');
    expect(API_ORIGIN).toBe('https://api.example.com');
  });
});
