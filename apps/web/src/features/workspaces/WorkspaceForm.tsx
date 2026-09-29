import { zodResolver } from '@hookform/resolvers/zod';
import { type Workspace, type WorkspaceInput, workspaceSchema } from '@nexora/contracts';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { FormError, TextField } from '../../components/ui/Field';
import { applyServerErrors } from '../../lib/forms';
import { useCreateWorkspace } from './api';

export function CreateWorkspaceForm({ onCreated, onCancel, submitLabel = 'Create workspace' }: { onCreated: (w: Workspace) => void; onCancel?: () => void; submitLabel?: string }) {
  const create = useCreateWorkspace();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<WorkspaceInput>({ resolver: zodResolver(workspaceSchema), defaultValues: { name: '' } });

  const onSubmit = handleSubmit((values) =>
    create.mutate(values, { onSuccess: onCreated, onError: (error) => applyServerErrors(error, setError, ['name']) }),
  );

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <TextField label="Workspace name" placeholder="e.g. Acme Operations" autoFocus error={errors.name?.message} {...register('name')} />
      <FormError message={errors.root?.server?.message} />
      <div className="dialog-actions">
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={create.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function CreateWorkspaceDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (w: Workspace) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="New workspace" description="Workspaces keep projects, tasks and teammates separate.">
      <CreateWorkspaceForm onCancel={onClose} onCreated={onCreated} />
    </Dialog>
  );
}
