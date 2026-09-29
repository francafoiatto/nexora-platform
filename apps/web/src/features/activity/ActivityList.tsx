import { type Activity, TASK_STATUS_LABELS, type TaskStatus } from '@nexora/contracts';
import { Avatar } from '../../components/ui/Badges';
import { formatDateTime, timeAgo } from '../../lib/format';

const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  description: 'description',
  priority: 'priority',
  assigneeId: 'assignee',
  dueDate: 'due date',
  name: 'name',
};

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const statusLabel = (value: unknown) => TASK_STATUS_LABELS[value as TaskStatus] ?? str(value);

/** Human-readable sentence for an activity entry. Uses denormalized metadata so deleted entities stay legible. */
export function describeActivity(activity: Activity): { verb: string; subject: string; detail?: string } {
  const meta = activity.metadata ?? {};
  const title = str(meta.title);
  const name = str(meta.name);
  switch (activity.action) {
    case 'workspace.created':
      return { verb: 'created the workspace', subject: name };
    case 'workspace.updated':
      return { verb: 'renamed the workspace to', subject: name, detail: meta.from ? `from ${str(meta.from)}` : undefined };
    case 'member.added':
      return { verb: 'added', subject: name, detail: 'to the workspace' };
    case 'project.created':
      return { verb: 'created project', subject: name };
    case 'project.updated': {
      const changes = Array.isArray(meta.changes) ? meta.changes.map((c) => FIELD_LABELS[String(c)] ?? String(c)).join(', ') : '';
      return { verb: 'updated project', subject: name, detail: changes ? `changed ${changes}` : undefined };
    }
    case 'project.deleted':
      return { verb: 'deleted project', subject: name };
    case 'task.created':
      return { verb: 'created', subject: title, detail: meta.projectName ? `in ${str(meta.projectName)}` : undefined };
    case 'task.status_changed':
      return { verb: 'moved', subject: title, detail: `${statusLabel(meta.from)} → ${statusLabel(meta.to)}` };
    case 'task.updated': {
      const changes = Array.isArray(meta.changes) ? meta.changes.map((c) => FIELD_LABELS[String(c)] ?? String(c)).join(', ') : '';
      return { verb: 'updated', subject: title, detail: changes ? `changed ${changes}` : undefined };
    }
    case 'task.deleted':
      return { verb: 'deleted', subject: title };
    default:
      return { verb: activity.action, subject: title || name };
  }
}

export function ActivityItem({ activity }: { activity: Activity }) {
  const { verb, subject, detail } = describeActivity(activity);
  return (
    <li className="activity-item">
      <Avatar name={activity.actor.name} size="sm" />
      <div className="activity-text">
        <p>
          <strong>{activity.actor.name}</strong> {verb} {subject && <span className="activity-subject">{subject}</span>}
          {detail && <span className="muted"> · {detail}</span>}
        </p>
        <time dateTime={activity.createdAt} title={formatDateTime(activity.createdAt)}>
          {timeAgo(activity.createdAt)}
        </time>
      </div>
    </li>
  );
}

export function ActivityList({ items }: { items: Activity[] }) {
  return (
    <ol className="activity-list">
      {items.map((activity) => (
        <ActivityItem key={activity.id} activity={activity} />
      ))}
    </ol>
  );
}
