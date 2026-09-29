import type { Project } from '@nexora/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query';

export interface ProjectPayload {
  name: string;
  description: string | null;
}

export const projectsApi = {
  list: (workspaceId: string) => apiClient.get<Project[]>(`/workspaces/${workspaceId}/projects`).then((r) => r.data),
  get: (projectId: string) => apiClient.get<Project>(`/projects/${projectId}`).then((r) => r.data),
  create: (workspaceId: string, input: ProjectPayload) => apiClient.post<Project>(`/workspaces/${workspaceId}/projects`, input).then((r) => r.data),
  update: (projectId: string, input: Partial<ProjectPayload>) => apiClient.patch<Project>(`/projects/${projectId}`, input).then((r) => r.data),
  remove: (projectId: string) => apiClient.delete(`/projects/${projectId}`).then(() => undefined),
};

export function useProjects(workspaceId: string) {
  return useQuery({ queryKey: queryKeys.projects(workspaceId), queryFn: () => projectsApi.list(workspaceId) });
}

export function useProject(projectId: string) {
  return useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => projectsApi.get(projectId) });
}

/** Keeps the list, detail, dashboard and workspace counters consistent after any project change. */
export function upsertProject(queryClient: ReturnType<typeof useQueryClient>, project: Project) {
  queryClient.setQueryData<Project[]>(queryKeys.projects(project.workspaceId), (list) => {
    if (!list) return list;
    return list.some((p) => p.id === project.id) ? list.map((p) => (p.id === project.id ? project : p)) : [project, ...list];
  });
  queryClient.setQueryData(queryKeys.project(project.id), project);
}

export function removeProject(queryClient: ReturnType<typeof useQueryClient>, workspaceId: string, projectId: string) {
  queryClient.setQueryData<Project[]>(queryKeys.projects(workspaceId), (list) => list?.filter((p) => p.id !== projectId));
  queryClient.removeQueries({ queryKey: queryKeys.project(projectId) });
}

export function useCreateProject(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectPayload) => projectsApi.create(workspaceId, input),
    onSuccess: (project) => {
      upsertProject(queryClient, project);
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceId), exact: true });
    },
  });
}

export function useUpdateProject(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: Partial<ProjectPayload> }) => projectsApi.update(projectId, input),
    onSuccess: (project) => {
      upsertProject(queryClient, project);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceId), exact: true });
    },
  });
}

export function useDeleteProject(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => projectsApi.remove(projectId),
    onSuccess: (_, projectId) => {
      removeProject(queryClient, workspaceId, projectId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceId), exact: true });
    },
  });
}
