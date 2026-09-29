import type { Activity } from '@nexora/contracts';
import { useParams } from '@tanstack/react-router';
import { Activity as ActivityIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { LOCALE } from '../../lib/format';
import { useWorkspace } from '../workspaces/api';
import { useActivities } from './api';
import { ActivityList } from './ActivityList';

const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });

function groupByDay(items: Activity[]) {
  const groups: { key: string; label: string; items: Activity[] }[] = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = date.toDateString();
    const label = key === today ? 'Today' : key === yesterday ? 'Yesterday' : dayFormat.format(date);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label, items: [item] });
  }
  return groups;
}

export function ActivityPage() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId/activity' });
  const workspace = useWorkspace(workspaceId);
  const activities = useActivities(workspaceId);
  const items = activities.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{workspace.data?.name ?? 'Workspace'} / Activity</p>
          <h1>Activity</h1>
          <p className="muted page-subtitle">Everything that changed in this workspace, as it happens.</p>
        </div>
      </header>

      {activities.isPending ? (
        <LoadingState label="Loading activity…" />
      ) : activities.isError ? (
        <ErrorState error={activities.error} onRetry={() => void activities.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<ActivityIcon size={20} />} title="No activity yet" description="Changes to projects and tasks will appear here." />
      ) : (
        <div className="panel activity-feed">
          {groupByDay(items).map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="activity-day">{group.label}</h2>
              <ActivityList items={group.items} />
            </section>
          ))}
          {activities.hasNextPage && (
            <div className="load-more">
              <Button onClick={() => void activities.fetchNextPage()} loading={activities.isFetchingNextPage}>
                Load older activity
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
