import { io, type Socket } from 'socket.io-client';
import { addMember, createProject, createTestApp, createWorkspace, path, registerUser, resetDatabase, type TestContext, type TestUser } from './helpers';

const connect = (url: string, token?: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = io(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });

const join = (socket: Socket, workspaceId: unknown) => socket.timeout(3000).emitWithAck('workspace.join', { workspaceId });

const nextEvent = <T>(socket: Socket, event: string, ms = 3000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const noEvent = (socket: Socket, event: string, ms = 600) =>
  new Promise<void>((resolve, reject) => {
    const handler = () => reject(new Error(`unexpected ${event}`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });

describe('realtime gateway', () => {
  let ctx: TestContext;
  let userA: TestUser;
  let userB: TestUser;
  let teammate: TestUser;
  let workspaceA: { id: string };
  let workspaceB: { id: string };
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.db);
    userA = await registerUser(ctx, 'User A');
    userB = await registerUser(ctx, 'User B');
    teammate = await registerUser(ctx, 'Teammate');
    workspaceA = await createWorkspace(ctx, userA, 'Workspace A');
    workspaceB = await createWorkspace(ctx, userB, 'Workspace B');
    await addMember(ctx, userA, workspaceA.id, teammate);
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.close());
    await ctx.app.close();
  });

  const open = async (token?: string) => {
    const socket = await connect(ctx.url, token);
    sockets.push(socket);
    return socket;
  };

  it('rejects connections without a token or with an invalid token', async () => {
    await expect(connect(ctx.url)).rejects.toThrow('UNAUTHORIZED');
    await expect(connect(ctx.url, 'garbage')).rejects.toThrow('UNAUTHORIZED');
  });

  it('lets a member join their workspace room', async () => {
    const socket = await open(userA.token);
    await expect(join(socket, workspaceA.id)).resolves.toEqual({ ok: true });
  });

  it('denies User A joining the room of Workspace B', async () => {
    const socket = await open(userA.token);
    await expect(join(socket, workspaceB.id)).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    await expect(join(socket, 'not-a-uuid')).resolves.toEqual({ ok: false, code: 'VALIDATION_ERROR' });
  });

  it('delivers task events to room members only, never to other tenants', async () => {
    const teammateSocket = await open(teammate.token);
    const intruderSocket = await open(userB.token);
    await join(teammateSocket, workspaceA.id);
    await join(intruderSocket, workspaceB.id);
    await join(intruderSocket, workspaceA.id); // denied; must not subscribe

    const project = await createProject(ctx, userA, workspaceA.id, 'Live');
    const created = nextEvent<{ workspaceId: string; projectId: string; task: { id: string; title: string } }>(teammateSocket, 'task.created');
    const leaked = noEvent(intruderSocket, 'task.created');

    const res = await ctx.http().post(path(`/projects/${project.id}/tasks`)).set(userA.auth).send({ title: 'Realtime task' }).expect(201);
    await expect(created).resolves.toMatchObject({ workspaceId: workspaceA.id, projectId: project.id, task: { id: res.body.id, title: 'Realtime task' } });
    await leaked;

    const updated = nextEvent<{ task: { status: string } }>(teammateSocket, 'task.updated');
    await ctx.http().patch(path(`/tasks/${res.body.id}`)).set(userA.auth).send({ status: 'DONE' }).expect(200);
    await expect(updated).resolves.toMatchObject({ task: { status: 'DONE' } });

    const deleted = nextEvent<{ taskId: string }>(teammateSocket, 'task.deleted');
    await ctx.http().delete(path(`/tasks/${res.body.id}`)).set(userA.auth).expect(204);
    await expect(deleted).resolves.toMatchObject({ taskId: res.body.id, projectId: project.id });
  });

  it('broadcasts activity entries to the workspace room', async () => {
    const socket = await open(teammate.token);
    await join(socket, workspaceA.id);
    const activity = nextEvent<{ activity: { action: string } }>(socket, 'activity.created');
    await createProject(ctx, userA, workspaceA.id, 'Activity project');
    await expect(activity).resolves.toMatchObject({ activity: { action: 'project.created' } });
  });
});
