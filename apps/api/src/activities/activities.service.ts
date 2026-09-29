import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export const ActivityAction = {
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_UPDATED: 'workspace.updated',
  MEMBER_ADDED: 'member.added',
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_DELETED: 'project.deleted',
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_STATUS_CHANGED: 'task.status_changed',
  TASK_DELETED: 'task.deleted',
} as const;
export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];

export type ActivityEntity = 'WORKSPACE' | 'MEMBER' | 'PROJECT' | 'TASK';

export interface RecordActivity {
  workspaceId: string;
  actorId: string;
  entityType: ActivityEntity;
  entityId: string;
  action: ActivityAction;
  /** Denormalized labels (titles, names) so the feed stays readable after entities are deleted. */
  metadata?: Prisma.InputJsonObject;
}

export const ACTIVITY_SELECT = {
  id: true,
  workspaceId: true,
  entityType: true,
  entityId: true,
  action: true,
  metadata: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} as const;

export type ActivityView = Prisma.ActivityGetPayload<{ select: typeof ACTIVITY_SELECT }>;

@Injectable()
export class ActivitiesService {
  constructor(private readonly db: PrismaService) {}

  /** Must be called with the transaction of the mutation it describes, so both commit or neither does. */
  record(tx: Tx, input: RecordActivity): Promise<ActivityView> {
    return tx.activity.create({ data: input, select: ACTIVITY_SELECT });
  }

  async list(workspaceId: string, limit: number, cursor?: string): Promise<{ items: ActivityView[]; nextCursor: string | null }> {
    const rows = await this.db.activity.findMany({
      where: { workspaceId },
      select: ACTIVITY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }
}
