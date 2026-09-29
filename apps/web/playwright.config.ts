import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs the real stack: built NestJS API (port 3100) against an isolated `nexora_e2e`
 * database, and the production web build served by vite preview (port 5174) proxying to it. Ports differ from `pnpm dev`
 * so both can run side by side.
 */
const API_PORT = 3100;
const WEB_PORT = 5174;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://nexora:nexora@127.0.0.1:5432/nexora_e2e?schema=public';
export const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: 'node e2e/prepare-db.mjs && pnpm --filter @nexora/api build && node ../api/dist/main.js',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        JWT_SECRET: randomBytes(32).toString('hex'),
        CORS_ORIGINS: BASE_URL,
        AUTH_RATE_LIMIT: '1000',
        LOG_FORMAT: 'json',
      },
    },
    {
      // The production bundle is tested (vite preview reuses the dev proxy for /api and /socket.io).
      command: `pnpm exec vite build && pnpm exec vite preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
