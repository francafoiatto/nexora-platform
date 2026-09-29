import type { ActivityPage, Task } from '@nexora/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../lib/query';
import { fakeSocket, mockSocketModule } from '../../test/socket-mock';
import { makeTask, PROJECT_ID, USER, WS_ID } from '../../test/utils';
import { useWorkspaceRealtime } from './useWorkspaceRealtime';

vi.mock('./socket', () => mockSocketModule());

const OTHER_WS = '99999999-9999-4999-8999-999999999999';

function setup(initialTasks: Task[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(queryKeys.tasks(PROJECT_ID), initialTasks);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useWorkspaceRealtime(WS_ID), { wrapper });
  const tasks = () => queryClient.getQueryData<Task[]>(queryKeys.tasks(PROJECT_ID))!;
  return { queryClient, hook, tasks };
}

describe('useWorkspaceRealtime', () => {
  beforeEach(() => {
    fakeSocket.joined = [];
    fakeSocket.joinAck = { ok: true };
  });

  it('requests a membership-checked join and reports live status', async () => {
    const { hook } = setup([]);
    expect(fakeSocket.joined).toEqual([WS_ID]);
    await waitFor(() => expect(hook.result.current).toBe('live'));
  });

  it('reports "denied" when the server refuses the join', async () => {
    fakeSocket.joinAck = { ok: false, code: 'NOT_FOUND' };
    const { hook } = setup([]);
    await waitFor(() => expect(hook.result.current).toBe('denied'));
  });

  it('merges task.created without duplicating an echo of the same task', () => {
    const { tasks } = setup([]);
    const created = makeTask({ title: 'From teammate' });
    act(() => {
      fakeSocket.serverEmit('task.created', { workspaceId: WS_ID, projectId: PROJECT_ID, task: created });
      fakeSocket.serverEmit('task.created', { workspaceId: WS_ID, projectId: PROJECT_ID, task: created });
    });
    expect(tasks()).toEqual([created]);
  });

  it('applies task.updated and ignores stale versions', () => {
    const original = makeTask({ status: 'TODO', updatedAt: '2026-09-20T10:00:00.000Z' });
    const { tasks } = setup([original]);
    const newer = { ...original, status: 'DONE' as const, updatedAt: '2026-09-20T12:00:00.000Z' };
    const stale = { ...original, status: 'REVIEW' as const, updatedAt: '2026-09-20T11:00:00.000Z' };
    act(() => {
      fakeSocket.serverEmit('task.updated', { workspaceId: WS_ID, projectId: PROJECT_ID, task: newer });
      fakeSocket.serverEmit('task.updated', { workspaceId: WS_ID, projectId: PROJECT_ID, task: stale });
    });
    expect(tasks()[0].status).toBe('DONE');
  });

  it('removes deleted tasks', () => {
    const doomed = makeTask();
    const { tasks } = setup([doomed, makeTask()]);
    act(() => fakeSocket.serverEmit('task.deleted', { workspaceId: WS_ID, projectId: PROJECT_ID, taskId: doomed.id }));
    expect(tasks().map((t) => t.id)).not.toContain(doomed.id);
    expect(tasks()).toHaveLength(1);
  });

  it('ignores events addressed to another workspace', () => {
    const { tasks } = setup([]);
    act(() => fakeSocket.serverEmit('task.created', { workspaceId: OTHER_WS, projectId: PROJECT_ID, task: makeTask() }));
    expect(tasks()).toEqual([]);
  });

  it('invalidates derived counters so the dashboard refreshes', () => {
    const { queryClient } = setup([]);
    queryClient.setQueryData(queryKeys.summary(WS_ID), { openTasks: 0 });
    act(() => fakeSocket.serverEmit('task.created', { workspaceId: WS_ID, projectId: PROJECT_ID, task: makeTask() }));
    expect(queryClient.getQueryState(queryKeys.summary(WS_ID))?.isInvalidated).toBe(true);
  });

  it('prepends live activity once', () => {
    const { queryClient } = setup([]);
    queryClient.setQueryData(queryKeys.activities(WS_ID), { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] });
    const activity = {
      id: 'a1',
      workspaceId: WS_ID,
      entityType: 'TASK',
      entityId: 't1',
      action: 'task.created',
      metadata: { title: 'x' },
      createdAt: '2026-09-20T10:00:00.000Z',
      actor: { id: USER.id, name: USER.name },
    };
    act(() => {
      fakeSocket.serverEmit('activity.created', { workspaceId: WS_ID, activity });
      fakeSocket.serverEmit('activity.created', { workspaceId: WS_ID, activity });
    });
    const data = queryClient.getQueryData<{ pages: ActivityPage[] }>(queryKeys.activities(WS_ID));
    expect(data?.pages[0].items).toHaveLength(1);
  });

  it('unsubscribes all listeners on unmount', () => {
    const { hook } = setup([]);
    expect(fakeSocket.listenerCount('task.created')).toBeGreaterThan(0);
    hook.unmount();
    expect(fakeSocket.listenerCount('task.created')).toBe(0);
    expect(fakeSocket.listenerCount('connect')).toBe(0);
  });
});
