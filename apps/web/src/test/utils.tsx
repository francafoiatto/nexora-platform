import type { AuthResponse, Member, Project, Task, Workspace } from '@nexora/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '../lib/api-client';
import { session } from '../lib/session';
import { routeTree } from '../router';

type Reply = { status: number; data?: unknown };
type Handler = (request: { body: unknown; params: Record<string, string>; query: URLSearchParams }) => Reply | Promise<Reply>;

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Replaces the HTTP transport of the real API client. Routes are "METHOD /path/:param".
 * Unmatched requests fail loudly so tests never pass by accident.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: ApiCall[] = [];
  const compiled = Object.entries(routes).map(([key, handler]) => {
    const [method, pattern] = key.split(' ');
    const names: string[] = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, name: string) => (names.push(name), '([^/]+)'))}$`);
    return { method, regex, names, handler };
  });

  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(config.url ?? '', 'http://test.local/');
    const path = url.pathname.replace(/^\//, '/');
    const method = (config.method ?? 'get').toUpperCase();
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    for (const [k, v] of Object.entries(config.params ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    calls.push({ method, path, body });

    const route = compiled.find((r) => r.method === method && r.regex.test(path));
    const reply: Reply = route
      ? await route.handler({
          body,
          query: url.searchParams,
          params: Object.fromEntries(route.names.map((name, i) => [name, path.match(route.regex)![i + 1]])),
        })
      : { status: 599, data: { code: 'UNMOCKED', message: `Unmocked request ${method} ${path}`, details: [] } };

    const response: AxiosResponse = { data: reply.data, status: reply.status, statusText: '', headers: {}, config: { ...config, headers: new AxiosHeaders(config.headers) } };
    if (reply.status >= 400) throw new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response);
    return response;
  };
  return calls;
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }), context: { queryClient } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}

/* ------------------------------------------------------------ fixtures */

export const WS_ID = '11111111-1111-4111-8111-111111111111';
export const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
export const USER: AuthResponse['user'] = { id: '33333333-3333-4333-8333-333333333333', name: 'Alex Morgan', email: 'alex@example.test' };
export const TEAMMATE = { id: '44444444-4444-4444-8444-444444444444', name: 'Priya Shah', email: 'priya@example.test' };

export function signIn() {
  session.set({ accessToken: 'test-token', expiresIn: 3600, user: USER });
}

export const workspace: Workspace = {
  id: WS_ID,
  name: 'Acme Ops',
  slug: 'acme-ops',
  role: 'OWNER',
  projectCount: 1,
  memberCount: 2,
  createdAt: '2026-09-01T00:00:00.000Z',
};

export const project: Project = {
  id: PROJECT_ID,
  workspaceId: WS_ID,
  name: 'Platform launch',
  description: 'Ship v1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  taskCounts: { TODO: 1, IN_PROGRESS: 1, REVIEW: 0, DONE: 0 },
};

export const members: Member[] = [
  { ...USER, role: 'OWNER' },
  { ...TEAMMATE, role: 'MEMBER' },
];

let seq = 0;
export function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `55555555-5555-4555-8555-${String(seq).padStart(12, '0')}`,
    projectId: PROJECT_ID,
    title: `Task ${seq}`,
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: null,
    assignee: null,
    createdBy: { id: USER.id, name: USER.name },
    dueDate: null,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
    ...overrides,
  };
}

/** Standard routes for a signed-in user inside WS_ID. */
export function workspaceRoutes(extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    'GET /auth/me': () => ({ status: 200, data: USER }),
    'GET /workspaces': () => ({ status: 200, data: [workspace] }),
    [`GET /workspaces/${WS_ID}`]: () => ({ status: 200, data: workspace }),
    [`GET /workspaces/${WS_ID}/members`]: () => ({ status: 200, data: members }),
    [`GET /projects/${PROJECT_ID}`]: () => ({ status: 200, data: project }),
    ...extra,
  };
}
