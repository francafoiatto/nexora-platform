import { z } from 'zod';

/* ------------------------------------------------------------------ enums */

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const WORKSPACE_ROLES = ['OWNER', 'MEMBER'] as const;

export const TaskStatus = z.enum(TASK_STATUSES);
export const Priority = z.enum(PRIORITIES);
export type TaskStatus = z.infer<typeof TaskStatus>;
export type Priority = z.infer<typeof Priority>;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  REVIEW: 'Review',
  DONE: 'Done',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

/* ----------------------------------------------------------- form schemas
 * Client-side validation for UX. Limits mirror the API DTOs, which remain authoritative. */

const email = z.string().trim().toLowerCase().min(1, 'Email is required').email('Enter a valid email address');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const workspaceSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be at most 80 characters'),
});
export type WorkspaceInput = z.infer<typeof workspaceSchema>;

export const addMemberSchema = z.object({ email });
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const projectSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name must be at most 120 characters'),
  description: z.string().trim().max(500, 'Description must be at most 500 characters'),
});
export type ProjectInput = z.infer<typeof projectSchema>;

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(160, 'Title must be at most 160 characters'),
  description: z.string().trim().max(5000, 'Description is too long'),
  status: TaskStatus,
  priority: Priority,
  /** Empty string means unassigned (HTML select value). */
  assigneeId: z.union([z.literal(''), z.string().uuid()]),
  /** yyyy-mm-dd from <input type="date">, or empty. */
  dueDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')]),
});
export type TaskInput = z.infer<typeof taskSchema>;

/* ------------------------------------------------------------ API types */

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  projectCount: number;
  memberCount: number;
  createdAt: string;
}

export interface Member extends User {
  role: WorkspaceRole;
}

export type TaskCounts = Record<TaskStatus, number>;

export interface WorkspaceSummary {
  projects: number;
  members: number;
  tasksByStatus: TaskCounts;
  openTasks: number;
  overdueTasks: number;
  assignedToMe: number;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  taskCounts: TaskCounts;
}

export interface TaskUser {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  assignee: TaskUser | null;
  createdBy: TaskUser;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  workspaceId: string;
  entityType: 'WORKSPACE' | 'MEMBER' | 'PROJECT' | 'TASK';
  entityId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: TaskUser;
}

export interface ActivityPage {
  items: Activity[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details: { field?: string; message: string }[];
  requestId?: string;
}

/* ------------------------------------------------------ realtime events */

export interface RealtimeEvents {
  'task.created': { workspaceId: string; projectId: string; task: Task };
  'task.updated': { workspaceId: string; projectId: string; task: Task };
  'task.deleted': { workspaceId: string; projectId: string; taskId: string };
  'project.created': { workspaceId: string; project: Project };
  'project.updated': { workspaceId: string; project: Project };
  'project.deleted': { workspaceId: string; projectId: string };
  'activity.created': { workspaceId: string; activity: Activity };
}

export type JoinAck = { ok: true } | { ok: false; code: 'VALIDATION_ERROR' | 'NOT_FOUND' };
