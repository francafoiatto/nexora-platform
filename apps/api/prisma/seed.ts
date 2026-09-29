/**
 * Demo seed. Safe to run repeatedly: it rebuilds only the demo workspace (fixed slug)
 * and upserts the fictional demo users, so re-running never duplicates data.
 * All people and emails below are fictional (`.local` addresses are not routable).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Priority, PrismaClient, TaskStatus, WorkspaceRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const envFile = resolve(__dirname, '../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(1);
}

export const DEMO_PASSWORD = 'demo-password';
export const DEMO_WORKSPACE_SLUG = 'acme-operations-demo';

const USERS = [
  { key: 'alex', name: 'Alex Morgan', email: 'demo@nexora.local', role: WorkspaceRole.OWNER },
  { key: 'priya', name: 'Priya Shah', email: 'priya@nexora.local', role: WorkspaceRole.MEMBER },
  { key: 'marcus', name: 'Marcus Chen', email: 'marcus@nexora.local', role: WorkspaceRole.MEMBER },
  { key: 'sofia', name: 'Sofia Almeida', email: 'sofia@nexora.local', role: WorkspaceRole.MEMBER },
] as const;
type UserKey = (typeof USERS)[number]['key'];

interface SeedTask {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assignee?: UserKey;
  /** Days relative to today; negative means overdue. */
  due?: number;
}

const PROJECTS: { name: string; description: string; tasks: SeedTask[] }[] = [
  {
    name: 'Platform launch',
    description: 'Coordinate the v1 operational release across product, support and infrastructure.',
    tasks: [
      { title: 'Map critical customer workflows', status: 'DONE', priority: 'HIGH', assignee: 'priya', due: -6 },
      { title: 'Finalize pricing page copy', status: 'DONE', priority: 'MEDIUM', assignee: 'sofia', due: -3 },
      { title: 'Prepare onboarding flow', description: 'Guided setup: workspace, first project, invite teammates.', status: 'IN_PROGRESS', priority: 'URGENT', assignee: 'alex', due: 2 },
      { title: 'Load-test realtime gateway', status: 'IN_PROGRESS', priority: 'HIGH', assignee: 'marcus', due: 4 },
      { title: 'Review incident playbook', status: 'REVIEW', priority: 'MEDIUM', assignee: 'priya', due: -1 },
      { title: 'Security review of auth flows', status: 'REVIEW', priority: 'HIGH', assignee: 'marcus', due: 1 },
      { title: 'Define launch success metrics', status: 'TODO', priority: 'LOW', assignee: 'alex', due: 9 },
      { title: 'Draft status page announcement', status: 'TODO', priority: 'MEDIUM', due: 7 },
      { title: 'Schedule go/no-go meeting', status: 'TODO', priority: 'HIGH', assignee: 'sofia', due: 5 },
    ],
  },
  {
    name: 'Customer support revamp',
    description: 'Reduce first-response time and consolidate support tooling.',
    tasks: [
      { title: 'Audit current ticket categories', status: 'DONE', priority: 'MEDIUM', assignee: 'sofia', due: -10 },
      { title: 'Design escalation matrix', status: 'IN_PROGRESS', priority: 'HIGH', assignee: 'priya', due: 3 },
      { title: 'Write macros for top 10 requests', status: 'TODO', priority: 'MEDIUM', assignee: 'sofia', due: 12 },
      { title: 'Pilot weekend on-call rotation', status: 'TODO', priority: 'LOW' },
    ],
  },
  {
    name: 'Q4 infrastructure',
    description: 'Capacity planning and cost review before the holiday peak.',
    tasks: [
      { title: 'Right-size database instances', status: 'REVIEW', priority: 'MEDIUM', assignee: 'marcus', due: 6 },
      { title: 'Document backup restore drill', status: 'TODO', priority: 'HIGH', assignee: 'marcus', due: -2 },
    ],
  },
];

const prisma = new PrismaClient();
const day = 24 * 60 * 60 * 1000;
const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = {} as Record<UserKey, { id: string; name: string }>;
  for (const user of USERS) {
    users[user.key] = await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, passwordHash },
      create: { name: user.name, email: user.email, passwordHash },
      select: { id: true, name: true },
    });
  }

  // Cascades remove memberships, projects, tasks and activities of the previous demo run.
  await prisma.workspace.deleteMany({ where: { slug: DEMO_WORKSPACE_SLUG } });

  const owner = users.alex;
  // Spread the demo history (one tick per timestamp below) so the newest entry is one step ago.
  const step = 90 * 60 * 1000;
  const tickCount =
    1 + // workspace.created
    (USERS.length - 1) + // member.added
    PROJECTS.reduce(
      (sum, p) => sum + 2 /* project row + project.created */ + p.tasks.length * 2 /* task row + task.created */ + p.tasks.filter((t) => t.status !== TaskStatus.TODO).length,
      0,
    );
  let clock = Date.now() - (tickCount + 1) * step;
  const tick = () => new Date((clock += step));

  await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: 'Acme Operations',
        slug: DEMO_WORKSPACE_SLUG,
        members: { create: USERS.map((user) => ({ userId: users[user.key].id, role: user.role })) },
      },
    });
    const log = (actorId: string, entityType: string, entityId: string, action: string, metadata: object) =>
      tx.activity.create({ data: { workspaceId: workspace.id, actorId, entityType, entityId, action, metadata, createdAt: tick() } });

    await log(owner.id, 'WORKSPACE', workspace.id, 'workspace.created', { name: workspace.name });
    for (const user of USERS.filter((u) => u.role === WorkspaceRole.MEMBER)) {
      await log(owner.id, 'MEMBER', users[user.key].id, 'member.added', { name: user.name });
    }

    for (const spec of PROJECTS) {
      const project = await tx.project.create({
        data: { workspaceId: workspace.id, name: spec.name, description: spec.description, createdAt: tick() },
      });
      await log(owner.id, 'PROJECT', project.id, 'project.created', { name: project.name });

      for (const item of spec.tasks) {
        const creator = item.assignee ? users[item.assignee] : owner;
        const createdAt = tick();
        const task = await tx.task.create({
          data: {
            projectId: project.id,
            title: item.title,
            description: item.description ?? null,
            status: item.status,
            priority: item.priority,
            assigneeId: item.assignee ? users[item.assignee].id : null,
            createdById: owner.id,
            dueDate: item.due === undefined ? null : new Date(startOfToday.getTime() + item.due * day),
            createdAt,
          },
        });
        const meta = { title: task.title, projectId: project.id, projectName: project.name };
        await log(owner.id, 'TASK', task.id, 'task.created', meta);
        if (item.status !== TaskStatus.TODO) {
          await log(creator.id, 'TASK', task.id, 'task.status_changed', { ...meta, from: TaskStatus.TODO, to: item.status });
        }
      }
    }
  });

  const counts = await prisma.workspace.findUniqueOrThrow({
    where: { slug: DEMO_WORKSPACE_SLUG },
    select: { _count: { select: { projects: true, members: true, activities: true } } },
  });
  const tasks = await prisma.task.count({ where: { project: { workspace: { slug: DEMO_WORKSPACE_SLUG } } } });
  console.warn(
    `Seeded demo workspace: ${counts._count.members} members, ${counts._count.projects} projects, ${tasks} tasks, ${counts._count.activities} activities.`,
  );
  console.warn(`Sign in with demo@nexora.local / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
