import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addTodo, reorderTodo, toggleTodo } from '../../src/sync/document';

describe('sync/document CRDT operations', () => {
  it('adds todo to doc and order list', () => {
    const doc = new Y.Doc();
    addTodo(doc, { id: 't1', title: 'One', createdBy: 'alice' });

    const todo = doc.getMap('todos').get('t1') as Y.Map<unknown>;
    const order = doc.getArray<string>('todoOrder').toArray();
    expect(todo.get('title')).toBe('One');
    expect(order).toEqual(['t1']);
  });

  it('toggles completion state', () => {
    const doc = new Y.Doc();
    addTodo(doc, { id: 't1', title: 'One', createdBy: 'alice' });
    expect(toggleTodo(doc, 't1')).toBe(true);
    const todo = doc.getMap('todos').get('t1') as Y.Map<unknown>;
    expect(todo.get('status')).toBe('completed');
  });

  it('reorders todos', () => {
    const doc = new Y.Doc();
    addTodo(doc, { id: 't1', title: 'One', createdBy: 'alice' });
    addTodo(doc, { id: 't2', title: 'Two', createdBy: 'alice' });
    const result = reorderTodo(doc, 0, 1);
    expect(result).toBe(true);
    expect(doc.getArray<string>('todoOrder').toArray()).toEqual(['t2', 't1']);
  });
});
