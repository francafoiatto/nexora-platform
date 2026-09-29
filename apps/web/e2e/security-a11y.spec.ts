import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { createFirstWorkspace, createProject, register, uniqueEmail } from './support';

test('a user cannot open another tenant’s workspace or project by URL', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  await register(a, 'Tenant A', uniqueEmail('tenant-a'));
  const workspaceA = await createFirstWorkspace(a, 'Private A');
  const boardA = await createProject(a, workspaceA, 'Secret Project');
  await a.getByLabel('Quick add a task to To do').fill('Confidential task');
  await a.keyboard.press('Enter');
  await expect(a.getByRole('article', { name: 'Confidential task' })).toBeVisible();

  await register(b, 'Tenant B', uniqueEmail('tenant-b'));
  await createFirstWorkspace(b, 'Private B');

  await b.goto(`/app/${workspaceA}`);
  await expect(b.getByText('Workspace not found')).toBeVisible();
  await b.goto(boardA);
  await expect(b.getByText('Workspace not found')).toBeVisible();
  await expect(b.getByText('Confidential task')).toHaveCount(0);
  await expect(b.getByText('Secret Project')).toHaveCount(0);
  await contextA.close();
  await contextB.close();
});

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

test('WCAG 2.1 AA automated audit of every screen', async ({ page }) => {
  await page.goto('/login');
  await audit(page, 'login');
  await page.goto('/register');
  await audit(page, 'register');

  await register(page, 'Audit User', uniqueEmail('a11y'));
  await audit(page, 'onboarding');
  const workspaceId = await createFirstWorkspace(page, 'Audit Ops');
  const boardUrl = await createProject(page, workspaceId, 'Audit Project');
  await page.getByLabel('Quick add a task to To do').fill('Audited task');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article', { name: 'Audited task' })).toBeVisible();
  await audit(page, 'board');

  await page.getByRole('button', { name: 'Audited task' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
  await audit(page, 'task dialog');
  await page.keyboard.press('Escape');

  for (const [path, label] of [
    [`/app/${workspaceId}`, 'dashboard'],
    [`/app/${workspaceId}/projects`, 'projects'],
    [`/app/${workspaceId}/activity`, 'activity'],
    [`/app/${workspaceId}/settings`, 'settings'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await audit(page, label);
  }
  await page.goto(boardUrl);
});

test('keyboard: skip link, dialog focus and Escape', async ({ page }) => {
  await register(page, 'Keyboard User', uniqueEmail('kbd'));
  const workspaceId = await createFirstWorkspace(page, 'Keyboard Ops');
  await createProject(page, workspaceId, 'Keys');

  // On a fresh page load the first Tab reaches the skip link, which moves focus to the main region.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Keys', level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  // Opening the dialog moves focus inside it; Escape closes it and focus returns to the opener.
  const opener = page.getByRole('button', { name: 'New task' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New task' });
  await expect(dialog.getByLabel('Title')).toBeFocused();
  await page.keyboard.type('Typed with keyboard');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  // Reopening starts from a clean form, and fast typing right after opening is never lost
  // (regression: an effect-driven form reset used to wipe the first keystrokes).
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Title')).toBeFocused();
  await expect(dialog.getByLabel('Title')).toHaveValue('');
  await page.keyboard.type('Keyboard task');
  await expect(dialog.getByLabel('Title')).toHaveValue('Keyboard task');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article', { name: 'Keyboard task', exact: true })).toBeVisible();
});
