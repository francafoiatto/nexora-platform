import type { Task } from '@nexora/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSocketModule } from '../../test/socket-mock';
import { makeTask, mockApi, PROJECT_ID, renderApp, signIn, TEAMMATE, USER, workspaceRoutes, WS_ID } from '../../test/utils';

vi.mock('../realtime/socket', () => mockSocketModule());

const BOARD = `/app/${WS_ID}/projects/${PROJECT_ID}`;
const column = (name: string) => screen.getByRole('listitem', { name });

describe('BoardPage', () => {
  beforeEach(() => signIn());

  it('shows a loading state, then renders tasks in their status columns', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const tasks = [
      makeTask({ title: 'Write spec', status: 'TODO', priority: 'HIGH', assignee: { id: USER.id, name: USER.name }, assigneeId: USER.id }),
      makeTask({ title: 'Build API', status: 'IN_PROGRESS', dueDate: '2020-01-01T00:00:00.000Z' }),
    ];
    mockApi(
      workspaceRoutes({
        [`GET /projects/${PROJECT_ID}/tasks`]: async () => {
          await gate;
          return { status: 200, data: tasks };
        },
      }),
    );
    renderApp(BOARD);
    expect(await screen.findByText('Loading board…')).toBeInTheDocument();
    release();

    const todo = await screen.findByRole('listitem', { name: 'To do' });
    expect(within(todo).getByRole('article', { name: 'Write spec' })).toBeInTheDocument();
    expect(within(todo).getByText('High')).toBeInTheDocument();
    expect(within(todo).getByText('Assigned to Alex Morgan')).toBeInTheDocument();
    const inProgress = column('In progress');
    expect(within(inProgress).getByRole('article', { name: 'Build API' })).toBeInTheDocument();
    expect(within(inProgress).getByText(/Overdue, due/)).toBeInTheDocument();
    expect(within(column('Review')).getByText('No tasks')).toBeInTheDocument();
    expect(within(column('Done')).getByText('No tasks')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Platform launch', level: 1 })).toBeInTheDocument();
  });

  it('renders the empty board when the project has no tasks', async () => {
    mockApi(workspaceRoutes({ [`GET /projects/${PROJECT_ID}/tasks`]: () => ({ status: 200, data: [] }) }));
    renderApp(BOARD);
    await screen.findByRole('listitem', { name: 'To do' });
    expect(screen.getAllByText('No tasks')).toHaveLength(4);
  });

  it('shows an error state with retry when tasks fail to load', async () => {
    let fail = true;
    mockApi(
      workspaceRoutes({
        [`GET /projects/${PROJECT_ID}/tasks`]: () =>
          fail ? { status: 500, data: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] } } : { status: 200, data: [] },
      }),
    );
    renderApp(BOARD);
    expect(await screen.findByText('Internal server error')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('listitem', { name: 'To do' })).toBeInTheDocument();
  });

  it('creates a task through the dialog with the full payload', async () => {
    const tasks: Task[] = [];
    const calls = mockApi(
      workspaceRoutes({
        [`GET /projects/${PROJECT_ID}/tasks`]: () => ({ status: 200, data: tasks }),
        [`POST /projects/${PROJECT_ID}/tasks`]: ({ body }) => {
          const input = body as Partial<Task>;
          const task = makeTask({ ...input, assignee: input.assigneeId ? { id: TEAMMATE.id, name: TEAMMATE.name } : null, dueDate: '2026-10-15T00:00:00.000Z' });
          return { status: 201, data: task };
        },
      }),
    );
    renderApp(BOARD);
    await userEvent.click(within(await screen.findByRole('listitem', { name: 'Review' })).getByRole('button', { name: 'Add task to Review' }));

    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    // Validation: empty title is rejected client-side.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));
    expect(await within(dialog).findByText('Title is required')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Title'), 'Security review');
    await userEvent.type(within(dialog).getByLabelText('Description'), 'Check auth flows');
    expect(within(dialog).getByLabelText('Status')).toHaveValue('REVIEW');
    await userEvent.selectOptions(within(dialog).getByLabelText('Priority'), 'URGENT');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Priya Shah' })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText('Assignee'), TEAMMATE.id);
    await userEvent.type(within(dialog).getByLabelText('Due date'), '2026-10-15');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(column('Review')).getByRole('article', { name: 'Security review' })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      title: 'Security review',
      description: 'Check auth flows',
      status: 'REVIEW',
      priority: 'URGENT',
      assigneeId: TEAMMATE.id,
      dueDate: '2026-10-15',
    });
  });

  it('edits a task and surfaces a server-side assignee rejection on the field', async () => {
    const task = makeTask({ title: 'Old title' });
    let rejectAssignee = true;
    const calls = mockApi(
      workspaceRoutes({
        [`GET /projects/${PROJECT_ID}/tasks`]: () => ({ status: 200, data: [task] }),
        [`PATCH /tasks/${task.id}`]: ({ body }) =>
          rejectAssignee
            ? {
                status: 400,
                data: {
                  statusCode: 400,
                  code: 'ASSIGNEE_NOT_MEMBER',
                  message: 'Assignee must be a member of this workspace',
                  details: [{ field: 'assigneeId', message: 'Assignee must be a member of this workspace' }],
                },
              }
            : { status: 200, data: { ...task, ...(body as object), updatedAt: '2026-09-21T10:00:00.000Z' } },
      }),
    );
    renderApp(BOARD);
    await userEvent.click(await screen.findByRole('button', { name: 'Old title' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit task' });
    const title = within(dialog).getByLabelText('Title');
    expect(title).toHaveValue('Old title');
    await userEvent.clear(title);
    await userEvent.type(title, 'New title');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Priya Shah' })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText('Assignee'), TEAMMATE.id);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByText('Assignee must be a member of this workspace')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Assignee')).toHaveAttribute('aria-invalid', 'true');

    rejectAssignee = false;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('article', { name: 'New title' })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toMatchObject({ title: 'New title', assigneeId: TEAMMATE.id });
  });

  it('moves a task optimistically and rolls back when the server rejects it', async () => {
    const task = makeTask({ title: 'Movable', status: 'TODO' });
    let release!: (reply: { status: number; data?: unknown }) => void;
    mockApi(
      workspaceRoutes({
        [`GET /projects/${PROJECT_ID}/tasks`]: () => ({ status: 200, data: [task] }),
        [`PATCH /tasks/${task.id}`]: () => new Promise((resolve) => (release = resolve)),
      }),
    );
    renderApp(BOARD);
    await userEvent.selectOptions(await screen.findByLabelText('Status of Movable'), 'DONE');
    // Optimistic: already in Done before the server answers.
    expect(within(column('Done')).getByRole('article', { name: 'Movable' })).toBeInTheDocument();

    release({ status: 500, data: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] } });
    await waitFor(() => expect(within(column('To do')).getByRole('article', { name: 'Movable' })).toBeInTheDocument());
    expect(await screen.findByText(/Couldn’t move the task/)).toBeInTheDocument();
  });

  it('deletes a task after confirmation', async () => {
    const task = makeTask({ title: 'Disposable' });
    const calls = mockApi(
      workspaceRoutes({
        [`GET /projects/${PROJECT_ID}/tasks`]: () => ({ status: 200, data: [task] }),
        [`DELETE /tasks/${task.id}`]: () => ({ status: 204 }),
      }),
    );
    renderApp(BOARD);
    await userEvent.click(await screen.findByRole('button', { name: 'Disposable' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Edit task' })).getByRole('button', { name: 'Delete' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete task?' })).getByRole('button', { name: 'Delete task' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Disposable' })).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'DELETE' && c.path === `/tasks/${task.id}`)).toBe(true);
  });

  it('quick-adds a task to To do', async () => {
    mockApi(
      workspaceRoutes({
        [`GET /projects/${PROJECT_ID}/tasks`]: () => ({ status: 200, data: [] }),
        [`POST /projects/${PROJECT_ID}/tasks`]: ({ body }) => ({ status: 201, data: makeTask({ title: (body as { title: string }).title }) }),
      }),
    );
    renderApp(BOARD);
    const input = await screen.findByLabelText('Quick add a task to To do');
    await userEvent.type(input, 'Fast task{Enter}');
    expect(await within(column('To do')).findByRole('article', { name: 'Fast task' })).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('shows "Project not found" for an inaccessible project', async () => {
    mockApi(
      workspaceRoutes({
        [`GET /projects/${PROJECT_ID}`]: () => ({ status: 404, data: { statusCode: 404, code: 'NOT_FOUND', message: 'Project not found', details: [] } }),
        [`GET /projects/${PROJECT_ID}/tasks`]: () => ({ status: 404, data: { statusCode: 404, code: 'NOT_FOUND', message: 'Project not found', details: [] } }),
      }),
    );
    renderApp(BOARD);
    expect(await screen.findByText('Project not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to projects' })).toBeInTheDocument();
  });
});
