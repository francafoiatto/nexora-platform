import { type Priority, PRIORITY_LABELS } from '@nexora/contracts';
import { initials } from '../../lib/format';

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority priority-${priority.toLowerCase()}`}>{PRIORITY_LABELS[priority]}</span>;
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span className={`avatar avatar-${size}`} title={name} aria-hidden>
      {initials(name)}
    </span>
  );
}
