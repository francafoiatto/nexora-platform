import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '../../lib/api-client';
import { Button } from './Button';
import { Spinner } from './Spinner';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <Spinner size={20} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="state state-error" role="alert">
      <AlertTriangle size={20} aria-hidden />
      <strong>{title}</strong>
      <span className="muted">{errorMessage(error)}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="state state-empty">
      {icon && <div className="state-icon">{icon}</div>}
      <strong>{title}</strong>
      {description && <span className="muted">{description}</span>}
      {action}
    </div>
  );
}

/** Loading placeholder that keeps layout stable. */
export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <span className="skeleton" style={{ height, width }} aria-hidden />;
}
