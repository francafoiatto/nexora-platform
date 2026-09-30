import type { JoinAck, RealtimeEvents } from '@nexora/contracts';
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from '../../lib/api-client';
import { session } from '../../lib/session';

type ServerToClient = { [K in keyof RealtimeEvents]: (payload: RealtimeEvents[K]) => void };
interface ClientToServer {
  'workspace.join': (body: { workspaceId: string }, ack: (result: JoinAck) => void) => void;
  'workspace.leave': (body: { workspaceId: string }, ack: (result: { ok: true }) => void) => void;
}
export type RealtimeSocket = Socket<ServerToClient, ClientToServer>;

/**
 * Socket.IO is served by the API process, so by default it uses the API's origin (VITE_API_URL).
 * VITE_SOCKET_URL overrides it; undefined = same origin (Vite proxies /socket.io in development).
 */
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_ORIGIN;

let socket: RealtimeSocket | null = null;

/** One authenticated socket per signed-in session. The token is read on every (re)connect attempt. */
export function getSocket(): RealtimeSocket {
  if (!socket) {
    const options = {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: (cb: (data: Record<string, unknown>) => void) => cb({ token: session.get()?.token ?? '' }),
    };
    socket = (SOCKET_URL ? io(SOCKET_URL, options) : io(options)) as RealtimeSocket;
  }
  if (!socket.connected && session.get()) socket.connect();
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

session.subscribe(() => {
  if (!session.get()) disconnectSocket();
});
