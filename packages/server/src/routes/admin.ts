import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { inviteSchema } from '@teamtodo/shared';
import { requireAdmin } from '../auth/middleware';
import type { TeamTodoStore } from '../store';

function createInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(16);
  let code = '';
  for (let i = 0; i < 16; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export function registerAdminRoutes(app: FastifyInstance, store: TeamTodoStore) {
  app.get('/api/admin/users', { preHandler: requireAdmin }, async () => {
    return { users: store.users };
  });

  app.delete('/api/admin/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const initialLength = store.users.length;
    store.users = store.users.filter((user) => user.id !== id);
    if (store.users.length === initialLength) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return { ok: true };
  });

  app.get('/api/admin/invites', { preHandler: requireAdmin }, async () => {
    return { invites: store.invites };
  });

  app.post('/api/admin/invites', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = inviteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid invite payload' });
    }

    const invite = store.seedInvite(createInviteCode(), parsed.data.maxUses);
    if (parsed.data.expiresAt) {
      invite.expiresAt = parsed.data.expiresAt;
    }
    return reply.status(201).send(invite);
  });

  app.delete('/api/admin/invites/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invite = store.invites.find((item) => item.id === id);
    if (!invite) {
      return reply.status(404).send({ error: 'Invite not found' });
    }
    invite.isActive = false;
    return { ok: true };
  });

  app.get('/api/admin/repos', { preHandler: requireAdmin }, async () => {
    const repos = new Set<string>();
    for (const record of store.activity) {
      repos.add(record.repoId);
    }
    return { repos: [...repos] };
  });
}
