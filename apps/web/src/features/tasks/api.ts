import type { Priority, Task, TaskStatus } from '@nexora/contracts';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query';

export interface TaskPayload {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  dueDate: string | null;
}

export const tasksApi = {
  list: (projectId: string) => apiClient.get<Task[]>(`/projects/${projectId}/tasks`).then((r) => r.data),
  create: (projectId: string, input: Partial<TaskPayload> & { title: string }) =>
    apiClient.post<Task>(`/projects/${projectId}/tasks`, input).then((r) => r.data),
  update: (taskId: string, input: Partial<TaskPayload>) => apiClient.patch<Task>(`/tasks/${taskId}`, input).then((r) => r.data),
  remove: (taskId: string) => apiClient.delete(`/tasks/${taskId}`).then(() => undefined),
};

export function useTasks(projectId: string) {
  return useQuery({ queryKey: queryKeys.tasks(projectId), queryFn: () => tasksApi.list(projectId) });
}

/**
 * Idempotent cache writes. The same task can arrive from a mutation response and from the
 * realtime echo of that mutation; upserting by id guarantees no duplicates either way.
 */
export function upsertTask(queryClient: QueryClient, task: Task) {
  queryClient.setQueryData<Task[]>(queryKeys.tasks(task.projectId), (list) => {
    if (!list) return list;
    const index = list.findIndex((t) => t.id === task.id);
    if (index === -1) return [task, ...list];
    // Ignore stale payloads that arrive after a newer version.
    if (new Date(list[index].updatedAt) > new Date(task.updatedAt)) return list;
    const next = list.slice();
    next[index] = task;
    return next;
  });
}

export function removeTask(queryClient: QueryClient, projectId: string, taskId: string) {
  queryClient.setQueryData<Task[]>(queryKeys.tasks(projectId), (list) => list?.filter((t) => t.id !== taskId));
}

/** Counters derived from tasks (dashboard, project cards) are refetched rather than recomputed. */
export function invalidateTaskAggregates(queryClient: QueryClient, workspaceId: string, projectId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.summary(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId), exact: true });
}

export function useCreateTask(workspaceId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<TaskPayload> & { title: string }) => tasksApi.create(projectId, input),
    onSuccess: (task) => {
      upsertTask(queryClient, task);
      invalidateTaskAggregates(queryClient, workspaceId, projectId);
    },
  });
}

export function useUpdateTask(workspaceId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: Partial<TaskPayload> }) => tasksApi.update(taskId, input),
    onSuccess: (task) => {
      upsertTask(queryClient, task);
      invalidateTaskAggregates(queryClient, workspaceId, projectId);
    },
  });
}

/**
 * Status moves are optimistic: the card moves immediately and rolls back if the server rejects it.
 * This is safe because a status change has no server-side derived fields the UI depends on.
 */
export function useMoveTask(workspaceId: string, projectId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.tasks(projectId);
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) => tasksApi.update(taskId, { status }),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, (list) => list?.map((t) => (t.id === taskId ? { ...t, status } : t)));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (task) => upsertTask(queryClient, task),
    onSettled: () => invalidateTaskAggregates(queryClient, workspaceId, projectId),
  });
}

export function useDeleteTask(workspaceId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.remove(taskId),
    onSuccess: (_, taskId) => {
      removeTask(queryClient, projectId, taskId);
      invalidateTaskAggregates(queryClient, workspaceId, projectId);
    },
  });
}
