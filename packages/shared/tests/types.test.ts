import { describe, expect, it } from 'vitest';
import { ACTIVITY_ACTIONS, type ActivityAction, type Todo } from '../src/types';

describe('types', () => {
  it('contains all expected activity actions', () => {
    const expected: ActivityAction[] = [
      'todo_created',
      'todo_completed',
      'todo_reopened',
      'todo_deleted',
      'todo_restored',
      'todo_edited',
      'todo_assigned',
      'todo_reordered',
      'checklist_item_added',
      'checklist_item_completed',
      'comment_added',
      'label_added',
      'label_removed',
      'priority_changed',
    ];
    expect(ACTIVITY_ACTIONS).toEqual(expected);
  });

  it('supports valid Todo shape at runtime', () => {
    const todo: Todo = {
      id: 'todo-1',
      title: 'Implement tests',
      description: 'Write unit tests',
      status: 'open',
      priority: 'high',
      createdBy: 'dev1',
      completedBy: null,
      assignedTo: null,
      labels: ['testing'],
      checklist: [{ id: 'c1', text: 'Add assertions', completed: false }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    };
    expect(todo.status).toBe('open');
    expect(todo.checklist[0].completed).toBe(false);
  });
});
