import { createServer } from 'http';
import { WebSocketServer, type RawData } from 'ws';
import { verifyAccessToken } from '../auth/jwt';
import { PresenceTracker } from './presence';

export interface WsServerControls {
  server: ReturnType<typeof createServer>;
  wss: WebSocketServer;
  close: () => Promise<void>;
}

export function startWsServer(port: number, presence = new PresenceTracker()): Promise<WsServerControls> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token');
      const repoId = url.pathname.replace(/^\/ws\//, '') || 'default/repo';
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        const decoded = verifyAccessToken(token) as {
          userId: string;
          githubUsername: string;
          githubAvatarUrl?: string;
        };

        wss.handleUpgrade(request, socket, head, (ws) => {
          (ws as any).repoId = repoId;
          (ws as any).user = decoded;
          wss.emit('connection', ws, request);
        });
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    });

    wss.on('connection', (ws) => {
      const repoId = (ws as any).repoId as string;
      const user = (ws as any).user as { userId: string; githubUsername: string; githubAvatarUrl?: string };
      presence.add(repoId, {
        userId: user.userId,
        username: user.githubUsername,
        avatar: user.githubAvatarUrl,
      });

      const presenceMessage = JSON.stringify({ type: 'presence', users: presence.list(repoId) });
      for (const client of wss.clients) {
        if ((client as any).repoId === repoId && client.readyState === client.OPEN) {
          client.send(presenceMessage);
        }
      }

      ws.on('message', (payload: RawData) => {
        for (const client of wss.clients) {
          if (client !== ws && (client as any).repoId === repoId && client.readyState === client.OPEN) {
            client.send(payload.toString());
          }
        }
      });

      ws.on('close', () => {
        presence.removeWithGrace(repoId, user.userId);
      });
    });

    server.listen(port, () => {
      resolve({
        server,
        wss,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            wss.close((wssErr) => {
              if (wssErr) {
                closeReject(wssErr);
                return;
              }
              server.close((serverErr) => {
                if (serverErr) {
                  closeReject(serverErr);
                  return;
                }
                closeResolve();
              });
            });
          }),
      });
    });

    server.on('error', (error) => {
      reject(error);
    });
  });
}
