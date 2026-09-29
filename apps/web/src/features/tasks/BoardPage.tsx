import { type Task, TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from '@nexora/contracts';
import { Link, useParams } from '@tanstack/react-router';
import { Pencil, Plus } from 'lucide-react';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { ApiError, errorMessage } from '../../lib/api-client';
import { useProject } from '../projects/api';
import { ProjectFormDialog } from '../projects/ProjectFormDialog';
import { useWorkspace } from '../workspaces/api';
import { useCreateTask, useMoveTask, useTasks } from './api';
import { TaskCard } from './TaskCard';
import { TaskFormDialog } from './TaskFormDialog';

type DialogState = { mode: 'closed' } | { mode: 'create'; status: TaskStatus } | { mode: 'edit'; taskId: string };

export function BoardPage() {
  const { workspaceId, projectId } = useParams({ from: '/app/$workspaceId/projects/$projectId' });
  const workspace = useWorkspace(workspaceId);
  const project = useProject(projectId);
  const tasks = useTasks(projectId);
  const move = useMoveTask(workspaceId, projectId);
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });
  const [editingProject, setEditingProject] = useState(false);

  const columns = useMemo(() => {
    const byStatus: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], REVIEW: [], DONE: [] };
    for (const task of tasks.data ?? []) byStatus[task.status].push(task);
    return byStatus;
  }, [tasks.data]);

  const openTask = useCallback((task: Task) => setDialog({ mode: 'edit', taskId: task.id }), []);
  const moveTask = useCallback((task: Task, status: TaskStatus) => move.mutate({ taskId: task.id, status }), [move]);
  // Read the task from the cache so realtime updates show up in an open dialog.
  const editingTask = dialog.mode === 'edit' ? (tasks.data?.find((t) => t.id === dialog.taskId) ?? null) : null;

  if (project.isError) {
    const notFound = project.error instanceof ApiError && project.error.status === 404;
    return notFound ? (
      <EmptyState
        title="Project not found"
        description="It may have been deleted."
        action={
          <Link to="/app/$workspaceId/projects" params={{ workspaceId }} className="btn btn-primary btn-md">
            Back to projects
          </Link>
        }
      />
    ) : (
      <ErrorState error={project.error} onRetry={() => void project.refetch()} />
    );
  }

  return (
    <div className="page page-board">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/app/$workspaceId/projects" params={{ workspaceId }}>
              {workspace.data?.name ?? 'Workspace'} / Projects
            </Link>
          </p>
          <div className="title-row">
            <h1>{project.data?.name ?? 'Loading…'}</h1>
            {project.data && (
              <IconButton label="Edit project" onClick={() => setEditingProject(true)}>
                <Pencil size={15} aria-hidden />
              </IconButton>
            )}
          </div>
          {project.data?.description && <p className="muted page-subtitle">{project.data.description}</p>}
        </div>
        <Button variant="primary" onClick={() => setDialog({ mode: 'create', status: 'TODO' })}>
          <Plus size={16} aria-hidden /> New task
        </Button>
      </header>

      <QuickAdd workspaceId={workspaceId} projectId={projectId} />
      {move.isError && (
        <div className="form-error" role="alert">
          Couldn’t move the task: {errorMessage(move.error)}
        </div>
      )}

      {tasks.isPending ? (
        <LoadingState label="Loading board…" />
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : (
        <div className="board" role="list" aria-label="Task board">
          {TASK_STATUSES.map((status) => (
            <section key={status} className="column" role="listitem" aria-labelledby={`col-${status}`} data-status={status}>
              <div className="column-head">
                <h2 id={`col-${status}`}>{TASK_STATUS_LABELS[status]}</h2>
                <span className="count" aria-label={`${columns[status].length} tasks`}>
                  {columns[status].length}
                </span>
                <IconButton label={`Add task to ${TASK_STATUS_LABELS[status]}`} onClick={() => setDialog({ mode: 'create', status })}>
                  <Plus size={15} aria-hidden />
                </IconButton>
              </div>
              <div className="cards">
                {columns[status].map((task) => (
                  <TaskCard key={task.id} task={task} onOpen={openTask} onMove={moveTask} />
                ))}
                {columns[status].length === 0 && <div className="column-empty">No tasks</div>}
              </div>
            </section>
          ))}
        </div>
      )}

      <TaskFormDialog
        workspaceId={workspaceId}
        projectId={projectId}
        open={dialog.mode !== 'closed' && (dialog.mode === 'create' || !!editingTask)}
        task={editingTask}
        defaultStatus={dialog.mode === 'create' ? dialog.status : 'TODO'}
        onClose={() => setDialog({ mode: 'closed' })}
      />
      {project.data && (
        <ProjectFormDialog workspaceId={workspaceId} open={editingProject} project={project.data} onClose={() => setEditingProject(false)} />
      )}
    </div>
  );
}

function QuickAdd({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const create = useCreateTask(workspaceId, projectId);
  const [title, setTitle] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    create.mutate({ title: value }, { onSuccess: () => setTitle('') });
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      <Plus size={16} aria-hidden />
      <label htmlFor="quick-add" className="sr-only">
        Quick add a task to To do
      </label>
      <input id="quick-add" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="Quick add a task… (press Enter)" />
      {create.isError && (
        <span className="field-error" role="alert">
          {errorMessage(create.error)}
        </span>
      )}
      <Button type="submit" size="sm" loading={create.isPending} disabled={!title.trim()}>
        Add
      </Button>
    </form>
  );
}
