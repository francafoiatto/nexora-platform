import type { Activity } from '@nexora/contracts';
import { describe, expect, it } from 'vitest';
import { describeActivity } from '../features/activity/ActivityList';
import { formatDueDate, initials, isOverdue, timeAgo, toDateInput } from './format';
import { shouldRetry } from './query';
import { ApiError } from './api-client';

describe('format helpers', () => {
  it('formats due dates as calendar dates regardless of timezone', () => {
    expect(formatDueDate('2026-10-01T00:00:00.000Z')).toBe('Oct 1');
    expect(toDateInput('2026-10-01T00:00:00.000Z')).toBe('2026-10-01');
    expect(toDateInput(null)).toBe('');
  });

  it('flags overdue open tasks only', () => {
    const now = new Date(2026, 8, 29, 12);
    expect(isOverdue('2026-09-28T00:00:00.000Z', 'TODO', now)).toBe(true);
    expect(isOverdue('2026-09-29T00:00:00.000Z', 'TODO', now)).toBe(false);
    expect(isOverdue('2026-09-28T00:00:00.000Z', 'DONE', now)).toBe(false);
    expect(isOverdue(null, 'TODO', now)).toBe(false);
  });

  it('renders relative times in English', () => {
    const now = Date.parse('2026-09-29T12:00:00.000Z');
    expect(timeAgo('2026-09-29T11:59:50.000Z', now)).toBe('just now');
    expect(timeAgo('2026-09-29T09:00:00.000Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-09-28T12:00:00.000Z', now)).toBe('yesterday');
  });

  it('builds initials', () => {
    expect(initials('Alex Morgan')).toBe('AM');
    expect(initials('Cher')).toBe('CH');
    expect(initials('Ana Maria de Souza')).toBe('AS');
  });
});

describe('describeActivity', () => {
  const base = { id: '1', workspaceId: 'w', entityType: 'TASK', entityId: 't', createdAt: '', actor: { id: 'u', name: 'Priya' } } as const;
  const make = (action: string, metadata: Record<string, unknown>): Activity => ({ ...base, action, metadata });

  it('describes status moves with labels', () => {
    expect(describeActivity(make('task.status_changed', { title: 'Ship', from: 'TODO', to: 'IN_PROGRESS' }))).toEqual({
      verb: 'moved',
      subject: 'Ship',
      detail: 'To do → In progress',
    });
  });

  it('lists changed fields in plain words', () => {
    expect(describeActivity(make('task.updated', { title: 'Ship', changes: ['assigneeId', 'dueDate'] })).detail).toBe('changed assignee, due date');
  });

  it('keeps deleted entities legible from metadata', () => {
    expect(describeActivity(make('project.deleted', { name: 'Old project' }))).toEqual({ verb: 'deleted project', subject: 'Old project' });
  });
});

describe('query retry policy', () => {
  it('never retries client errors and retries transient failures twice', () => {
    expect(shouldRetry(0, new ApiError(404, 'NOT_FOUND', 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(500, 'INTERNAL_ERROR', 'x'))).toBe(true);
    expect(shouldRetry(2, new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(false);
  });
});
