import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

describe('crdt/persistence encode decode merge', () => {
  it('encodes and decodes full state', () => {
    const doc = new Y.Doc();
    const todos = doc.getMap('todos');
    const todo = new Y.Map();
    todo.set('id', 'todo-1');
    todo.set('title', 'Persist me');
    todos.set('todo-1', todo);

    const update = Y.encodeStateAsUpdate(doc);
    const loaded = new Y.Doc();
    Y.applyUpdate(loaded, update);

    const loadedTodo = loaded.getMap('todos').get('todo-1') as Y.Map<unknown>;
    expect(loadedTodo.get('title')).toBe('Persist me');
  });

  it('merges concurrent updates', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    doc1.getMap('todos').set('todo-1', new Y.Map([['id', 'todo-1'], ['title', 'A']]));
    const update1 = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update1);

    const t2 = doc2.getMap('todos').get('todo-1') as Y.Map<unknown>;
    t2.set('priority', 'high');

    const update2 = Y.encodeStateAsUpdate(doc2);
    Y.applyUpdate(doc1, update2);

    const merged = doc1.getMap('todos').get('todo-1') as Y.Map<unknown>;
    expect(merged.get('title')).toBe('A');
    expect(merged.get('priority')).toBe('high');
  });

  it('simulates DB upsert payload as bytea-compatible buffer', () => {
    const doc = new Y.Doc();
    doc.getMap('todos').set('todo-2', new Y.Map([['id', 'todo-2'], ['title', 'DB sync']]));

    const stateVector = Buffer.from(Y.encodeStateVector(doc));
    const snapshot = Buffer.from(Y.encodeStateAsUpdate(doc));

    expect(Buffer.isBuffer(stateVector)).toBe(true);
    expect(Buffer.isBuffer(snapshot)).toBe(true);
    expect(snapshot.length).toBeGreaterThan(0);
  });
});
