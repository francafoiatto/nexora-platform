import { PRIORITIES, TASK_STATUSES, WORKSPACE_ROLES } from '@nexora/contracts';
import { Priority, TaskStatus, WorkspaceRole } from '@prisma/client';

/** Guards against drift between the database enums and the shared client contracts. */
describe('contracts ↔ Prisma parity', () => {
  it('task statuses match', () => expect([...TASK_STATUSES]).toEqual(Object.values(TaskStatus)));
  it('priorities match', () => expect([...PRIORITIES]).toEqual(Object.values(Priority)));
  it('workspace roles match', () => expect([...WORKSPACE_ROLES]).toEqual(Object.values(WorkspaceRole)));
});
