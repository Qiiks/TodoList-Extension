import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { extractTodosFromDoc } from '../../src/crdt/projection';

describe('crdt/projection', () => {
  it('maps CRDT todos to projection rows preserving order', () => {
    const doc = new Y.Doc();
    const todos = doc.getMap('todos');
    const order = doc.getArray<string>('todoOrder');

    const first = new Y.Map();
    const firstLabels = new Y.Array<string>();
    firstLabels.push(['bug']);
    first.set('id', 'todo-1');
    first.set('title', 'First');
    first.set('status', 'open');
    first.set('priority', 'high');
    first.set('createdBy', 'alice');
    first.set('labels', firstLabels);

    const second = new Y.Map();
    const secondLabels = new Y.Array<string>();
    secondLabels.push(['frontend']);
    second.set('id', 'todo-2');
    second.set('title', 'Second');
    second.set('status', 'completed');
    second.set('priority', 'low');
    second.set('createdBy', 'bob');
    second.set('labels', secondLabels);

    todos.set('todo-1', first);
    todos.set('todo-2', second);
    order.push(['todo-2', 'todo-1']);

    const projected = extractTodosFromDoc('owner/repo', doc);
    expect(projected).toHaveLength(2);
    expect(projected[0].id).toBe('todo-2');
    expect(projected[0].position).toBe(0);
    expect(projected[1].id).toBe('todo-1');
    expect(projected[1].position).toBe(1);
    expect(projected[1].labels).toEqual(['bug']);
  });
});
