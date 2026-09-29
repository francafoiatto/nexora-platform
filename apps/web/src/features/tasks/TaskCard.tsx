import { type Task, TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from '@nexora/contracts';
import { CalendarDays } from 'lucide-react';
import { memo } from 'react';
import { Avatar, PriorityBadge } from '../../components/ui/Badges';
import { formatDueDate, isOverdue } from '../../lib/format';

interface Props {
  task: Task;
  onOpen: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}

export const TaskCard = memo(function TaskCard({ task, onOpen, onMove }: Props) {
  const overdue = isOverdue(task.dueDate, task.status);
  return (
    <article className="task-card" data-testid="task-card" aria-label={task.title}>
      <div className="task-card-top">
        <PriorityBadge priority={task.priority} />
        {task.dueDate && (
          <span className={`due ${overdue ? 'due-overdue' : ''}`}>
            <CalendarDays size={12} aria-hidden />
            <span className="sr-only">{overdue ? 'Overdue, due' : 'Due'} </span>
            {formatDueDate(task.dueDate)}
          </span>
        )}
      </div>
      <h3>
        <button type="button" className="task-open stretched" onClick={() => onOpen(task)}>
          {task.title}
        </button>
      </h3>
      <div className="card-foot">
        {task.assignee ? (
          <span className="assignee">
            <Avatar name={task.assignee.name} size="sm" />
            <span className="sr-only">Assigned to {task.assignee.name}</span>
          </span>
        ) : (
          <span className="assignee unassigned" title="Unassigned">
            <span className="sr-only">Unassigned</span>
          </span>
        )}
        <label className="sr-only" htmlFor={`status-${task.id}`}>
          Status of {task.title}
        </label>
        <select id={`status-${task.id}`} className="status-select" value={task.status} onChange={(e) => onMove(task, e.target.value as TaskStatus)}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
});
