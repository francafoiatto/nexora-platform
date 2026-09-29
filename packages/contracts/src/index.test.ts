import { describe, expect, it } from 'vitest';
import { loginSchema, projectSchema, registerSchema, taskSchema, TASK_STATUS_LABELS, TASK_STATUSES, workspaceSchema } from './index';

const validTask = { title: 'Ship it', description: '', status: 'TODO', priority: 'MEDIUM', assigneeId: '', dueDate: '' } as const;

describe('form schemas', () => {
  it('normalizes login email', () => {
    expect(loginSchema.parse({ email: '  Demo@Nexora.LOCAL ', password: 'x' }).email).toBe('demo@nexora.local');
  });

  it('rejects short register passwords with a readable message', () => {
    const result = registerSchema.safeParse({ name: 'Ana', email: 'ana@example.com', password: 'short' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Password must be at least 8 characters');
  });

  it('enforces workspace and project name limits', () => {
    expect(workspaceSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(workspaceSchema.safeParse({ name: 'Acme' }).success).toBe(true);
    expect(projectSchema.safeParse({ name: 'x'.repeat(121), description: '' }).success).toBe(false);
  });

  it('accepts an unassigned task without due date', () => {
    expect(taskSchema.parse(validTask).title).toBe('Ship it');
  });

  it('rejects blank titles, bad assignee ids and malformed dates', () => {
    expect(taskSchema.safeParse({ ...validTask, title: '   ' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, assigneeId: 'not-a-uuid' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, dueDate: '15/10/2026' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...validTask, dueDate: '2026-10-15' }).success).toBe(true);
  });

  it('labels every status', () => {
    expect(Object.keys(TASK_STATUS_LABELS)).toEqual([...TASK_STATUSES]);
  });
});
