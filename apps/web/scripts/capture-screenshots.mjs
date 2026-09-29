// Captures the README/docs screenshots from a running local stack with the demo seed loaded.
//   pnpm db:seed && pnpm dev   (in another terminal)
//   node apps/web/scripts/capture-screenshots.mjs [baseUrl]
// Uses only the fictional demo account created by the seed.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function session(viewport, suffix) {
  const context = await browser.newContext({ viewport, locale: 'en-US', colorScheme: 'dark', deviceScaleFactor: suffix === 'mobile' ? 2 : 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shot = async (name) => {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}-${suffix}.png` });
    console.warn(`saved ${name}-${suffix}.png`);
  };

  await page.goto(`${base}/login`);
  await page.getByLabel('Work email').fill('demo@nexora.local');
  await page.getByLabel('Password').fill('demo-password');
  if (suffix === 'desktop') await shot('login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}$/);
  await page.getByText('Recent activity').waitFor();
  const workspaceId = page.url().split('/app/')[1];
  await shot('dashboard');

  await page.goto(`${base}/app/${workspaceId}/projects`);
  await page.getByRole('link', { name: 'Platform launch' }).waitFor();
  await shot('projects');

  await page.getByRole('link', { name: 'Platform launch' }).click();
  await page.getByTestId('task-card').first().waitFor();
  await shot('board');

  await page.getByRole('button', { name: 'Prepare onboarding flow' }).click();
  await page.getByRole('dialog', { name: 'Edit task' }).waitFor();
  await shot('task-dialog');
  await page.keyboard.press('Escape');

  await page.goto(`${base}/app/${workspaceId}/activity`);
  await page.getByRole('heading', { name: 'Activity', level: 1 }).waitFor();
  await shot('activity');

  if (suffix === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Settings', exact: true }).waitFor();
    await shot('navigation');
  } else {
    await page.goto(`${base}/app/${workspaceId}/settings`);
    await page.getByText('Priya Shah').waitFor();
    await shot('settings');
  }
  await context.close();
}

await session({ width: 1440, height: 900 }, 'desktop');
await session({ width: 375, height: 812 }, 'mobile');
await browser.close();

if (errors.length) {
  console.error('Browser errors during capture:', errors);
  process.exit(1);
}
