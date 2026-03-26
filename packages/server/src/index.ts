import fastify from 'fastify';
import { WebSocketServer } from 'ws';
import { config } from './config';
import { db } from './db/client';
import { signJwt } from './auth/jwt';
import { setupPersistence } from './crdt/persistence';
// @ts-ignore
import { setupWSConnection } from 'y-websocket/bin/utils';
import { createApp } from './app';

const { app } = createApp();

const start = async () => {
  setupPersistence();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    const wss = new WebSocketServer({ server: app.server });
    
    wss.on('connection', (ws, req) => {
      // Parse repoId from url, e.g. /ws/owner/repo
      const docName = req.url?.replace(/^\/ws\//, '') || 'default/repo';
      
      // setupWSConnection handles the y-websocket sync protocol automatically
      setupWSConnection(ws, req, { docName });
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
