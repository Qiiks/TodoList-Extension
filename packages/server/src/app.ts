import fastify from 'fastify';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStore, type TeamTodoStore } from './store';
import { registerAuthRoutes } from './routes/auth';
import { registerCommentRoutes } from './routes/comments';
import { registerActivityRoutes } from './routes/activity';
import { registerAdminRoutes } from './routes/admin';

export interface AppContext {
  app: ReturnType<typeof fastify>;
  store: TeamTodoStore;
}

export function createApp(store = createStore()): AppContext {
  const app = fastify({ logger: true });
  const webDistDir = path.resolve(process.cwd(), 'packages/web/dist');

  const resolveContentType = (filePath: string): string => {
    if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
    if (filePath.endsWith('.svg')) return 'image/svg+xml';
    if (filePath.endsWith('.png')) return 'image/png';
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
    if (filePath.endsWith('.ico')) return 'image/x-icon';
    return 'text/html; charset=utf-8';
  };

  const tryReadFile = async (targetPath: string): Promise<Buffer | null> => {
    try {
      await access(targetPath);
      return await readFile(targetPath);
    } catch {
      return null;
    }
  };

  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/', async (_request, reply) => reply.redirect('/app'));

  app.get('/assets/*', async (request, reply) => {
    const wildcard = (request.params as { '*': string })['*'] || '';
    const safeRelativePath = wildcard.replace(/^\/+/, '');
    const filePath = path.resolve(webDistDir, 'assets', safeRelativePath);
    if (!filePath.startsWith(path.resolve(webDistDir, 'assets'))) {
      return reply.status(400).send({ error: 'Invalid asset path' });
    }
    const data = await tryReadFile(filePath);
    if (!data) {
      return reply.status(404).send({ error: 'Asset not found' });
    }
    reply.type(resolveContentType(filePath));
    return data;
  });

  app.get('/app', async (_request, reply) => {
    const indexPath = path.resolve(webDistDir, 'index.html');
    const data = await tryReadFile(indexPath);
    if (!data) {
      return reply
        .status(503)
        .type('text/plain; charset=utf-8')
        .send('Web app build not found. Build packages/web before starting server.');
    }
    reply.type('text/html; charset=utf-8');
    return data;
  });

  app.get('/app/*', async (_request, reply) => {
    const indexPath = path.resolve(webDistDir, 'index.html');
    const data = await tryReadFile(indexPath);
    if (!data) {
      return reply
        .status(503)
        .type('text/plain; charset=utf-8')
        .send('Web app build not found. Build packages/web before starting server.');
    }
    reply.type('text/html; charset=utf-8');
    return data;
  });

  registerAuthRoutes(app, store);
  registerCommentRoutes(app, store);
  registerActivityRoutes(app, store);
  registerAdminRoutes(app, store);

  return { app, store };
}
