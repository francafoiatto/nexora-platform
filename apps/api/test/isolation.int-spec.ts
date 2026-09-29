import {
  addMember,
  createProject,
  createTask,
  createTestApp,
  createWorkspace,
  path,
  registerUser,
  resetDatabase,
  type TestContext,
  type TestUser,
} from './helpers';

/**
 * CRITICAL tenant-isolation matrix.
 *
 * User A → Workspace A → Project A → Task A
 * User B → Workspace B
 *
 * User B must not read, modify, delete or reference anything in Workspace A,
 * and Task A must not be assignable to User B while B is not a member of Workspace A.
 */
describe('tenant isolation (User A vs User B)', () => {
  let ctx: TestContext;
  let userA: TestUser;
  let userB: TestUser;
  let workspaceA: { id: string };
  let workspaceB: { id: string };
  let projectA: { id: string };
  let taskA: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.db);
    userA = await registerUser(ctx, 'User A');
    userB = await registerUser(ctx, 'User B');
    workspaceA = await createWorkspace(ctx, userA, 'Workspace A');
    workspaceB = await createWorkspace(ctx, userB, 'Workspace B');
    projectA = await createProject(ctx, userA, workspaceA.id, 'Project A');
    taskA = await createTask(ctx, userA, projectA.id, { title: 'Task A' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const expectDenied = (res: { status: number; body: { code: string } }) => {
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  };

  describe('User B cannot read Workspace A resources', () => {
    it.each([
      ['workspace', () => `/workspaces/${workspaceA.id}`],
      ['workspace summary', () => `/workspaces/${workspaceA.id}/summary`],
      ['workspace members', () => `/workspaces/${workspaceA.id}/members`],
      ['workspace projects', () => `/workspaces/${workspaceA.id}/projects`],
      ['workspace activity', () => `/workspaces/${workspaceA.id}/activities`],
      ['project', () => `/projects/${projectA.id}`],
      ['project tasks', () => `/projects/${projectA.id}/tasks`],
      ['task', () => `/tasks/${taskA.id}`],
    ])('GET %s → 404', async (_label, url) => {
      expectDenied(await ctx.http().get(path(url())).set(userB.auth));
    });

    it('does not list Workspace A', async () => {
      const res = await ctx.http().get(path('/workspaces')).set(userB.auth).expect(200);
      expect(res.body.map((w: { id: string }) => w.id)).toEqual([workspaceB.id]);
    });
  });

  describe('User B cannot mutate Workspace A resources', () => {
    it('cannot rename Workspace A', async () => {
      expectDenied(await ctx.http().patch(path(`/workspaces/${workspaceA.id}`)).set(userB.auth).send({ name: 'Hijacked' }));
    });

    it('cannot add members to Workspace A (including themselves)', async () => {
      expectDenied(await ctx.http().post(path(`/workspaces/${workspaceA.id}/members`)).set(userB.auth).send({ email: userB.email }));
    });

    it('cannot create projects in Workspace A', async () => {
      expectDenied(await ctx.http().post(path(`/workspaces/${workspaceA.id}/projects`)).set(userB.auth).send({ name: 'Intrusion' }));
    });

    it('cannot update or delete Project A', async () => {
      expectDenied(await ctx.http().patch(path(`/projects/${projectA.id}`)).set(userB.auth).send({ name: 'Hijacked' }));
      expectDenied(await ctx.http().delete(path(`/projects/${projectA.id}`)).set(userB.auth));
    });

    it('cannot create tasks in Project A', async () => {
      expectDenied(await ctx.http().post(path(`/projects/${projectA.id}/tasks`)).set(userB.auth).send({ title: 'Intrusion' }));
    });

    it('cannot update or delete Task A', async () => {
      expectDenied(await ctx.http().patch(path(`/tasks/${taskA.id}`)).set(userB.auth).send({ status: 'DONE' }));
      expectDenied(await ctx.http().delete(path(`/tasks/${taskA.id}`)).set(userB.auth));
    });

    it('left every Workspace A resource untouched', async () => {
      const workspace = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceA.id } });
      const project = await ctx.db.project.findUniqueOrThrow({ where: { id: projectA.id } });
      const task = await ctx.db.task.findUniqueOrThrow({ where: { id: taskA.id } });
      expect(workspace.name).toBe('Workspace A');
      expect(project.name).toBe('Project A');
      expect(task.status).toBe('TODO');
      expect(await ctx.db.project.count({ where: { workspaceId: workspaceA.id } })).toBe(1);
      expect(await ctx.db.workspaceMember.count({ where: { workspaceId: workspaceA.id } })).toBe(1);
    });
  });

  describe('assignee must belong to the task workspace', () => {
    it('denies assigning Task A to User B (not a member of Workspace A)', async () => {
      const res = await ctx.http().patch(path(`/tasks/${taskA.id}`)).set(userA.auth).send({ assigneeId: userB.id });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ASSIGNEE_NOT_MEMBER');
      expect(res.body.details).toEqual([{ field: 'assigneeId', message: 'Assignee must be a member of this workspace' }]);
      expect((await ctx.db.task.findUniqueOrThrow({ where: { id: taskA.id } })).assigneeId).toBeNull();
    });

    it('denies creating a task in Project A assigned to User B', async () => {
      const res = await ctx.http().post(path(`/projects/${projectA.id}/tasks`)).set(userA.auth).send({ title: 'x', assigneeId: userB.id });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ASSIGNEE_NOT_MEMBER');
      expect(await ctx.db.task.count({ where: { projectId: projectA.id } })).toBe(1);
    });

    it('denies a random (non-existent) user id', async () => {
      const res = await ctx
        .http()
        .patch(path(`/tasks/${taskA.id}`))
        .set(userA.auth)
        .send({ assigneeId: '00000000-0000-4000-8000-000000000000' });
      expect(res.body.code).toBe('ASSIGNEE_NOT_MEMBER');
    });

    it('rejects a malformed assignee id at validation', async () => {
      const res = await ctx.http().patch(path(`/tasks/${taskA.id}`)).set(userA.auth).send({ assigneeId: 'not-a-uuid' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('allows the assignment once User B becomes a member, and unassigning with null', async () => {
      await addMember(ctx, userA, workspaceA.id, userB);
      const assigned = await ctx.http().patch(path(`/tasks/${taskA.id}`)).set(userA.auth).send({ assigneeId: userB.id }).expect(200);
      expect(assigned.body.assignee).toEqual({ id: userB.id, name: 'User B' });
      const cleared = await ctx.http().patch(path(`/tasks/${taskA.id}`)).set(userA.auth).send({ assigneeId: null }).expect(200);
      expect(cleared.body.assigneeId).toBeNull();
    });
  });

  it('rejects requests without a token or with a forged token', async () => {
    expect((await ctx.http().get(path(`/tasks/${taskA.id}`))).status).toBe(401);
    const forged = `${userA.token.slice(0, -4)}abcd`;
    const res = await ctx.http().get(path(`/tasks/${taskA.id}`)).set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
