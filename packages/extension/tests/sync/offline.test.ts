import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

const fsStore = new Map<string, Uint8Array>();

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { path: string }, file: string) => ({ path: `${base.path}/${file}` }),
  },
  workspace: {
    fs: {
      createDirectory: vi.fn(async () => undefined),
      readFile: vi.fn(async (uri: { path: string }) => {
        const value = fsStore.get(uri.path);
        if (!value) {
          throw new Error('not found');
        }
        return value;
      }),
      writeFile: vi.fn(async (uri: { path: string }, content: Uint8Array) => {
        fsStore.set(uri.path, content);
      }),
    },
  },
}));

import { loadOfflineDoc } from '../../src/sync/offline';

describe('sync/offline', () => {
  beforeEach(() => {
    fsStore.clear();
  });

  it('writes and reloads .yjs document from globalStorageUri', async () => {
    const globalStorageUri = { path: '/storage' } as any;
    const doc = await loadOfflineDoc(globalStorageUri, 'owner/repo');
    doc.getMap('todos').set('todo-1', new Y.Map([['id', 'todo-1'], ['title', 'offline']])) ;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const reloaded = await loadOfflineDoc(globalStorageUri, 'owner/repo');
    const todo = reloaded.getMap('todos').get('todo-1') as Y.Map<unknown>;
    expect(todo.get('title')).toBe('offline');
  });
});
