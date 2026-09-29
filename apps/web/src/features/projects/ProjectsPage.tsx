import type { Project } from '@nexora/contracts';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { errorMessage } from '../../lib/api-client';
import { formatDate } from '../../lib/format';
import { useWorkspace } from '../workspaces/api';
import { useDeleteProject, useProjects } from './api';
import { ProjectFormDialog } from './ProjectFormDialog';
import { ProjectProgress } from './ProjectProgress';

export function ProjectsPage() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId/projects' });
  const workspace = useWorkspace(workspaceId);
  const projects = useProjects(workspaceId);
  const remove = useDeleteProject(workspaceId);
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Project | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const isOwner = workspace.data?.role === 'OWNER';

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{workspace.data?.name ?? 'Workspace'} / Projects</p>
          <h1>Projects</h1>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus size={16} aria-hidden /> New project
        </Button>
      </header>

      {projects.isPending ? (
        <div className="project-grid" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="project-card">
              <Skeleton height={20} width="60%" />
              <Skeleton height={14} />
              <Skeleton height={8} />
            </div>
          ))}
        </div>
      ) : projects.isError ? (
        <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={20} />}
          title="No projects yet"
          description="Projects group related tasks on a shared board."
          action={
            <Button variant="primary" onClick={openCreate}>
              Create your first project
            </Button>
          }
        />
      ) : (
        <ul className="project-grid">
          {projects.data.map((project) => {
            const open = project.taskCounts.TODO + project.taskCounts.IN_PROGRESS + project.taskCounts.REVIEW;
            return (
              <li key={project.id} className="project-card">
                <div className="project-card-head">
                  <h2>
                    <Link to="/app/$workspaceId/projects/$projectId" params={{ workspaceId, projectId: project.id }} className="stretched">
                      {project.name}
                    </Link>
                  </h2>
                  <div className="card-actions">
                    <IconButton
                      label={`Edit ${project.name}`}
                      onClick={() => {
                        setEditing(project);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil size={15} aria-hidden />
                    </IconButton>
                    {isOwner && (
                      <IconButton label={`Delete ${project.name}`} onClick={() => setDeleting(project)}>
                        <Trash2 size={15} aria-hidden />
                      </IconButton>
                    )}
                  </div>
                </div>
                <p className="project-description">{project.description || <span className="muted">No description</span>}</p>
                <ProjectProgress counts={project.taskCounts} />
                <div className="project-meta">
                  <span>{open} open</span>
                  <span>{project.taskCounts.IN_PROGRESS} in progress</span>
                  <span>Created {formatDate(project.createdAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ProjectFormDialog
        workspaceId={workspaceId}
        open={formOpen}
        project={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          if (!editing) void navigate({ to: '/app/$workspaceId/projects/$projectId', params: { workspaceId, projectId: saved.id } });
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Delete project?"
        message={`“${deleting?.name}” and all of its tasks will be permanently deleted.`}
        confirmLabel="Delete project"
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onClose={() => {
          setDeleting(null);
          remove.reset();
        }}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}
