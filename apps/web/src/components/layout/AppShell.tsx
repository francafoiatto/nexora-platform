import { Link, Outlet, useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { Activity, ChevronsUpDown, FolderKanban, LayoutDashboard, LogOut, Menu, Plus, Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLogout, useMe } from '../../features/auth/api';
import { type RealtimeStatus, useWorkspaceRealtime } from '../../features/realtime/useWorkspaceRealtime';
import { useWorkspace, useWorkspaces } from '../../features/workspaces/api';
import { lastWorkspace } from '../../features/workspaces/last-workspace';
import { CreateWorkspaceDialog } from '../../features/workspaces/WorkspaceForm';
import { ApiError } from '../../lib/api-client';
import { Avatar } from '../ui/Badges';
import { IconButton } from '../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../ui/States';
import { Logo } from './Logo';

const STATUS_LABEL: Record<RealtimeStatus, string> = {
  live: 'Live',
  connecting: 'Connecting…',
  offline: 'Offline — reconnecting',
  denied: 'Live updates unavailable',
};

export function AppShell() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const workspace = useWorkspace(workspaceId);
  const realtime = useWorkspaceRealtime(workspaceId);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    if (workspace.isSuccess) lastWorkspace.set(workspaceId);
  }, [workspace.isSuccess, workspaceId]);

  let content = <Outlet />;
  if (workspace.isPending) content = <LoadingState label="Loading workspace…" />;
  else if (workspace.isError) {
    const notFound = workspace.error instanceof ApiError && workspace.error.status === 404;
    content = notFound ? (
      <EmptyState
        title="Workspace not found"
        description="It may have been removed, or you don’t have access to it."
        action={
          <Link to="/app" className="btn btn-primary btn-md">
            Go to my workspaces
          </Link>
        }
      />
    ) : (
      <ErrorState error={workspace.error} onRetry={() => void workspace.refetch()} />
    );
  }

  return (
    <div className="shell">
      <a
        href="#main"
        className="skip-link"
        onClick={(event) => {
          // Move focus directly: a hash change would go through the router and lose focus.
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <IconButton label="Open navigation" onClick={() => setNavOpen(true)} aria-expanded={navOpen} aria-controls="sidebar">
          <Menu size={18} aria-hidden />
        </IconButton>
        <Logo />
        <LiveIndicator status={realtime} compact />
      </header>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden />}
      <aside id="sidebar" className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Primary">
        <div className="sidebar-head">
          <Logo />
          <IconButton label="Close navigation" className="sidebar-close" onClick={() => setNavOpen(false)}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>
        <WorkspaceSwitcher workspaceId={workspaceId} />
        <LiveIndicator status={realtime} />
        <nav className="nav">
          <NavItem to="/app/$workspaceId" workspaceId={workspaceId} exact icon={<LayoutDashboard size={17} aria-hidden />} label="Dashboard" />
          <NavItem to="/app/$workspaceId/projects" workspaceId={workspaceId} icon={<FolderKanban size={17} aria-hidden />} label="Projects" />
          <NavItem to="/app/$workspaceId/activity" workspaceId={workspaceId} icon={<Activity size={17} aria-hidden />} label="Activity" />
          <NavItem to="/app/$workspaceId/settings" workspaceId={workspaceId} icon={<Settings size={17} aria-hidden />} label="Settings" />
        </nav>
        <UserFooter role={workspace.data?.role} />
      </aside>
      <main id="main" className="content" tabIndex={-1}>
        {content}
      </main>
    </div>
  );
}

function NavItem({ to, workspaceId, icon, label, exact }: { to: string; workspaceId: string; icon: React.ReactNode; label: string; exact?: boolean }) {
  return (
    <Link to={to} params={{ workspaceId }} activeOptions={{ exact: !!exact }} activeProps={{ className: 'active', 'aria-current': 'page' }}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function LiveIndicator({ status, compact }: { status: RealtimeStatus; compact?: boolean }) {
  return (
    <div className={`live live-${status} ${compact ? 'live-compact' : ''}`} role="status" aria-live="polite" title={STATUS_LABEL[status]}>
      <span className="dot" aria-hidden />
      <span className={compact ? 'sr-only' : undefined}>{STATUS_LABEL[status]}</span>
    </div>
  );
}

function WorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const workspaces = useWorkspaces();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const current = workspaces.data?.find((w) => w.id === workspaceId);

  return (
    <div className="workspace-switch">
      <label htmlFor="workspace-select" className="sr-only">
        Current workspace
      </label>
      <div className="select-wrap">
        <select
          id="workspace-select"
          value={workspaceId}
          onChange={(event) => void navigate({ to: '/app/$workspaceId', params: { workspaceId: event.target.value } })}
        >
          {!current && <option value={workspaceId}>Loading…</option>}
          {workspaces.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown size={14} aria-hidden />
      </div>
      <IconButton label="Create workspace" onClick={() => setCreating(true)}>
        <Plus size={16} aria-hidden />
      </IconButton>
      <CreateWorkspaceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(w) => {
          setCreating(false);
          void navigate({ to: '/app/$workspaceId', params: { workspaceId: w.id } });
        }}
      />
    </div>
  );
}

function UserFooter({ role }: { role?: string }) {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const name = me.data?.name ?? '';
  return (
    <div className="side-bottom">
      <Avatar name={name || '?'} />
      <div className="side-user">
        <strong>{name}</strong>
        <small>{role === 'OWNER' ? 'Owner' : role === 'MEMBER' ? 'Member' : me.data?.email}</small>
      </div>
      <IconButton
        label="Sign out"
        onClick={() => {
          logout();
          void navigate({ to: '/login' });
        }}
      >
        <LogOut size={16} aria-hidden />
      </IconButton>
    </div>
  );
}
