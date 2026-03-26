import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from './jwt';
import { config } from '../config';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    userId: string;
    githubUsername: string;
    githubAvatarUrl?: string | null;
  };
}

export async function requireAuth(request: AuthenticatedRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or invalid authorization header' });
    return;
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = verifyAccessToken(token) as AuthenticatedRequest['user'];
    request.user = decoded;
  } catch {
    reply.status(401).send({ error: 'Invalid token' });
  }
}

export async function requireAdmin(request: AuthenticatedRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) {
    return;
  }

  if (request.user?.githubUsername !== config.adminGithub) {
    reply.status(403).send({ error: 'Admin access required' });
  }
}
