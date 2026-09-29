import { addMember, createProject, createTask, createTestApp, createWorkspace, path, registerUser, resetDatabase, type TestContext, type TestUser } from './helpers';

describe('workspaces', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.db);
    owner = await registerUser(ctx, 'Owner');
    member = await registerUser(ctx, 'Member');
    outsider = await registerUser(ctx, 'Outsider');
  });
  afterAll(() => ctx.app.close());

  it('creates a workspace with the creator as OWNER and records activity', async () => {
    const res = await ctx.http().post(path('/workspaces')).set(owner.auth).send({ name: '  Ops Center ' }).expect(201);
    expect(res.body).toMatchObject({ name: 'Ops Center', role: 'OWNER', projectCount: 0, memberCount: 1 });
    expect(res.body.slug).toMatch(/^ops-center-[0-9a-f]{6}$/);
    const activity = await ctx.db.activity.findFirstOrThrow({ where: { workspaceId: res.body.id } });
    expect(activity).toMatchObject({ action: 'workspace.created', actorId: owner.id, metadata: { name: 'Ops Center' } });
  });

  it('validates the name', async () => {
    const res = await ctx.http().post(path('/workspaces')).set(owner.auth).send({ name: ' ' }).expect(400);
    expect(res.body.details[0]).toMatchObject({ field: 'name' });
  });

  it('lists only workspaces the user belongs to, with their role', async () => {
    const ws = await createWorkspace(ctx, owner, 'Shared');
    await addMember(ctx, owner, ws.id, member);
    const res = await ctx.http().get(path('/workspaces')).set(member.auth).expect(200);
    expect(res.body).toEqual([expect.objectContaining({ id: ws.id, role: 'MEMBER', memberCount: 2 })]);
    expect((await ctx.http().get(path('/workspaces')).set(outsider.auth).expect(200)).body).toEqual([]);
  });

  describe('roles', () => {
    let ws: { id: string };
    beforeAll(async () => {
      ws = await createWorkspace(ctx, owner, 'Roles');
      await addMember(ctx, owner, ws.id, member);
    });

    it('lets the owner rename and records one activity (none when unchanged)', async () => {
      await ctx.http().patch(path(`/workspaces/${ws.id}`)).set(owner.auth).send({ name: 'Roles Renamed' }).expect(200);
      await ctx.http().patch(path(`/workspaces/${ws.id}`)).set(owner.auth).send({ name: 'Roles Renamed' }).expect(200);
      const updates = await ctx.db.activity.findMany({ where: { workspaceId: ws.id, action: 'workspace.updated' } });
      expect(updates).toHaveLength(1);
      expect(updates[0].metadata).toEqual({ from: 'Roles', name: 'Roles Renamed' });
    });

    it('forbids members from renaming (403, they can see the workspace)', async () => {
      const res = await ctx.http().patch(path(`/workspaces/${ws.id}`)).set(member.auth).send({ name: 'Nope' }).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('forbids members from adding members', async () => {
      await ctx.http().post(path(`/workspaces/${ws.id}/members`)).set(member.auth).send({ email: outsider.email }).expect(403);
    });

    it('returns 404 when adding an unknown email and 409 for an existing member', async () => {
      await ctx.http().post(path(`/workspaces/${ws.id}/members`)).set(owner.auth).send({ email: 'nobody@example.test' }).expect(404);
      const dup = await ctx.http().post(path(`/workspaces/${ws.id}/members`)).set(owner.auth).send({ email: member.email }).expect(409);
      expect(dup.body.code).toBe('CONFLICT');
    });

    it('lists members with roles', async () => {
      const res = await ctx.http().get(path(`/workspaces/${ws.id}/members`)).set(member.auth).expect(200);
      expect(res.body).toEqual([
        { id: owner.id, name: 'Owner', email: owner.email, role: 'OWNER' },
        { id: member.id, name: 'Member', email: member.email, role: 'MEMBER' },
      ]);
    });
  });

  it('summarizes tasks across all projects of the workspace', async () => {
    const ws = await createWorkspace(ctx, owner, 'Metrics');
    const p1 = await createProject(ctx, owner, ws.id, 'One');
    const p2 = await createProject(ctx, owner, ws.id, 'Two');
    await createTask(ctx, owner, p1.id, { status: 'TODO', assigneeId: owner.id, dueDate: '2020-01-01' });
    await createTask(ctx, owner, p1.id, { status: 'IN_PROGRESS' });
    await createTask(ctx, owner, p2.id, { status: 'DONE', assigneeId: owner.id, dueDate: '2020-01-01' });
    await createTask(ctx, owner, p2.id, { status: 'REVIEW', assigneeId: owner.id });
    const res = await ctx.http().get(path(`/workspaces/${ws.id}/summary`)).set(owner.auth).expect(200);
    expect(res.body).toEqual({
      projects: 2,
      members: 1,
      tasksByStatus: { TODO: 1, IN_PROGRESS: 1, REVIEW: 1, DONE: 1 },
      openTasks: 3,
      overdueTasks: 1,
      assignedToMe: 2,
    });
  });

  it('rejects malformed ids with 400 instead of hitting the database', async () => {
    const res = await ctx.http().get(path('/workspaces/not-a-uuid')).set(owner.auth).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  describe('activity feed', () => {
    it('paginates newest first with a cursor', async () => {
      const ws = await createWorkspace(ctx, owner, 'Feed');
      const project = await createProject(ctx, owner, ws.id, 'Feed project');
      for (let i = 1; i <= 4; i++) await createTask(ctx, owner, project.id, { title: `Task ${i}` });
      // 1 workspace.created + 1 project.created + 4 task.created
      const first = await ctx.http().get(path(`/workspaces/${ws.id}/activities?limit=4`)).set(owner.auth).expect(200);
      expect(first.body.items).toHaveLength(4);
      expect(first.body.items[0]).toMatchObject({ action: 'task.created', metadata: { title: 'Task 4' }, actor: { id: owner.id, name: 'Owner' } });
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await ctx
        .http()
        .get(path(`/workspaces/${ws.id}/activities?limit=4&cursor=${first.body.nextCursor}`))
        .set(owner.auth)
        .expect(200);
      expect(second.body.items.map((a: { action: string }) => a.action)).toEqual(['project.created', 'workspace.created']);
      expect(second.body.nextCursor).toBeNull();
    });

    it('validates the limit', async () => {
      const ws = await createWorkspace(ctx, owner, 'Feed 2');
      await ctx.http().get(path(`/workspaces/${ws.id}/activities?limit=1000`)).set(owner.auth).expect(400);
    });
  });
});
