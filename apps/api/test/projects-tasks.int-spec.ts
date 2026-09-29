import { addMember, createProject, createTask, createTestApp, createWorkspace, path, registerUser, resetDatabase, type TestContext, type TestUser } from './helpers';

describe('projects', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let member: TestUser;
  let ws: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.db);
    owner = await registerUser(ctx, 'Owner');
    member = await registerUser(ctx, 'Member');
    ws = await createWorkspace(ctx, owner, 'Projects WS');
    await addMember(ctx, owner, ws.id, member);
  });
  afterAll(() => ctx.app.close());

  it('supports create → list → get → update with activity', async () => {
    const created = await ctx
      .http()
      .post(path(`/workspaces/${ws.id}/projects`))
      .set(member.auth)
      .send({ name: 'Launch', description: 'Go live' })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Launch', description: 'Go live', workspaceId: ws.id, taskCounts: { TODO: 0, DONE: 0 } });

    await createTask(ctx, owner, created.body.id, { status: 'DONE' });
    const list = await ctx.http().get(path(`/workspaces/${ws.id}/projects`)).set(owner.auth).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: created.body.id, taskCounts: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 1 } })]);

    await ctx.http().get(path(`/projects/${created.body.id}`)).set(member.auth).expect(200);
    const updated = await ctx
      .http()
      .patch(path(`/projects/${created.body.id}`))
      .set(member.auth)
      .send({ name: 'Launch v2', description: null })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Launch v2', description: null });

    const actions = await ctx.db.activity.findMany({ where: { entityId: created.body.id }, orderBy: { createdAt: 'asc' } });
    expect(actions.map((a) => a.action)).toEqual(['project.created', 'project.updated']);
    expect(actions[1].metadata).toEqual({ name: 'Launch v2', changes: ['name', 'description'] });
  });

  it('rejects null for the required name and oversize descriptions', async () => {
    const project = await createProject(ctx, owner, ws.id, 'Validation');
    const nullName = await ctx.http().patch(path(`/projects/${project.id}`)).set(owner.auth).send({ name: null }).expect(400);
    expect(nullName.body.details[0].field).toBe('name');
    await ctx
      .http()
      .post(path(`/workspaces/${ws.id}/projects`))
      .set(owner.auth)
      .send({ name: 'Too long', description: 'x'.repeat(501) })
      .expect(400);
  });

  it('only lets owners delete projects, cascading tasks and logging activity', async () => {
    const project = await createProject(ctx, owner, ws.id, 'Disposable');
    await createTask(ctx, owner, project.id);
    const denied = await ctx.http().delete(path(`/projects/${project.id}`)).set(member.auth).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    await ctx.http().delete(path(`/projects/${project.id}`)).set(owner.auth).expect(204);
    await ctx.http().get(path(`/projects/${project.id}`)).set(owner.auth).expect(404);
    expect(await ctx.db.task.count({ where: { projectId: project.id } })).toBe(0);
    const log = await ctx.db.activity.findFirstOrThrow({ where: { entityId: project.id, action: 'project.deleted' } });
    expect(log.metadata).toEqual({ name: 'Disposable' });
  });
});

