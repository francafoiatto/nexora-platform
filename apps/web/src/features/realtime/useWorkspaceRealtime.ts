import type { RealtimeEvents } from '@nexora/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryKeys } from '../../lib/query';
import { prependActivity } from '../activity/api';
import { removeProject, upsertProject } from '../projects/api';
import { invalidateTaskAggregates, removeTask, upsertTask } from '../tasks/api';
import { getSocket } from './socket';

export type RealtimeStatus = 'connecting' | 'live' | 'offline' | 'denied';

/**
 * Subscribes the current tab to a workspace room and merges server events into the query cache.
 * The join is authorized server-side (membership check); a denied join leaves the tab without updates.
 */
export function useWorkspaceRealtime(workspaceId: string): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    const socket = getSocket();
    let hasJoinedBefore = false;
    let active = true;

    const join = () => {
      setStatus('connecting');
      socket.emit('workspace.join', { workspaceId }, (ack) => {
        if (!active) return;
        setStatus(ack.ok ? 'live' : 'denied');
        // After a reconnect we may have missed events: resync everything in this workspace.
        if (ack.ok && hasJoinedBefore) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceId) });
          void queryClient.invalidateQueries({ queryKey: ['projects'] });
        }
        hasJoinedBefore = true;
      });
    };
    const onDisconnect = () => active && setStatus('offline');
    const onConnectError = () => active && setStatus('offline');

    const handlers: { [K in keyof RealtimeEvents]: (payload: RealtimeEvents[K]) => void } = {
      'task.created': ({ task, projectId }) => {
        upsertTask(queryClient, task);
        invalidateTaskAggregates(queryClient, workspaceId, projectId);
      },
      'task.updated': ({ task, projectId }) => {
        upsertTask(queryClient, task);
        invalidateTaskAggregates(queryClient, workspaceId, projectId);
      },
      'task.deleted': ({ taskId, projectId }) => {
        removeTask(queryClient, projectId, taskId);
        invalidateTaskAggregates(queryClient, workspaceId, projectId);
      },
      'project.created': ({ project }) => {
        upsertProject(queryClient, project);
        void queryClient.invalidateQueries({ queryKey: queryKeys.summary(workspaceId) });
      },
      'project.updated': ({ project }) => upsertProject(queryClient, project),
      'project.deleted': ({ projectId }) => {
        removeProject(queryClient, workspaceId, projectId);
        void queryClient.invalidateQueries({ queryKey: queryKeys.summary(workspaceId) });
      },
      'activity.created': ({ activity }) => prependActivity(queryClient, activity),
    };

    // Events are routed by workspaceId so a tab switching workspaces never applies stale events.
    const bound = Object.entries(handlers).map(([event, handler]) => {
      const listener = (payload: { workspaceId: string }) => {
        if (payload.workspaceId === workspaceId) (handler as (p: unknown) => void)(payload);
      };
      socket.on(event as keyof RealtimeEvents, listener as never);
      return [event, listener] as const;
    });

    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    if (socket.connected) join();

    return () => {
      active = false;
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      for (const [event, listener] of bound) socket.off(event as keyof RealtimeEvents, listener as never);
      if (socket.connected) socket.emit('workspace.leave', { workspaceId }, () => undefined);
    };
  }, [workspaceId, queryClient]);

  return status;
}
