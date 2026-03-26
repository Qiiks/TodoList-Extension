import type { FastifyInstance } from 'fastify';
import { authRegisterSchema, refreshSchema } from '@teamtodo/shared';
import jwt from 'jsonwebtoken';
import { exchangeGithubOauthCode, validateGithubToken } from '../auth/github';
import {
  hashRefreshToken,
  issueAccessToken,
  issueRefreshToken,
} from '../auth/jwt';
import { config } from '../config';
import type { TeamTodoStore } from '../store';
import type { AuthenticatedRequest } from '../auth/middleware';
import { requireAuth } from '../auth/middleware';

interface OAuthStatePayload {
  inviteCode: string;
}

function buildWebAppUrl(path: string): string {
  const base = config.webAppUrl.trim();
  if (!base) {
    return path;
  }
  return `${base.replace(/\/$/, '')}${path}`;
}

function issueOauthStateToken(inviteCode: string): string {
  const payload: OAuthStatePayload = { inviteCode };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '10m' });
}

function verifyOauthStateToken(state: string): OAuthStatePayload {
  const decoded = jwt.verify(state, config.jwtSecret) as OAuthStatePayload;
  if (!decoded?.inviteCode || decoded.inviteCode.length !== 16) {
    throw new Error('Invalid OAuth state');
  }
  return decoded;
}

async function issueSessionFromGithubToken(store: TeamTodoStore, githubToken: string, inviteCode: string) {
  const invite = store.findInvite(inviteCode);
  if (!invite || !invite.isActive || invite.currentUses >= invite.maxUses) {
    return { error: 'Invalid invite code' as const };
  }

  const githubUser = await validateGithubToken(githubToken);
  const user = store.findOrCreateUser(githubUser);
  invite.currentUses += 1;

  const accessToken = issueAccessToken({
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
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      login: user.githubLogin,
      avatarUrl: user.avatarUrl,
      isAdmin: user.githubLogin === config.adminGithub,
    },
  };
}

export function registerAuthRoutes(app: FastifyInstance, store: TeamTodoStore) {
  app.post('/api/auth/register', async (request, reply) => {
    const parsed = authRegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid auth payload' });
    }

    const session = await issueSessionFromGithubToken(store, parsed.data.githubToken, parsed.data.inviteCode);
    if ('error' in session) {
      return reply.status(403).send({ error: session.error });
    }

    return {
      jwt: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    };
  });

  app.get('/api/auth/github/start', async (request, reply) => {
    const { inviteCode = '' } = (request.query as { inviteCode?: string }) || {};
    const trimmedInvite = inviteCode.trim();
    if (trimmedInvite.length !== 16) {
      return reply.status(400).send({ error: 'inviteCode query param must be 16 characters' });
    }
    if (!config.githubClientId || !config.githubOauthRedirectUri) {
      return reply.status(500).send({ error: 'GitHub OAuth is not configured on the server' });
    }

    const state = issueOauthStateToken(trimmedInvite);
    const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
    authorizeUrl.searchParams.set('client_id', config.githubClientId);
    authorizeUrl.searchParams.set('redirect_uri', config.githubOauthRedirectUri);
    authorizeUrl.searchParams.set('scope', 'read:user');
    authorizeUrl.searchParams.set('state', state);

    return reply.redirect(authorizeUrl.toString());
  });

  app.get('/api/auth/github/callback', async (request, reply) => {
    const { code = '', state = '' } = (request.query as { code?: string; state?: string }) || {};
    if (!code || !state) {
      return reply.status(400).send({ error: 'Missing code or state query parameter' });
    }

    try {
      const parsedState = verifyOauthStateToken(state);
      const githubToken = await exchangeGithubOauthCode(code);
      const session = await issueSessionFromGithubToken(store, githubToken, parsedState.inviteCode);
      if ('error' in session) {
        return reply.redirect(buildWebAppUrl(`/app?authError=${encodeURIComponent(session.error ?? 'invalid_invite')}`));
      }

      const target = buildWebAppUrl(`/app?jwt=${encodeURIComponent(session.accessToken)}&refreshToken=${encodeURIComponent(
        session.refreshToken,
      )}`);
      return reply.redirect(target);
    } catch (error) {
      app.log.warn({ error }, 'GitHub OAuth callback failed');
      return reply.redirect(buildWebAppUrl('/app?authError=github_oauth_failed'));
    }
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Invalid token' });
    }
    const user = store.users.find((item) => item.id === request.user!.userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return {
      user: {
        id: user.id,
        login: user.githubLogin,
        avatarUrl: user.avatarUrl,
        isAdmin: user.githubLogin === config.adminGithub,
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
