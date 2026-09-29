import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

/** Centralized query keys. Workspace-scoped keys share the ['workspaces', id] prefix for bulk invalidation. */
export const queryKeys = {
  me: ['me'] as const,
  workspaces: ['workspaces'] as const,
  workspace: (workspaceId: string) => ['workspaces', workspaceId] as const,
  summary: (workspaceId: string) => ['workspaces', workspaceId, 'summary'] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  projects: (workspaceId: string) => ['workspaces', workspaceId, 'projects'] as const,
  activities: (workspaceId: string) => ['workspaces', workspaceId, 'activities'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  tasks: (projectId: string) => ['projects', projectId, 'tasks'] as const,
};

/** Client errors (4xx) are deterministic; retrying them only delays feedback. */
export function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.isClientError) return false;
  return failureCount < 2;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
