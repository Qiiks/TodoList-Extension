import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/middleware';
import type { TeamTodoStore } from '../store';

export function registerActivityRoutes(app: FastifyInstance, store: TeamTodoStore) {
  app.get('/api/repos/:repo/activity', { preHandler: requireAuth }, async (request) => {
    const { repo } = request.params as { repo: string };
    const { limit = '20', offset = '0' } = (request.query as { limit?: string; offset?: string }) || {};
    const parsedLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
    const parsedOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
    const activity = store.listActivity(repo, parsedOffset, parsedLimit);
    return {
      items: activity,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
      },
    };
  });
}
