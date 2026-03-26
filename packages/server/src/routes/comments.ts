import type { FastifyInstance } from 'fastify';
import { commentSchema } from '@teamtodo/shared';
import type { TeamTodoStore } from '../store';
import type { AuthenticatedRequest } from '../auth/middleware';
import { requireAuth } from '../auth/middleware';

export function registerCommentRoutes(app: FastifyInstance, store: TeamTodoStore) {
  app.get('/api/repos/:repo/todos/:todoId/comments', { preHandler: requireAuth }, async (request) => {
    const req = request as AuthenticatedRequest;
    const { repo, todoId } = req.params as { repo: string; todoId: string };
    return { comments: store.listComments(repo, todoId) };
  });

  app.post('/api/repos/:repo/todos/:todoId/comments', { preHandler: requireAuth }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success || !req.user) {
      return reply.status(400).send({ error: 'Invalid comment payload' });
    }
    const { repo, todoId } = req.params as { repo: string; todoId: string };
    const created = store.addComment({
      repoId: repo,
      todoId,
      author: req.user.githubUsername,
      body: parsed.data.body,
    });
    store.addActivity({
      repoId: repo,
      actor: req.user.githubUsername,
      action: 'comment_added',
      todoId,
      metadata: { commentId: created.id },
    });
    return reply.status(201).send(created);
  });

  app.put('/api/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success || !req.user) {
      return reply.status(400).send({ error: 'Invalid comment payload' });
    }
    const { commentId } = req.params as { commentId: string };
    const updated = store.updateComment(commentId, req.user.githubUsername, parsed.data.body);
    if (!updated) {
      return reply.status(403).send({ error: 'Not allowed to edit comment' });
    }
    return updated;
  });

  app.delete('/api/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    if (!req.user) {
      return reply.status(401).send({ error: 'Invalid token' });
    }
    const { commentId } = req.params as { commentId: string };
    const deleted = store.deleteComment(commentId, req.user.githubUsername);
    if (!deleted) {
      return reply.status(403).send({ error: 'Not allowed to delete comment' });
    }
    return { ok: true };
  });
}
