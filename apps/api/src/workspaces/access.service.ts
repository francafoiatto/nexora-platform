import { Global, HttpStatus, Injectable, Module } from '@nestjs/common';
import { type Project, type Task, type WorkspaceMember, WorkspaceRole } from '@prisma/client';
import { AppException, ErrorCode, forbidden, notFound } from '../common/errors';
import { PrismaService, type Tx } from '../prisma/prisma.service';

/**
 * Single place where tenant isolation is enforced.
 *
 * Every private resource is resolved server-side through its chain
 * Task → Project → Workspace → WorkspaceMember. Non-members receive 404 (not 403)
 * so the existence of other tenants' resources is never revealed.
 */
@Injectable()
export class AccessService {
  constructor(private readonly db: PrismaService) {}

  async requireMembership(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const membership = await this.db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!membership) throw notFound('Workspace');
    return membership;
  }

  async requireOwner(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const membership = await this.requireMembership(workspaceId, userId);
    if (membership.role !== WorkspaceRole.OWNER) throw forbidden('Only workspace owners can perform this action');
    return membership;
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const count = await this.db.workspaceMember.count({ where: { workspaceId, userId } });
    return count > 0;
  }

  async requireProject(projectId: string, userId: string): Promise<Project & { role: WorkspaceRole }> {
    const project = await this.db.project.findFirst({
      where: { id: projectId, workspace: { members: { some: { userId } } } },
      include: { workspace: { select: { members: { where: { userId }, select: { role: true } } } } },
    });
    if (!project) throw notFound('Project');
    const { workspace, ...rest } = project;
    return { ...rest, role: workspace.members[0].role };
  }

  async requireTask(taskId: string, userId: string): Promise<Task & { project: Project }> {
    const task = await this.db.task.findFirst({
      where: { id: taskId, project: { workspace: { members: { some: { userId } } } } },
      include: { project: true },
    });
    if (!task) throw notFound('Task');
    return task;
  }

  /**
   * An assignee must be a member of the task's workspace. The client-supplied id is never trusted:
   * membership is checked against the workspace resolved on the server.
   */
  async assertAssignable(workspaceId: string, assigneeId: string | null | undefined, tx: Tx = this.db): Promise<void> {
    if (assigneeId === null || assigneeId === undefined) return;
    const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: assigneeId } } });
    if (!member) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.ASSIGNEE_NOT_MEMBER, 'Assignee must be a member of this workspace', [
        { field: 'assigneeId', message: 'Assignee must be a member of this workspace' },
      ]);
    }
  }
}

@Global()
@Module({ providers: [AccessService], exports: [AccessService] })
export class AccessModule {}
