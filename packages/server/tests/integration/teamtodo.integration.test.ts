import request from 'supertest';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createApp } from '../../src/app';
import { issueAccessToken } from '../../src/auth/jwt';
import { PresenceTracker } from '../../src/ws/presence';
import { startWsServer } from '../../src/ws/handler';

describe('server integration scenarios', () => {
  const { app, store } = createApp();
  let wsControls: Awaited<ReturnType<typeof startWsServer>>;
  let wsPort = 0;

  beforeAll(async () => {
    await app.ready();
    wsControls = await startWsServer(0, new PresenceTracker());
    const address = wsControls.server.address();
    wsPort = typeof address === 'string' ? 0 : (address?.port ?? 0);
  });

  afterAll(async () => {
    await wsControls.close();
    await app.close();
  });

  it('two yjs docs merge updates (sync semantic)', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.getMap('todos').set('t1', new Y.Map([['id', 't1'], ['title', 'A']]));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const bTodo = b.getMap('todos').get('t1') as Y.Map<unknown>;
    bTodo.set('priority', 'high');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    const merged = a.getMap('todos').get('t1') as Y.Map<unknown>;
    expect(merged.get('priority')).toBe('high');
  });

  it('offline edits merge on reconnect', () => {
    const serverDoc = new Y.Doc();
    const offlineDoc = new Y.Doc();

    serverDoc.getMap('todos').set('t1', new Y.Map([['id', 't1'], ['title', 'Server title']]));
    Y.applyUpdate(offlineDoc, Y.encodeStateAsUpdate(serverDoc));

    const todo = offlineDoc.getMap('todos').get('t1') as Y.Map<unknown>;
    todo.set('description', 'edited offline');

    Y.applyUpdate(serverDoc, Y.encodeStateAsUpdate(offlineDoc));
    const merged = serverDoc.getMap('todos').get('t1') as Y.Map<unknown>;
    expect(merged.get('description')).toBe('edited offline');
  });

  it('full auth flow invite -> github -> jwt -> websocket', async () => {
    store.invites = [];
    store.seedInvite('A3xF9kL2mN7pQ1wR', 1);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 100, login: 'integrator' }),
      }),
    );

    const register = await request(app.server).post('/api/auth/register').send({
      githubToken: 'gho_valid',
      inviteCode: 'A3xF9kL2mN7pQ1wR',
    });
    expect(register.status).toBe(200);

    const token = register.body.jwt as string;
    const open = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/owner/repo?token=${token}`);
      ws.on('open', () => {
        resolve(true);
        ws.close();
      });
      ws.on('error', () => resolve(false));
    });
    expect(open).toBe(true);
  });

  it('presence broadcasts to multiple clients', async () => {
    const token = issueAccessToken({ userId: 'u-presence', githubUsername: 'presence-user' });
    const message = await new Promise<string>((resolve, reject) => {
      const ws1 = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/owner/repo?token=${token}`);
      const ws2 = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/owner/repo?token=${token}`);

      ws2.on('message', (payload) => {
        const text = payload.toString();
        if (text.includes('"type":"presence"')) {
          resolve(text);
          ws1.close();
          ws2.close();
        }
      });

      ws1.on('error', reject);
      ws2.on('error', reject);
    });

    expect(message).toContain('presence');
  });

  it('comments endpoint writes activity pipeline', async () => {
    const token = issueAccessToken({ userId: 'normal-user', githubUsername: 'developer' });
    const create = await request(app.server)
      .post('/api/repos/owner%2Frepo/todos/todo-42/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'pipeline check' });

    expect(create.status).toBe(201);
    expect(store.activity.some((item) => item.action === 'comment_added' && item.todoId === 'todo-42')).toBe(true);
  });
});
