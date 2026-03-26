import WebSocket from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { issueAccessToken } from '../../src/auth/jwt';
import { startWsServer } from '../../src/ws/handler';

describe('ws/handler', () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await server.close();
      }
    }
  });

  it('rejects websocket with invalid JWT', async () => {
    const server = await startWsServer(0);
    servers.push(server);
    const address = server.server.address();
    const port = typeof address === 'string' ? 0 : address?.port;

    const result = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/owner/repo?token=bad-token`);
      ws.on('open', () => resolve(false));
      ws.on('error', () => resolve(true));
    });

    expect(result).toBe(true);
  });

  it('accepts websocket lifecycle with valid JWT', async () => {
    const server = await startWsServer(0);
    servers.push(server);
    const address = server.server.address();
    const port = typeof address === 'string' ? 0 : address?.port;

    const token = issueAccessToken({ userId: 'u-1', githubUsername: 'alice' });
    const received = await new Promise<string>((resolve, reject) => {
      const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws/owner/repo?token=${token}`);
      const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws/owner/repo?token=${token}`);

      ws2.on('message', (payload) => {
        const text = payload.toString();
        if (text === 'hello') {
          resolve(text);
          ws1.close();
          ws2.close();
        }
      });

      ws1.on('open', () => {
        ws1.send('hello');
      });

      ws1.on('error', reject);
      ws2.on('error', reject);
    });

    expect(received).toBe('hello');
  });
});
