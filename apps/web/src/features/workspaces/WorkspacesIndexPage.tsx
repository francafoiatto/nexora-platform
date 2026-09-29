import { useNavigate } from '@tanstack/react-router';
import { Logo } from '../../components/layout/Logo';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useRedirectOnce } from '../../lib/use-redirect';
import { useSession } from '../../lib/session';
import { useWorkspaces } from './api';
import { lastWorkspace } from './last-workspace';
import { CreateWorkspaceForm } from './WorkspaceForm';

/** /app — sends the user to their last (or first) workspace, or onboards them into a new one. */
export function WorkspacesIndexPage() {
  const workspaces = useWorkspaces();
  const navigate = useNavigate();
  const user = useSession()?.user;

  const list = workspaces.data ?? [];
  const remembered = lastWorkspace.get();
  const target = list.find((w) => w.id === remembered) ?? list[0];
  useRedirectOnce(!!target, () => ({ to: '/app/$workspaceId', params: { workspaceId: target!.id }, replace: true }));

  if (workspaces.isPending || target) return <LoadingState label="Loading your workspaces…" />;
  if (workspaces.isError) return <ErrorState error={workspaces.error} onRetry={() => void workspaces.refetch()} />;

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="onboarding-title">
        <Logo />
        <p className="eyebrow">Get started</p>
        <h1 id="onboarding-title">Create your first workspace</h1>
        <p className="muted">
          {user ? `Welcome, ${user.name.split(' ')[0]}. ` : ''}A workspace holds your team’s projects, tasks and activity.
        </p>
        <CreateWorkspaceForm onCreated={(w) => void navigate({ to: '/app/$workspaceId', params: { workspaceId: w.id } })} />
      </section>
    </main>
  );
}
