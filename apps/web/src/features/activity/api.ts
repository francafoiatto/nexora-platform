import type { Activity, ActivityPage } from '@nexora/contracts';
import { type InfiniteData, type QueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query';

export const activityApi = {
  list: (workspaceId: string, cursor?: string, limit = 25) =>
    apiClient.get<ActivityPage>(`/workspaces/${workspaceId}/activities`, { params: { limit, cursor } }).then((r) => r.data),
};

export function useActivities(workspaceId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.activities(workspaceId),
    queryFn: ({ pageParam }) => activityApi.list(workspaceId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Prepends a live activity to the first page, skipping it if already present. */
export function prependActivity(queryClient: QueryClient, activity: Activity) {
  queryClient.setQueryData<InfiniteData<ActivityPage, string | undefined>>(queryKeys.activities(activity.workspaceId), (data) => {
    if (!data || data.pages.some((page) => page.items.some((item) => item.id === activity.id))) return data;
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ ...first, items: [activity, ...first.items] }, ...rest] };
  });
}
