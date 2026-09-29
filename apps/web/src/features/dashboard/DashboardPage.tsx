import { TASK_STATUS_LABELS, TASK_STATUSES, type WorkspaceSummary } from '@nexora/contracts';
import { Link, useParams } from '@tanstack/react-router';
import { Activity as ActivityIcon, ArrowRight, FolderKanban } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { greeting } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useActivities } from '../activity/api';
import { ActivityList } from '../activity/ActivityList';
import { useProjects } from '../projects/api';
import { ProjectProgress } from '../projects/ProjectProgress';
import { useWorkspace, useWorkspaceSummary } from '../workspaces/api';

export function DashboardPage() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId/' });
  const user = useSession()?.user;
  const workspace = useWorkspace(workspaceId);
  const summary = useWorkspaceSummary(workspaceId);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{workspace.data?.name ?? 'Workspace'} / Overview</p>
          <h1>
            {greeting()}
            {user ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
        </div>
      </header>

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <Metrics summary={summary.data} />
      )}

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="dist-title">
          <h2 id="dist-title" className="panel-title">
            Work by status
          </h2>
          {summary.data ? <StatusDistribution summary={summary.data} /> : <Skeleton height={60} />}
        </section>
        <RecentActivity workspaceId={workspaceId} />
        <ProjectsOverview workspaceId={workspaceId} />
      </div>
    </div>
  );
}

function Metrics({ summary }: { summary?: WorkspaceSummary }) {
  const items = [
    { label: 'Projects', value: summary?.projects, note: 'In this workspace' },
    { label: 'Open tasks', value: summary?.openTasks, note: 'Not done yet' },
    { label: 'In progress', value: summary?.tasksByStatus.IN_PROGRESS, note: 'Active now' },
    { label: 'Overdue', value: summary?.overdueTasks, note: 'Past due date', tone: summary?.overdueTasks ? 'danger' : undefined },
    { label: 'Assigned to me', value: summary?.assignedToMe, note: 'Open tasks' },
  ];
  return (
    <section className="metrics" aria-label="Workspace metrics">
      {items.map((item) => (
        <div key={item.label} className={`metric ${item.tone ? `metric-${item.tone}` : ''}`}>
          <span>{item.label}</span>
          <strong>{item.value ?? <Skeleton height={28} width={40} />}</strong>
          <small>{item.note}</small>
        </div>
      ))}
    </section>
  );
}

function StatusDistribution({ summary }: { summary: WorkspaceSummary }) {
  const total = TASK_STATUSES.reduce((sum, s) => sum + summary.tasksByStatus[s], 0);
  if (total === 0) return <p className="muted">No tasks yet. Create a project and add tasks to see progress here.</p>;
  return (
    <div>
      <div className="dist-bar" role="img" aria-label={TASK_STATUSES.map((s) => `${TASK_STATUS_LABELS[s]}: ${summary.tasksByStatus[s]}`).join(', ')}>
        {TASK_STATUSES.map((s) =>
          summary.tasksByStatus[s] ? <span key={s} className={`dist-${s.toLowerCase()}`} style={{ flexGrow: summary.tasksByStatus[s] }} /> : null,
        )}
      </div>
      <ul className="dist-legend">
        {TASK_STATUSES.map((s) => (
          <li key={s}>
            <span className={`swatch dist-${s.toLowerCase()}`} aria-hidden />
            {TASK_STATUS_LABELS[s]}
            <strong>{summary.tasksByStatus[s]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentActivity({ workspaceId }: { workspaceId: string }) {
  const activities = useActivities(workspaceId);
  const items = activities.data?.pages[0]?.items.slice(0, 6) ?? [];
  return (
    <section className="panel panel-activity" aria-labelledby="recent-title">
      <div className="panel-head">
        <h2 id="recent-title" className="panel-title">
          Recent activity
        </h2>
        <Link to="/app/$workspaceId/activity" params={{ workspaceId }} className="link">
          View all <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
      {activities.isPending ? (
        <Skeleton height={120} />
      ) : activities.isError ? (
        <ErrorState error={activities.error} onRetry={() => void activities.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<ActivityIcon size={18} />} title="No activity yet" />
      ) : (
        <ActivityList items={items} />
      )}
    </section>
  );
}

function ProjectsOverview({ workspaceId }: { workspaceId: string }) {
  const projects = useProjects(workspaceId);
  return (
    <section className="panel panel-projects" aria-labelledby="projects-title">
      <div className="panel-head">
        <h2 id="projects-title" className="panel-title">
          Projects
        </h2>
        <Link to="/app/$workspaceId/projects" params={{ workspaceId }} className="link">
          All projects <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
      {projects.isPending ? (
        <Skeleton height={120} />
      ) : projects.isError ? (
        <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={18} />}
          title="No projects yet"
          action={
            <Link to="/app/$workspaceId/projects" params={{ workspaceId }} className="btn btn-primary btn-sm">
              Create a project
            </Link>
          }
        />
      ) : (
        <ul className="project-rows">
          {projects.data.slice(0, 5).map((project) => (
            <li key={project.id}>
              <Link to="/app/$workspaceId/projects/$projectId" params={{ workspaceId, projectId: project.id }}>
                <span className="project-row-name">{project.name}</span>
                <ProjectProgress counts={project.taskCounts} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
