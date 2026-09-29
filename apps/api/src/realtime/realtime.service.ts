import { Injectable } from '@nestjs/common';
import { RealtimeGateway, workspaceRoom } from './realtime.gateway';

/** Server → client events. Payloads always carry workspaceId so clients can route them. */
export type RealtimeEvent =
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'activity.created';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  /** Call only after the database transaction has committed. */
  emit(workspaceId: string, event: RealtimeEvent, payload: Record<string, unknown>): void {
    this.gateway.server?.to(workspaceRoom(workspaceId)).emit(event, { workspaceId, ...payload });
  }
}
