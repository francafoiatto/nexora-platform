import { Injectable } from '@nestjs/common';
import { Priority, type Prisma, TaskStatus } from '@prisma/client';
import { ActivitiesService, ActivityAction, type ActivityView } from '../activities/activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AccessService } from '../workspaces/access.service';
import type { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';

export const TASK_SELECT = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  assigneeId: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

export type TaskView = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

/** Upper bound for one board. Keeps responses bounded until the board is paginated per column. */
export const MAX_TASKS_PER_PROJECT = 500;

const toDate = (value: string | null | undefined) => (value === undefined ? undefined : value === null ? null : new Date(value));
const sameDate = (a: Date | null, b: Date | null | undefined) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

@Injectable()
export class TasksService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(projectId: string, userId: string): Promise<TaskView[]> {
    await this.access.requireProject(projectId, userId);
    return this.db.task.findMany({
      where: { projectId },
      select: TASK_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: MAX_TASKS_PER_PROJECT,
    });
  }

  async get(taskId: string, userId: string): Promise<TaskView> {
    await this.access.requireTask(taskId, userId);
    return this.db.task.findUniqueOrThrow({ where: { id: taskId }, select: TASK_SELECT });
  }

  async create(projectId: string, userId: string, dto: CreateTaskDto): Promise<TaskView> {
    const project = await this.access.requireProject(projectId, userId);
    const { task, activity } = await this.db.$transaction(async (tx) => {
      await this.access.assertAssignable(project.workspaceId, dto.assigneeId, tx);
      const task = await tx.task.create({
        data: {
          projectId,
          createdById: userId,
          title: dto.title,
          description: dto.description || null,
          status: dto.status ?? TaskStatus.TODO,
          priority: dto.priority ?? Priority.MEDIUM,
          assigneeId: dto.assigneeId ?? null,
          dueDate: toDate(dto.dueDate) ?? null,
        },
        select: TASK_SELECT,
      });
      const activity = await this.activities.record(tx, {
        workspaceId: project.workspaceId,
        actorId: userId,
        entityType: 'TASK',
        entityId: task.id,
        action: ActivityAction.TASK_CREATED,
        metadata: { title: task.title, projectId, projectName: project.name },
      });
      return { task, activity };
    });
    this.realtime.emit(project.workspaceId, 'task.created', { projectId, task });
    this.realtime.emit(project.workspaceId, 'activity.created', { activity });
    return task;
  }

  async update(taskId: string, userId: string, dto: UpdateTaskDto): Promise<TaskView> {
    const before = await this.access.requireTask(taskId, userId);
    const { workspaceId } = before.project;

    const data = {
      title: dto.title,
      description: dto.description === undefined ? undefined : dto.description || null,
      status: dto.status,
      priority: dto.priority,
      assigneeId: dto.assigneeId,
      dueDate: toDate(dto.dueDate),
    };
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter((key) => {
      if (data[key] === undefined) return false;
      if (key === 'dueDate') return !sameDate(before.dueDate, data.dueDate);
      return data[key] !== before[key];
    });
    if (changed.length === 0) return this.db.task.findUniqueOrThrow({ where: { id: taskId }, select: TASK_SELECT });

    const { task, activities } = await this.db.$transaction(async (tx) => {
      if (changed.includes('assigneeId')) await this.access.assertAssignable(workspaceId, dto.assigneeId, tx);
      const task = await tx.task.update({ where: { id: taskId }, data, select: TASK_SELECT });
      const base = { workspaceId, actorId: userId, entityType: 'TASK' as const, entityId: taskId };
      const metadata = { title: task.title, projectId: task.projectId, projectName: before.project.name };
      const activities: ActivityView[] = [];
      // A status move is the most meaningful operational event, so it gets its own entry;
      // other edits are summarized in a single "updated" entry to keep the feed low-noise.
      if (changed.includes('status')) {
        activities.push(
          await this.activities.record(tx, {
            ...base,
            action: ActivityAction.TASK_STATUS_CHANGED,
            metadata: { ...metadata, from: before.status, to: task.status },
          }),
        );
      }
      const otherChanges = changed.filter((key) => key !== 'status');
      if (otherChanges.length > 0) {
        activities.push(
          await this.activities.record(tx, {
            ...base,
            action: ActivityAction.TASK_UPDATED,
            metadata: { ...metadata, changes: otherChanges, ...(changed.includes('assigneeId') ? { assignee: task.assignee?.name ?? null } : {}) },
          }),
        );
      }
      return { task, activities };
    });
    this.realtime.emit(workspaceId, 'task.updated', { projectId: task.projectId, task });
    for (const activity of activities) this.realtime.emit(workspaceId, 'activity.created', { activity });
    return task;
  }

  async remove(taskId: string, userId: string): Promise<void> {
    const task = await this.access.requireTask(taskId, userId);
    const { workspaceId } = task.project;
    const activity = await this.db.$transaction(async (tx) => {
      await tx.task.delete({ where: { id: taskId } });
      return this.activities.record(tx, {
        workspaceId,
        actorId: userId,
        entityType: 'TASK',
        entityId: taskId,
        action: ActivityAction.TASK_DELETED,
        metadata: { title: task.title, projectId: task.projectId, projectName: task.project.name },
      });
    });
    this.realtime.emit(workspaceId, 'task.deleted', { projectId: task.projectId, taskId });
    this.realtime.emit(workspaceId, 'activity.created', { activity });
  }
}
