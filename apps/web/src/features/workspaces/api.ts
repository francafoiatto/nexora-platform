import type { AddMemberInput, Member, Workspace, WorkspaceInput, WorkspaceSummary } from '@nexora/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query';

export const workspacesApi = {
  list: () => apiClient.get<Workspace[]>('/workspaces').then((r) => r.data),
  get: (id: string) => apiClient.get<Workspace>(`/workspaces/${id}`).then((r) => r.data),
  create: (input: WorkspaceInput) => apiClient.post<Workspace>('/workspaces', input).then((r) => r.data),
  update: (id: string, input: WorkspaceInput) => apiClient.patch<Workspace>(`/workspaces/${id}`, input).then((r) => r.data),
  summary: (id: string) => apiClient.get<WorkspaceSummary>(`/workspaces/${id}/summary`).then((r) => r.data),
  members: (id: string) => apiClient.get<Member[]>(`/workspaces/${id}/members`).then((r) => r.data),
  addMember: (id: string, input: AddMemberInput) => apiClient.post<Member>(`/workspaces/${id}/members`, input).then((r) => r.data),
};

export function useWorkspaces() {
  return useQuery({ queryKey: queryKeys.workspaces, queryFn: workspacesApi.list });
}

export function useWorkspace(workspaceId: string) {
  return useQuery({ queryKey: queryKeys.workspace(workspaceId), queryFn: () => workspacesApi.get(workspaceId) });
}

export function useWorkspaceSummary(workspaceId: string) {
  return useQuery({ queryKey: queryKeys.summary(workspaceId), queryFn: () => workspacesApi.summary(workspaceId) });
}

export function useMembers(workspaceId: string) {
  return useQuery({ queryKey: queryKeys.members(workspaceId), queryFn: () => workspacesApi.members(workspaceId), staleTime: 60_000 });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workspacesApi.create,
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace[]>(queryKeys.workspaces, (list) => (list ? [...list, workspace] : [workspace]));
      queryClient.setQueryData(queryKeys.workspace(workspace.id), workspace);
    },
  });
}

export function useUpdateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkspaceInput) => workspacesApi.update(workspaceId, input),
    onSuccess: (workspace) => {
      queryClient.setQueryData(queryKeys.workspace(workspaceId), workspace);
      queryClient.setQueryData<Workspace[]>(queryKeys.workspaces, (list) => list?.map((w) => (w.id === workspace.id ? workspace : w)));
    },
  });
}

export function useAddMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemberInput) => workspacesApi.addMember(workspaceId, input),
    onSuccess: (member) => {
      queryClient.setQueryData<Member[]>(queryKeys.members(workspaceId), (list) => (list ? [...list, member] : [member]));
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceId), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary(workspaceId) });
    },
  });
}
