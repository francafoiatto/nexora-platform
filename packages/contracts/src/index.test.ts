import { describe, expect, it } from 'vitest';
import { createTaskSchema } from './index';
describe('contracts', () => { it('validates a task payload', () => { expect(createTaskSchema.parse({ title: 'Ship it' }).status).toBe('TODO'); }); });
