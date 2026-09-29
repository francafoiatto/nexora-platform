import { zodResolver } from '@hookform/resolvers/zod';
import { type AddMemberInput, addMemberSchema, type WorkspaceInput, workspaceSchema } from '@nexora/contracts';
import { useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Avatar } from '../../components/ui/Badges';
import { Button } from '../../components/ui/Button';
import { FormError, TextField } from '../../components/ui/Field';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { applyServerErrors } from '../../lib/forms';
import { useAddMember, useMembers, useUpdateWorkspace, useWorkspace } from './api';

export function SettingsPage() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId/settings' });
  const workspace = useWorkspace(workspaceId);
  const isOwner = workspace.data?.role === 'OWNER';

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{workspace.data?.name ?? 'Workspace'} / Settings</p>
          <h1>Workspace settings</h1>
        </div>
      </header>
      <div className="settings-grid">
        <section className="panel" aria-labelledby="general-title">
          <h2 id="general-title" className="panel-title">
            General
          </h2>
          {workspace.data &&
            (isOwner ? (
              <RenameForm workspaceId={workspaceId} name={workspace.data.name} />
            ) : (
              <p className="muted">Only workspace owners can rename the workspace.</p>
            ))}
        </section>
        <MembersPanel workspaceId={workspaceId} isOwner={isOwner} />
      </div>
    </div>
  );
}

function RenameForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const update = useUpdateWorkspace(workspaceId);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<WorkspaceInput>({ resolver: zodResolver(workspaceSchema), defaultValues: { name } });

  useEffect(() => reset({ name }), [name, reset]);

  const onSubmit = handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: () => setSaved(true),
      onError: (error) => applyServerErrors(error, setError, ['name']),
    }),
  );

  return (
    <form className="form" onSubmit={onSubmit} noValidate onChange={() => setSaved(false)}>
      <TextField label="Workspace name" error={errors.name?.message} {...register('name')} />
      <FormError message={errors.root?.server?.message} />
      <div className="form-row">
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!isDirty}>
          Save
        </Button>
        {saved && (
          <span className="muted" role="status">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

function MembersPanel({ workspaceId, isOwner }: { workspaceId: string; isOwner: boolean }) {
  const members = useMembers(workspaceId);
  const add = useAddMember(workspaceId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AddMemberInput>({ resolver: zodResolver(addMemberSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit((values) =>
    add.mutate(values, {
      onSuccess: () => reset({ email: '' }),
      onError: (error) => applyServerErrors(error, setError, ['email']),
    }),
  );

  return (
    <section className="panel" aria-labelledby="members-title">
      <h2 id="members-title" className="panel-title">
        Members
      </h2>
      {isOwner && (
        <form className="form member-form" onSubmit={onSubmit} noValidate>
          <TextField
            label="Add a teammate by email"
            type="email"
            placeholder="teammate@company.com"
            hint="They need an existing Nexora account."
            error={errors.email?.message}
            {...register('email')}
          />
          <FormError message={errors.root?.server?.message} />
          <Button type="submit" loading={add.isPending}>
            Add member
          </Button>
        </form>
      )}
      {members.isPending ? (
        <LoadingState />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <ul className="member-list">
          {members.data.map((member) => (
            <li key={member.id}>
              <Avatar name={member.name} />
              <div>
                <strong>{member.name}</strong>
                <small className="muted">{member.email}</small>
              </div>
              <span className={`role role-${member.role.toLowerCase()}`}>{member.role === 'OWNER' ? 'Owner' : 'Member'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
