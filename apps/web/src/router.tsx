import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router';
import { AppShell } from './components/layout/AppShell';
import { EmptyState } from './components/ui/States';
import { ActivityPage } from './features/activity/ActivityPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { BoardPage } from './features/tasks/BoardPage';
import { SettingsPage } from './features/workspaces/SettingsPage';
import { WorkspacesIndexPage } from './features/workspaces/WorkspacesIndexPage';
import { session, useSession } from './lib/session';
import { useRedirectOnce } from './lib/use-redirect';

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: session.get() ? '/app' : '/login' });
  },
});

const guestOnly = () => {
  if (session.get()) throw redirect({ to: '/app' });
};

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  beforeLoad: guestOnly,
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  beforeLoad: guestOnly,
  component: RegisterPage,
});

/** Everything under /app requires a session. Losing it (sign-out, 401) redirects to /login. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  beforeLoad: ({ location }) => {
    if (!session.get()) throw redirect({ to: '/login', search: { redirect: location.href } });
  },
  component: RequireSession,
});

function RequireSession() {
  const current = useSession();
  const href = useRouterState({ select: (s) => s.location.href });
  useRedirectOnce(!current, () => ({ to: '/login', search: { redirect: href.startsWith('/app') ? href : undefined }, replace: true }));
  return current ? <Outlet /> : null;
}

const appIndexRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: WorkspacesIndexPage });

const workspaceRoute = createRoute({ getParentRoute: () => appRoute, path: '$workspaceId', component: AppShell });
const dashboardRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/', component: DashboardPage });
const projectsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: 'projects', component: ProjectsPage });
const projectRoute = createRoute({ getParentRoute: () => workspaceRoute, path: 'projects/$projectId', component: BoardPage });
const activityRoute = createRoute({ getParentRoute: () => workspaceRoute, path: 'activity', component: ActivityPage });
const settingsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: 'settings', component: SettingsPage });

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  appRoute.addChildren([
    appIndexRoute,
    workspaceRoute.addChildren([dashboardRoute, projectsRoute, projectRoute, activityRoute, settingsRoute]),
  ]),
]);

function NotFound() {
  return (
    <main className="auth">
      <EmptyState
        title="Page not found"
        description="The page you’re looking for doesn’t exist."
        action={
          <Link to="/" className="btn btn-primary btn-md">
            Go home
          </Link>
        }
      />
    </main>
  );
}

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent', defaultPreloadStaleTime: 0 });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
