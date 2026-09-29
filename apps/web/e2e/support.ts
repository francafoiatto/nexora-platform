import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'e2e-password-123';

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.test`;
}

export async function register(page: Page, name: string, email: string) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Create your first workspace' })).toBeVisible();
}

/** Signs in. Pass navigate=false to use the current login page (keeps its ?redirect=). */
export async function login(page: Page, email: string, navigate = true) {
  if (navigate) await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** From onboarding: creates a workspace and returns its id. */
export async function createFirstWorkspace(page: Page, name: string) {
  await page.getByLabel('Workspace name').fill(name);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good');
  return page.url().split('/app/')[1];
}

/** Creates a project from the Projects page and lands on its board; returns the board URL. */
export async function createProject(page: Page, workspaceId: string, name: string) {
  await page.goto(`/app/${workspaceId}/projects`);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByLabel('Description').fill(`${name} description`);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return page.url();
}

export const column = (page: Page, name: string) => page.getByRole('listitem', { name });
