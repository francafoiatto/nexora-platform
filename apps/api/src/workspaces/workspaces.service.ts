import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { TaskStatus, WorkspaceRole } from '@prisma/client';
import { ActivitiesService, ActivityAction } from '../activities/activities.service';
import { AppException, ErrorCode, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AccessService } from './access.service';
import type { MemberDto, WorkspaceDto, WorkspaceSummaryDto } from './dto/workspace.dto';

export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'workspace'}-${randomBytes(3).toString('hex')}`;
}

const WORKSPACE_INCLUDE = { _count: { select: { projects: true, members: true } } } as const;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(userId: string): Promise<WorkspaceDto[]> {
    const memberships = await this.db.workspaceMember.findMany({
      where: { userId },
      include: { workspace: { include: WORKSPACE_INCLUDE } },
      orderBy: { workspace: { createdAt: 'asc' } },
    });
    return memberships.map(({ workspace, role }) => this.toDto(workspace, role));
  }

  async create(userId: string, name: string): Promise<WorkspaceDto> {
    const workspace = await this.db.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: { name, slug: slugify(name), members: { create: { userId, role: WorkspaceRole.OWNER } } },
        include: WORKSPACE_INCLUDE,
      });
      await this.activities.record(tx, {
        workspaceId: created.id,
        actorId: userId,
        entityType: 'WORKSPACE',
        entityId: created.id,
        action: ActivityAction.WORKSPACE_CREATED,
        metadata: { name },
      });
      return created;
    });
    return this.toDto(workspace, WorkspaceRole.OWNER);
  }

  async get(workspaceId: string, userId: string): Promise<WorkspaceDto> {
    const membership = await this.access.requireMembership(workspaceId, userId);
    const workspace = await this.db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: WORKSPACE_INCLUDE });
    return this.toDto(workspace, membership.role);
  }

  async update(workspaceId: string, userId: string, name: string): Promise<WorkspaceDto> {
    const membership = await this.access.requireOwner(workspaceId, userId);
    const { workspace, activity } = await this.db.$transaction(async (tx) => {
      const before = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
      const workspace = await tx.workspace.update({ where: { id: workspaceId }, data: { name }, include: WORKSPACE_INCLUDE });
      const activity =
        before.name === name
          ? null
          : await this.activities.record(tx, {
              workspaceId,
              actorId: userId,
              entityType: 'WORKSPACE',
              entityId: workspaceId,
              action: ActivityAction.WORKSPACE_UPDATED,
              metadata: { from: before.name, name },
            });
      return { workspace, activity };
    });
    if (activity) this.realtime.emit(workspaceId, 'activity.created', { activity });
    return this.toDto(workspace, membership.role);
  }

  async members(workspaceId: string, userId: string): Promise<MemberDto[]> {
    await this.access.requireMembership(workspaceId, userId);
    const rows = await this.db.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
    });
    return rows.map(({ user, role }) => ({ ...user, role }));
  }

  async addMember(workspaceId: string, userId: string, email: string): Promise<MemberDto> {
    await this.access.requireOwner(workspaceId, userId);
    const invitee = await this.db.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
    if (!invitee) throw notFound('User');
    if (await this.access.isMember(workspaceId, invitee.id)) {
      throw new AppException(HttpStatus.CONFLICT, ErrorCode.CONFLICT, 'This user is already a member', [
        { field: 'email', message: 'This user is already a member' },
      ]);
    }
    const activity = await this.db.$transaction(async (tx) => {
      await tx.workspaceMember.create({ data: { workspaceId, userId: invitee.id, role: WorkspaceRole.MEMBER } });
      return this.activities.record(tx, {
        workspaceId,
        actorId: userId,
        entityType: 'MEMBER',
        entityId: invitee.id,
        action: ActivityAction.MEMBER_ADDED,
        metadata: { name: invitee.name },
      });
    });
    this.realtime.emit(workspaceId, 'activity.created', { activity });
    return { ...invitee, role: WorkspaceRole.MEMBER };
  }

  async summary(workspaceId: string, userId: string): Promise<WorkspaceSummaryDto> {
    await this.access.requireMembership(workspaceId, userId);
    const inWorkspace = { project: { workspaceId } };
    const open = { ...inWorkspace, status: { not: TaskStatus.DONE } };
    const [projects, members, grouped, overdueTasks, assignedToMe] = await Promise.all([
      this.db.project.count({ where: { workspaceId } }),
      this.db.workspaceMember.count({ where: { workspaceId } }),
      this.db.task.groupBy({ by: ['status'], where: inWorkspace, _count: { _all: true } }),
      this.db.task.count({ where: { ...open, dueDate: { lt: new Date() } } }),
      this.db.task.count({ where: { ...open, assigneeId: userId } }),
    ]);
    const tasksByStatus = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
    for (const row of grouped) tasksByStatus[row.status] = row._count._all;
    const openTasks = tasksByStatus.TODO + tasksByStatus.IN_PROGRESS + tasksByStatus.REVIEW;
    return { projects, members, tasksByStatus, openTasks, overdueTasks, assignedToMe };
  }

  private toDto(
    workspace: { id: string; name: string; slug: string; createdAt: Date; _count: { projects: number; members: number } },
    role: WorkspaceRole,
  ): WorkspaceDto {
    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role,
      projectCount: workspace._count.projects,
      memberCount: workspace._count.members,
      createdAt: workspace.createdAt,
    };
  }
}
