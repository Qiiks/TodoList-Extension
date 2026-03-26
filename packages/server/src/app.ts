import fastify from 'fastify';
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
  const app = fastify({ logger: false });

  registerAuthRoutes(app, store);
  registerCommentRoutes(app, store);
  registerActivityRoutes(app, store);
  registerAdminRoutes(app, store);

  return { app, store };
}
