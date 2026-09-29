import { zodResolver } from '@hookform/resolvers/zod';
import { type Member, PRIORITIES, PRIORITY_LABELS, type Task, TASK_STATUS_LABELS, TASK_STATUSES, type TaskInput, taskSchema, type TaskStatus } from '@nexora/contracts';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { FormError, SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { LoadingState } from '../../components/ui/States';
import { errorMessage } from '../../lib/api-client';
import { formatDateTime, toDateInput } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { useMembers } from '../workspaces/api';
import { type TaskPayload, useCreateTask, useDeleteTask, useUpdateTask } from './api';

interface Props {
  workspaceId: string;
  projectId: string;
  open: boolean;
  /** Existing task to edit; omitted when creating. */
  task?: Task | null;
  defaultStatus?: TaskStatus;
  onClose: () => void;
}

const FIELDS = ['title', 'description', 'status', 'priority', 'assigneeId', 'dueDate'] as const;

function toPayload(values: TaskInput): TaskPayload {
  return {
    title: values.title,
    description: values.description || null,
    status: values.status,
    priority: values.priority,
    assigneeId: values.assigneeId || null,
    dueDate: values.dueDate || null,
  };
}

export function TaskFormDialog({ workspaceId, projectId, open, task, defaultStatus = 'TODO', onClose }: Props) {
  const remove = useDeleteTask(workspaceId, projectId);
  const members = useMembers(workspaceId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <Dialog open={open && !confirmDelete} onClose={onClose} title={task ? 'Edit task' : 'New task'}>
        {/* Mounted per session with its initial values, so fast typing is never overwritten. It waits for the
            member list so the (uncontrolled) assignee select can show the current assignee. */}
        {members.isPending ? (
          <LoadingState />
        ) : (
          <TaskForm
            workspaceId={workspaceId}
            projectId={projectId}
            members={members.data ?? []}
            task={task ?? null}
            defaultStatus={defaultStatus}
            onDone={onClose}
            onRequestDelete={() => setConfirmDelete(true)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={open && confirmDelete}
        title="Delete task?"
        message={`“${task?.title}” will be permanently deleted.`}
        confirmLabel="Delete task"
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onClose={() => {
          setConfirmDelete(false);
          remove.reset();
        }}
        onConfirm={() =>
          task &&
          remove.mutate(task.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            },
          })
        }
      />
    </>
  );
}

interface TaskFormProps {
  workspaceId: string;
  members: Member[];
  projectId: string;
  task: Task | null;
  defaultStatus: TaskStatus;
  onDone: () => void;
  onRequestDelete: () => void;
}

function TaskForm({ workspaceId, projectId, members, task, defaultStatus, onDone, onRequestDelete }: TaskFormProps) {
  const create = useCreateTask(workspaceId, projectId);
  const update = useUpdateTask(workspaceId, projectId);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? defaultStatus,
      priority: task?.priority ?? 'MEDIUM',
      assigneeId: task?.assigneeId ?? '',
      dueDate: toDateInput(task?.dueDate ?? null),
    },
  });

  const onSubmit = handleSubmit((values) => {
    const handlers = { onSuccess: onDone, onError: (error: unknown) => applyServerErrors(error, setError, FIELDS) };
    if (task) {
      if (!isDirty) return onDone();
      update.mutate({ taskId: task.id, input: toPayload(values) }, handlers);
    } else {
      create.mutate(toPayload(values), handlers);
    }
  });

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <TextField label="Title" autoFocus placeholder="What needs to happen?" error={errors.title?.message} {...register('title')} />
      <TextAreaField label="Description" rows={4} placeholder="Add context, links or acceptance criteria" error={errors.description?.message} {...register('description')} />
      <div className="form-grid">
        <SelectField label="Status" error={errors.status?.message} {...register('status')}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Priority" error={errors.priority?.message} {...register('priority')}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Assignee" error={errors.assigneeId?.message} {...register('assigneeId')}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          {/* Keep a former member visible so opening the dialog never silently changes the assignee. */}
          {task?.assignee && !members.some((m) => m.id === task.assigneeId) && (
            <option value={task.assignee.id}>{task.assignee.name}</option>
          )}
        </SelectField>
        <TextField label="Due date" type="date" error={errors.dueDate?.message} {...register('dueDate')} />
      </div>
      {task && (
        <p className="form-meta muted">
          Created by {task.createdBy.name} · {formatDateTime(task.createdAt)}
        </p>
      )}
      <FormError message={errors.root?.server?.message} />
      <div className="dialog-actions">
        {task && (
          <Button variant="ghost" className="danger-text push-left" onClick={onRequestDelete}>
            <Trash2 size={15} aria-hidden /> Delete
          </Button>
        )}
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={create.isPending || update.isPending}>
          {task ? 'Save changes' : 'Create task'}
        </Button>
      </div>
    </form>
  );
}
