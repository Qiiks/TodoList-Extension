import type { FastifyInstance } from 'fastify';
import { authRegisterSchema, refreshSchema } from '@teamtodo/shared';
import { validateGithubToken } from '../auth/github';
import {
  hashRefreshToken,
  issueAccessToken,
  issueRefreshToken,
} from '../auth/jwt';
import type { TeamTodoStore } from '../store';
import type { AuthenticatedRequest } from '../auth/middleware';
import { requireAuth } from '../auth/middleware';

export function registerAuthRoutes(app: FastifyInstance, store: TeamTodoStore) {
  app.post('/api/auth/register', async (request, reply) => {
    const parsed = authRegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid auth payload' });
    }

    const invite = store.findInvite(parsed.data.inviteCode);
    if (!invite || !invite.isActive || invite.currentUses >= invite.maxUses) {
      return reply.status(403).send({ error: 'Invalid invite code' });
    }

    const githubUser = await validateGithubToken(parsed.data.githubToken);
    const user = store.findOrCreateUser(githubUser);
    invite.currentUses += 1;

    const jwt = issueAccessToken({
      userId: user.id,
      githubUsername: user.githubLogin,
      githubAvatarUrl: user.avatarUrl,
    });
    const refreshToken = issueRefreshToken();
    store.addRefreshToken({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    return {
      jwt,
      refreshToken,
      user: {
        id: user.id,
        login: user.githubLogin,
        avatarUrl: user.avatarUrl,
      },
    };
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid refresh payload' });
    }

    const tokenHash = hashRefreshToken(parsed.data.refreshToken);
    const existing = store.consumeRefreshToken(tokenHash);
    if (!existing || existing.expiresAt < Date.now()) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    const user = store.users.find((item) => item.id === existing.userId);
    if (!user) {
      return reply.status(401).send({ error: 'Unknown user' });
    }

    const jwt = issueAccessToken({
      userId: user.id,
      githubUsername: user.githubLogin,
      githubAvatarUrl: user.avatarUrl,
    });
    const refreshToken = issueRefreshToken();
    store.addRefreshToken({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    return { jwt, refreshToken };
  });

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    store.removeRefreshTokensForUser(request.user.userId);
    return { ok: true };
  });
}
