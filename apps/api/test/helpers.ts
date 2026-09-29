import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { API_PREFIX, configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  db: PrismaService;
  http: () => ReturnType<typeof request>;
  url: string;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const db = app.get(PrismaService);
  return { app, db, url: url.replace('[::1]', '127.0.0.1'), http: () => request(app.getHttpServer()) };
}

export async function resetDatabase(db: PrismaService) {
  await db.$executeRawUnsafe('TRUNCATE "Activity", "Task", "Project", "WorkspaceMember", "Workspace", "User" CASCADE');
}

export const path = (p: string) => `/${API_PREFIX}${p}`;

let counter = 0;
export interface TestUser {
  id: string;
  name: string;
  email: string;
  token: string;
  auth: { Authorization: string };
}

export async function registerUser(ctx: TestContext, name = `User ${++counter}`): Promise<TestUser> {
  const email = `${name.toLowerCase().replace(/\W+/g, '.')}.${Date.now()}.${counter}@example.test`;
  const res = await ctx.http().post(path('/auth/register')).send({ name, email, password: 'correct-horse-battery' }).expect(201);
  return { ...res.body.user, token: res.body.accessToken, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

export async function createWorkspace(ctx: TestContext, user: TestUser, name = 'Workspace') {
  const res = await ctx.http().post(path('/workspaces')).set(user.auth).send({ name }).expect(201);
  return res.body as { id: string; name: string };
}

export async function createProject(ctx: TestContext, user: TestUser, workspaceId: string, name = 'Project') {
  const res = await ctx.http().post(path(`/workspaces/${workspaceId}/projects`)).set(user.auth).send({ name }).expect(201);
  return res.body as { id: string; name: string; workspaceId: string };
}

export async function createTask(ctx: TestContext, user: TestUser, projectId: string, body: Record<string, unknown> = {}) {
  const res = await ctx
    .http()
    .post(path(`/projects/${projectId}/tasks`))
    .set(user.auth)
    .send({ title: 'Task', ...body })
    .expect(201);
  return res.body as { id: string; title: string; status: string; assigneeId: string | null };
}

export async function addMember(ctx: TestContext, owner: TestUser, workspaceId: string, member: TestUser) {
  await ctx.http().post(path(`/workspaces/${workspaceId}/members`)).set(owner.auth).send({ email: member.email }).expect(201);
}
