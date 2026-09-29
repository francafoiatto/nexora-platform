import { expect, test } from '@playwright/test';
import { column, createFirstWorkspace, createProject, login, register, uniqueEmail } from './support';

test('golden path: register → workspace → project → task → edit → status → logout → login → persisted', async ({ page }) => {
  const email = uniqueEmail('golden');

  // Register (lands on onboarding) and create a workspace.
  await register(page, 'Golden Tester', email);
  const workspaceId = await createFirstWorkspace(page, 'Golden Ops');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Golden');
  await expect(page.getByLabel('Current workspace')).toHaveValue(workspaceId);

  // Create a project.
  const boardUrl = await createProject(page, workspaceId, 'Launch Plan');
  for (const name of ['To do', 'In progress', 'Review', 'Done']) {
    await expect(column(page, name).getByText('No tasks')).toBeVisible();
  }

  // Create a task through the full dialog.
  await page.getByRole('button', { name: 'New task' }).click();
  const create = page.getByRole('dialog', { name: 'New task' });
  await create.getByLabel('Title').fill('Draft launch checklist');
  await create.getByLabel('Description').fill('Everything needed for go-live.');
  await create.getByLabel('Priority').selectOption('HIGH');
  await create.getByLabel('Assignee').selectOption({ label: 'Golden Tester' });
  await create.getByLabel('Due date').fill('2030-01-15');
  await create.getByRole('button', { name: 'Create task' }).click();
  await expect(create).toBeHidden();
  const todoCard = column(page, 'To do').getByRole('article', { name: 'Draft launch checklist' });
  await expect(todoCard).toBeVisible();
  await expect(todoCard.getByText('High')).toBeVisible();
  await expect(todoCard.getByText('Jan 15')).toBeVisible();

  // Edit the task.
  await todoCard.getByRole('button', { name: 'Draft launch checklist' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit task' });
  await expect(edit.getByLabel('Title')).toHaveValue('Draft launch checklist');
  await edit.getByLabel('Title').fill('Final launch checklist');
  await edit.getByLabel('Priority').selectOption('URGENT');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  const edited = page.getByRole('article', { name: 'Final launch checklist' });
  await expect(edited.getByText('Urgent')).toBeVisible();

  // Change status from the card (keyboard-accessible select) and verify the board.
  await page.getByLabel('Status of Final launch checklist').selectOption('IN_PROGRESS');
  await expect(column(page, 'In progress').getByRole('article', { name: 'Final launch checklist' })).toBeVisible();
  await page.getByLabel('Status of Final launch checklist').selectOption('DONE');
  await expect(column(page, 'Done').getByRole('article', { name: 'Final launch checklist' })).toBeVisible();
  await expect(column(page, 'To do').getByText('No tasks')).toBeVisible();

  // Quick add a second task.
  await page.getByLabel('Quick add a task to To do').fill('Follow-up retro');
  await page.keyboard.press('Enter');
  await expect(column(page, 'To do').getByRole('article', { name: 'Follow-up retro' })).toBeVisible();

  // Activity reflects the mutations.
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(page.getByText('Final launch checklist').first()).toBeVisible();
  await expect(page.getByText('In progress → Done')).toBeVisible();

  // Log out, then log back in.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.goto(boardUrl);
  await expect(page).toHaveURL(/\/login\?redirect=/);

  await login(page, email, false);
  // Returns to the board that was requested before signing in.
  await expect(page).toHaveURL(boardUrl);
  await expect(column(page, 'Done').getByRole('article', { name: 'Final launch checklist' })).toBeVisible();
  await expect(column(page, 'To do').getByRole('article', { name: 'Follow-up retro' })).toBeVisible();

  // Dashboard metrics come from the whole workspace.
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  const metrics = page.getByRole('region', { name: 'Workspace metrics' });
  // 1 project; open tasks = the quick-added one (the edited task is Done).
  await expect(metrics).toContainText('Projects1In this workspace');
  await expect(metrics).toContainText('Open tasks1Not done yet');
});

test('task deletion requires confirmation', async ({ page }) => {
  await register(page, 'Deleter', uniqueEmail('delete'));
  const workspaceId = await createFirstWorkspace(page, 'Delete Ops');
  await createProject(page, workspaceId, 'Cleanup');
  await page.getByLabel('Quick add a task to To do').fill('Temporary task');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Temporary task' }).click();
  await page.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete task?' });
  await expect(confirm).toBeVisible();
  // Cancelling the confirmation returns to the edit dialog; nothing is deleted.
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit task' });
  await expect(edit).toBeVisible();
  await expect(page.getByRole('article', { name: 'Temporary task' })).toBeAttached();

  await edit.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Delete task?' }).getByRole('button', { name: 'Delete task' }).click();
  await expect(page.getByRole('article', { name: 'Temporary task' })).toHaveCount(0);
  await page.reload();
  await expect(column(page, 'To do').getByText('No tasks')).toBeVisible();
});
