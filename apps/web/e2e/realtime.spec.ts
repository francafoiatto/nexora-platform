import { expect, test } from '@playwright/test';
import { column, createFirstWorkspace, createProject, register, uniqueEmail } from './support';

test('realtime: a teammate sees task changes without reloading', async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const teammateContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const teammate = await teammateContext.newPage();

  const teammateEmail = uniqueEmail('teammate');
  await register(teammate, 'Taylor Teammate', teammateEmail);

  await register(owner, 'Olivia Owner', uniqueEmail('owner'));
  const workspaceId = await createFirstWorkspace(owner, 'Realtime Ops');
  const boardUrl = await createProject(owner, workspaceId, 'Live Board');

  // Owner adds the teammate to the workspace.
  await owner.goto(`/app/${workspaceId}/settings`);
  await owner.getByLabel('Add a teammate by email').fill(teammateEmail);
  await owner.getByRole('button', { name: 'Add member' }).click();
  await expect(owner.getByText('Taylor Teammate')).toBeVisible();

  // Both open the same board and are connected to the workspace room.
  await owner.goto(boardUrl);
  await teammate.goto(boardUrl);
  for (const page of [owner, teammate]) {
    await expect(page.getByRole('status').filter({ hasText: 'Live' }).first()).toBeAttached();
    await expect(column(page, 'To do')).toBeVisible();
  }
  await expect(teammate.locator('.live-live').first()).toBeAttached();

  // Create → teammate sees it.
  await owner.getByLabel('Quick add a task to To do').fill('Live task');
  await owner.keyboard.press('Enter');
  await expect(column(teammate, 'To do').getByRole('article', { name: 'Live task' })).toBeVisible();

  // Status change → teammate sees it move.
  await owner.getByLabel('Status of Live task').selectOption('REVIEW');
  await expect(column(teammate, 'Review').getByRole('article', { name: 'Live task' })).toBeVisible();
  await expect(column(teammate, 'To do').getByRole('article', { name: 'Live task' })).toHaveCount(0);

  // The teammate edits → the owner sees it (bidirectional), with no duplicates.
  await teammate.getByRole('button', { name: 'Live task' }).click();
  const edit = teammate.getByRole('dialog', { name: 'Edit task' });
  await edit.getByLabel('Title').fill('Live task (edited)');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(owner.getByRole('article', { name: 'Live task (edited)' })).toBeVisible();
  await expect(owner.getByRole('article')).toHaveCount(1);
  await expect(teammate.getByRole('article')).toHaveCount(1);

  // Delete → disappears for the teammate.
  await owner.getByRole('button', { name: 'Live task (edited)' }).click();
  await owner.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Delete' }).click();
  await owner.getByRole('dialog', { name: 'Delete task?' }).getByRole('button', { name: 'Delete task' }).click();
  await expect(teammate.getByRole('article')).toHaveCount(0);

  await ownerContext.close();
  await teammateContext.close();
});
