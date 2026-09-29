import type { TaskCounts } from '@nexora/contracts';

export function ProjectProgress({ counts }: { counts: TaskCounts }) {
  const total = counts.TODO + counts.IN_PROGRESS + counts.REVIEW + counts.DONE;
  const percent = total === 0 ? 0 : Math.round((counts.DONE / total) * 100);
  return (
    <span className="progress" aria-label={`${counts.DONE} of ${total} tasks done`}>
      <span className="progress-track" aria-hidden>
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="progress-label">
        {counts.DONE}/{total}
      </span>
    </span>
  );
}
