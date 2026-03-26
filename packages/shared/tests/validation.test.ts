import { describe, expect, it } from 'vitest';
import { CONSTANTS } from '../src/constants';
import {
  authRegisterSchema,
  commentSchema,
  refreshSchema,
  todoSchema,
} from '../src/validation';

describe('validation schemas', () => {
  it('accepts valid todo payload', () => {
    const parsed = todoSchema.safeParse({
      title: 'Valid title',
      description: 'Description',
      status: 'open',
      priority: 'medium',
      labels: ['backend'],
      checklist: [{ id: '1', text: 'Step', completed: false }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects missing required todo fields', () => {
    const parsed = todoSchema.safeParse({
      description: 'No title',
      status: 'open',
      priority: 'medium',
    });
    expect(parsed.success).toBe(false);
  });

  it('enforces title length limit', () => {
    const parsed = todoSchema.safeParse({
      title: 'a'.repeat(CONSTANTS.MAX_TITLE_LENGTH + 1),
      status: 'open',
      priority: 'medium',
      labels: [],
      checklist: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('enforces checklist maximum size', () => {
    const checklist = Array.from({ length: CONSTANTS.MAX_CHECKLIST_ITEMS + 1 }).map((_, index) => ({
      id: `id-${index}`,
      text: `item-${index}`,
      completed: false,
    }));
    const parsed = todoSchema.safeParse({
      title: 'Task',
      status: 'open',
      priority: 'high',
      labels: [],
      checklist,
    });
    expect(parsed.success).toBe(false);
  });

  it('enforces labels maximum size', () => {
    const labels = Array.from({ length: CONSTANTS.MAX_LABELS + 1 }).map((_, idx) => `label-${idx}`);
    const parsed = todoSchema.safeParse({
      title: 'Task',
      status: 'open',
      priority: 'high',
      labels,
      checklist: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('enforces comment body limit', () => {
    const parsed = commentSchema.safeParse({
      body: 'a'.repeat(CONSTANTS.MAX_COMMENT_LENGTH + 1),
    });
    expect(parsed.success).toBe(false);
  });

  it('validates auth register schema', () => {
    const valid = authRegisterSchema.safeParse({ githubToken: 'token', inviteCode: 'A3xF9kL2mN7pQ1wR' });
    const invalid = authRegisterSchema.safeParse({ githubToken: '', inviteCode: 'short' });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('validates refresh schema', () => {
    expect(refreshSchema.safeParse({ refreshToken: 'token' }).success).toBe(true);
    expect(refreshSchema.safeParse({ refreshToken: '' }).success).toBe(false);
  });
});
