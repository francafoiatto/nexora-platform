import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import type { AuthUser } from '../common/decorators/auth.decorators';
import { AccessService } from '../workspaces/access.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const workspaceRoom = (workspaceId: string) => `workspace:${workspaceId}`;

export type JoinAck = { ok: true } | { ok: false; code: 'VALIDATION_ERROR' | 'NOT_FOUND' };

interface SocketData {
  user: AuthUser;
}

/**
 * Socket.IO gateway. CORS is configured by ConfiguredIoAdapter (same allow-list as HTTP).
 *
 * 1. The handshake is authenticated with the same JWT as HTTP (`auth: { token }`);
 *    unauthenticated sockets are rejected before `connection`.
 * 2. Joining a workspace room requires a membership check on the server.
 * 3. The server only emits; clients cannot broadcast to rooms.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly access: AccessService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      const token: unknown = socket.handshake.auth?.token;
      const user = typeof token === 'string' ? await this.tokens.verify(token) : null;
      if (!user) return next(new Error('UNAUTHORIZED'));
      (socket.data as SocketData).user = user;
      next();
    });
  }

  handleConnection(socket: Socket) {
    this.logger.debug(`socket connected user=${(socket.data as SocketData).user.id}`);
  }

  @SubscribeMessage('workspace.join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { workspaceId?: unknown }): Promise<JoinAck> {
    const workspaceId = body?.workspaceId;
    if (typeof workspaceId !== 'string' || !UUID.test(workspaceId)) return { ok: false, code: 'VALIDATION_ERROR' };
    const { user } = socket.data as SocketData;
    if (!(await this.access.isMember(workspaceId, user.id))) {
      this.logger.warn(`denied workspace.join user=${user.id} workspace=${workspaceId}`);
      return { ok: false, code: 'NOT_FOUND' };
    }
    await socket.join(workspaceRoom(workspaceId));
    return { ok: true };
  }

  @SubscribeMessage('workspace.leave')
  async leave(@ConnectedSocket() socket: Socket, @MessageBody() body: { workspaceId?: unknown }): Promise<{ ok: true }> {
    if (typeof body?.workspaceId === 'string') await socket.leave(workspaceRoom(body.workspaceId));
    return { ok: true };
  }
}
