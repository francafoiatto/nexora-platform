import { zodResolver } from '@hookform/resolvers/zod';
import { type Project, type ProjectInput, projectSchema } from '@nexora/contracts';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { FormError, TextAreaField, TextField } from '../../components/ui/Field';
import { applyServerErrors } from '../../lib/forms';
import { useCreateProject, useUpdateProject } from './api';

interface Props {
  workspaceId: string;
  open: boolean;
  project?: Project | null;
  onClose: () => void;
  onSaved?: (project: Project) => void;
}

export function ProjectFormDialog({ workspaceId, open, project, onClose, onSaved }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'}>
      {/* Mounted per session with its initial values (no effect-driven reset that could overwrite typing). */}
      <ProjectForm workspaceId={workspaceId} project={project ?? null} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

function ProjectForm({ workspaceId, project, onClose, onSaved }: Omit<Props, 'open' | 'project'> & { project: Project | null }) {
  const create = useCreateProject(workspaceId);
  const update = useUpdateProject(workspaceId);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: project?.name ?? '', description: project?.description ?? '' },
  });

  const onSubmit = handleSubmit((values) => {
    const input = { name: values.name, description: values.description || null };
    const handlers = {
      onSuccess: (saved: Project) => {
        onSaved?.(saved);
        onClose();
      },
      onError: (error: unknown) => applyServerErrors(error, setError, ['name', 'description']),
    };
    if (project) update.mutate({ projectId: project.id, input }, handlers);
    else create.mutate(input, handlers);
  });

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <TextField label="Project name" placeholder="e.g. Platform launch" error={errors.name?.message} {...register('name')} />
      <TextAreaField label="Description" rows={3} placeholder="What is this project about?" error={errors.description?.message} {...register('description')} />
      <FormError message={errors.root?.server?.message} />
      <div className="dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={create.isPending || update.isPending}>
          {project ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </form>
  );
}
