import { expect, test } from '@playwright/test';
import { column, createFirstWorkspace, createProject, register, uniqueEmail } from './support';

test('mobile (375px): navigation drawer, board and no horizontal page overflow', async ({ page }) => {
  await register(page, 'Mobile User', uniqueEmail('mobile'));
  const workspaceId = await createFirstWorkspace(page, 'Mobile Ops');

  // The sidebar is off-canvas; the menu button opens it.
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Activity', exact: true })).toBeHidden(); // drawer closes on navigation

  await createProject(page, workspaceId, 'Pocket Board');
  await page.getByLabel('Quick add a task to To do').fill('Tap-friendly task');
  await page.keyboard.press('Enter');
  await expect(column(page, 'To do').getByRole('article', { name: 'Tap-friendly task' })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The board itself scrolls horizontally to reach the other columns.
  await column(page, 'Done').scrollIntoViewIfNeeded();
  await expect(column(page, 'Done')).toBeInViewport();
});
