import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware';
import type { TeamTodoStore } from '../store';
import { db } from '../db/client';
import { todosProjection } from '../db/schema';

function toMarkdown(rows: Array<{
  title: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  labels: unknown;
  description: string | null;
}>): string {
  const lines: string[] = ['# TeamTodo Export', ''];

  for (const todo of rows) {
    const checked = todo.status === 'completed' ? 'x' : ' ';
    lines.push(`- [${checked}] ${todo.title}`);
    lines.push(`  - Priority: ${todo.priority}`);
    if (todo.assignedTo) {
      lines.push(`  - Assignee: ${todo.assignedTo}`);
    }
    const labels = Array.isArray(todo.labels) ? todo.labels.filter((v): v is string => typeof v === 'string') : [];
    if (labels.length > 0) {
      lines.push(`  - Labels: ${labels.join(', ')}`);
    }
    if (todo.description) {
      lines.push('', `  ${todo.description}`, '');
    }
  }

  lines.push('', `Exported at: ${new Date().toISOString()}`);
  return lines.join('\n');
}

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

  app.get('/api/repos/:repo/export/markdown', { preHandler: requireAuth }, async (request, reply) => {
    const { repo } = request.params as { repo: string };
    let rows: Array<{
      title: string;
      status: string;
      priority: string;
      assignedTo: string | null;
      labels: unknown;
      description: string | null;
    }> = [];

    try {
      rows = await db
        .select({
          title: todosProjection.title,
          status: todosProjection.status,
          priority: todosProjection.priority,
          assignedTo: todosProjection.assignedTo,
          labels: todosProjection.labels,
          description: todosProjection.description,
        })
        .from(todosProjection)
        .where(eq(todosProjection.repoId, repo))
        .orderBy(asc(todosProjection.position));
    } catch (error) {
      app.log.error({ error, repo }, 'failed to query todos projection for markdown export');
    }

    const markdown = toMarkdown(rows);
    reply
      .type('text/markdown; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${repo.replaceAll('/', '_')}.md"`);
    return markdown;
  });
}
