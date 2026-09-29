import { Injectable } from '@nestjs/common';
import { type Project, TaskStatus, WorkspaceRole } from '@prisma/client';
import { ActivitiesService, ActivityAction } from '../activities/activities.service';
import { forbidden } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AccessService } from '../workspaces/access.service';
import type { CreateProjectDto, ProjectDto, UpdateProjectDto } from './dto/project.dto';

type TaskCounts = Record<TaskStatus, number>;
const emptyCounts = (): TaskCounts => ({ TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 });

@Injectable()
export class ProjectsService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(workspaceId: string, userId: string): Promise<ProjectDto[]> {
    await this.access.requireMembership(workspaceId, userId);
    const [projects, grouped] = await Promise.all([
      this.db.project.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.db.task.groupBy({ by: ['projectId', 'status'], where: { project: { workspaceId } }, _count: { _all: true } }),
    ]);
    const counts = new Map<string, TaskCounts>();
    for (const row of grouped) {
      const entry = counts.get(row.projectId) ?? emptyCounts();
      entry[row.status] = row._count._all;
      counts.set(row.projectId, entry);
    }
    return projects.map((project) => ({ ...project, taskCounts: counts.get(project.id) ?? emptyCounts() }));
  }

  async get(projectId: string, userId: string): Promise<ProjectDto> {
    const { role: _role, ...project } = await this.access.requireProject(projectId, userId);
    return this.withCounts(project);
  }

  async create(workspaceId: string, userId: string, dto: CreateProjectDto): Promise<ProjectDto> {
    await this.access.requireMembership(workspaceId, userId);
    const { project, activity } = await this.db.$transaction(async (tx) => {
      const project = await tx.project.create({ data: { workspaceId, name: dto.name, description: dto.description ?? null } });
      const activity = await this.activities.record(tx, {
        workspaceId,
        actorId: userId,
        entityType: 'PROJECT',
        entityId: project.id,
        action: ActivityAction.PROJECT_CREATED,
        metadata: { name: project.name },
      });
      return { project, activity };
    });
    const view = { ...project, taskCounts: emptyCounts() };
    this.realtime.emit(workspaceId, 'project.created', { project: view });
    this.realtime.emit(workspaceId, 'activity.created', { activity });
    return view;
  }

  async update(projectId: string, userId: string, dto: UpdateProjectDto): Promise<ProjectDto> {
    const { role: _role, ...before } = await this.access.requireProject(projectId, userId);
    const changed = (['name', 'description'] as const).filter((key) => dto[key] !== undefined && dto[key] !== before[key]);
    if (changed.length === 0) return this.withCounts(before);

    const { project, activity } = await this.db.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: projectId },
        data: { name: dto.name, description: dto.description },
      });
      const activity = await this.activities.record(tx, {
        workspaceId: project.workspaceId,
        actorId: userId,
        entityType: 'PROJECT',
        entityId: project.id,
        action: ActivityAction.PROJECT_UPDATED,
        metadata: { name: project.name, changes: [...changed] },
      });
      return { project, activity };
    });
    const view = await this.withCounts(project);
    this.realtime.emit(project.workspaceId, 'project.updated', { project: view });
    this.realtime.emit(project.workspaceId, 'activity.created', { activity });
    return view;
  }

  async remove(projectId: string, userId: string): Promise<void> {
    const project = await this.access.requireProject(projectId, userId);
    if (project.role !== WorkspaceRole.OWNER) throw forbidden('Only workspace owners can delete projects');
    const activity = await this.db.$transaction(async (tx) => {
      await tx.project.delete({ where: { id: projectId } });
      return this.activities.record(tx, {
        workspaceId: project.workspaceId,
        actorId: userId,
        entityType: 'PROJECT',
        entityId: projectId,
        action: ActivityAction.PROJECT_DELETED,
        metadata: { name: project.name },
      });
    });
    this.realtime.emit(project.workspaceId, 'project.deleted', { projectId });
    this.realtime.emit(project.workspaceId, 'activity.created', { activity });
  }

  private async withCounts(project: Project): Promise<ProjectDto> {
    const grouped = await this.db.task.groupBy({ by: ['status'], where: { projectId: project.id }, _count: { _all: true } });
    const taskCounts = emptyCounts();
    for (const row of grouped) taskCounts[row.status] = row._count._all;
    return { ...project, taskCounts };
  }
}
