import { vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

/** Minimal in-memory stand-in for the Socket.IO client used by useWorkspaceRealtime. */
export class FakeSocket {
  connected = true;
  joined: string[] = [];
  joinAck: { ok: boolean; code?: string } = { ok: true };
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, body: { workspaceId: string }, ack?: (result: unknown) => void) {
    if (event === 'workspace.join') {
      this.joined.push(body.workspaceId);
      ack?.(this.joinAck);
    } else {
      ack?.({ ok: true });
    }
    return this;
  }

  /** Simulates a server → client event. */
  serverEmit(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }

  listenerCount(event: string) {
    return this.listeners.get(event)?.size ?? 0;
  }
}

export const fakeSocket = new FakeSocket();

export function mockSocketModule() {
  return {
    getSocket: vi.fn(() => fakeSocket),
    disconnectSocket: vi.fn(),
  };
}
