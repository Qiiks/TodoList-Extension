import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../helpers';

describe('routes/auth', () => {
  const { app, store, userToken } = createTestApp();

  beforeEach(async () => {
    store.users = [];
    store.invites = [];
    store.refreshTokens = [];
    store.seedInvite('A3xF9kL2mN7pQ1wR', 2);
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers with valid invite and github token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 22, login: 'alice', avatar_url: 'https://avatar' }),
      }),
    );

    const response = await request(app.server).post('/api/auth/register').send({
      githubToken: 'gho_valid',
      inviteCode: 'A3xF9kL2mN7pQ1wR',
    });

    expect(response.status).toBe(200);
    expect(response.body.jwt).toBeTypeOf('string');
    expect(response.body.refreshToken).toBeTypeOf('string');
    expect(store.users).toHaveLength(1);
  });

  it('refreshes access token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 22, login: 'alice', avatar_url: 'https://avatar' }),
      }),
    );
    const register = await request(app.server).post('/api/auth/register').send({
      githubToken: 'gho_valid',
      inviteCode: 'A3xF9kL2mN7pQ1wR',
    });
    expect(register.status).toBe(200);

    const refresh = await request(app.server).post('/api/auth/refresh').send({
      refreshToken: register.body.refreshToken,
    });
    expect(refresh.status).toBe(200);
    expect(refresh.body.jwt).toBeTypeOf('string');
  });

  it('logs out and clears refresh tokens for user', async () => {
    store.users.push({ id: 'normal-user', githubId: 2, githubLogin: 'developer' });
    store.refreshTokens.push({ userId: 'normal-user', tokenHash: 'hash', expiresAt: Date.now() + 10000 });
    const response = await request(app.server)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect(response.status).toBe(200);
    expect(store.refreshTokens).toHaveLength(0);
  });
});