describe('tasks', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let member: TestUser;
  let ws: { id: string };
  let project: { id: string; name: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.db);
    owner = await registerUser(ctx, 'Owner');
    member = await registerUser(ctx, 'Member');
    ws = await createWorkspace(ctx, owner, 'Tasks WS');
    await addMember(ctx, owner, ws.id, member);
    project = await createProject(ctx, owner, ws.id, 'Board');
  });
  afterAll(() => ctx.app.close());

  it('creates a task with defaults', async () => {
    const res = await ctx.http().post(path(`/projects/${project.id}/tasks`)).set(member.auth).send({ title: '  Write docs ' }).expect(201);
    expect(res.body).toMatchObject({
      title: 'Write docs',
      status: 'TODO',
      priority: 'MEDIUM',
      description: null,
      assigneeId: null,
      assignee: null,
      dueDate: null,
      createdBy: { id: member.id, name: 'Member' },
    });
  });

  it('creates a fully specified task assigned to a member', async () => {
    const res = await ctx
      .http()
      .post(path(`/projects/${project.id}/tasks`))
      .set(owner.auth)
      .send({ title: 'Ship', description: 'Details', status: 'REVIEW', priority: 'URGENT', assigneeId: member.id, dueDate: '2026-12-01' })
      .expect(201);
    expect(res.body).toMatchObject({ status: 'REVIEW', priority: 'URGENT', assignee: { id: member.id }, dueDate: '2026-12-01T00:00:00.000Z' });
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ title: 'x'.repeat(161) }, 'title'],
    [{ title: 'ok', status: 'BLOCKED' }, 'status'],
    [{ title: 'ok', priority: 'CRITICAL' }, 'priority'],
    [{ title: 'ok', dueDate: 'tomorrow' }, 'dueDate'],
  ])('rejects invalid payload %j', async (body, field) => {
    const res = await ctx.http().post(path(`/projects/${project.id}/tasks`)).set(owner.auth).send(body).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
  });

  it('lists tasks newest first', async () => {
    const res = await ctx.http().get(path(`/projects/${project.id}/tasks`)).set(owner.auth).expect(200);
    expect(res.body.map((t: { title: string }) => t.title)).toEqual(['Ship', 'Write docs']);
  });

  it('updates status alone and logs a status_changed activity', async () => {
    const task = await createTask(ctx, owner, project.id, { title: 'Move me' });
    const res = await ctx.http().patch(path(`/tasks/${task.id}`)).set(member.auth).send({ status: 'IN_PROGRESS' }).expect(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    const logs = await ctx.db.activity.findMany({ where: { entityId: task.id }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['task.created', 'task.status_changed']);
    expect(logs[1]).toMatchObject({ actorId: member.id, metadata: { title: 'Move me', from: 'TODO', to: 'IN_PROGRESS', projectName: 'Board' } });
  });

  it('edits several fields, clears nullable ones, and logs one summarized update', async () => {
    const task = await createTask(ctx, owner, project.id, { title: 'Edit me', description: 'old', dueDate: '2026-11-01' });
    const res = await ctx
      .http()
      .patch(path(`/tasks/${task.id}`))
      .set(owner.auth)
      .send({ title: 'Edited', description: null, priority: 'HIGH', dueDate: null, assigneeId: member.id })
      .expect(200);
    expect(res.body).toMatchObject({ title: 'Edited', description: null, priority: 'HIGH', dueDate: null, assignee: { name: 'Member' } });
    const update = await ctx.db.activity.findFirstOrThrow({ where: { entityId: task.id, action: 'task.updated' } });
    expect(update.metadata).toMatchObject({ changes: ['title', 'description', 'priority', 'assigneeId', 'dueDate'], assignee: 'Member' });
  });

  it('does not log anything for a no-op update', async () => {
    const task = await createTask(ctx, owner, project.id, { title: 'Stable', status: 'TODO' });
    await ctx.http().patch(path(`/tasks/${task.id}`)).set(owner.auth).send({ title: 'Stable', status: 'TODO' }).expect(200);
    expect(await ctx.db.activity.count({ where: { entityId: task.id } })).toBe(1);
  });

  it('rejects null for required fields on update', async () => {
    const task = await createTask(ctx, owner, project.id);
    for (const field of ['title', 'status', 'priority']) {
      const res = await ctx.http().patch(path(`/tasks/${task.id}`)).set(owner.auth).send({ [field]: null }).expect(400);
      expect(res.body.details[0].field).toBe(field);
    }
  });

  it('gets and deletes a task, logging the deletion with its title', async () => {
    const task = await createTask(ctx, owner, project.id, { title: 'Delete me' });
    await ctx.http().get(path(`/tasks/${task.id}`)).set(member.auth).expect(200);
    await ctx.http().delete(path(`/tasks/${task.id}`)).set(member.auth).expect(204);
    await ctx.http().get(path(`/tasks/${task.id}`)).set(member.auth).expect(404);
    const log = await ctx.db.activity.findFirstOrThrow({ where: { entityId: task.id, action: 'task.deleted' } });
    expect(log.metadata).toMatchObject({ title: 'Delete me' });
  });
});
