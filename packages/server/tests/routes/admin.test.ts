import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers';

describe('routes/admin', () => {
  const { app, store, adminToken, userToken } = createTestApp();

  beforeEach(async () => {
    await app.ready();
    store.users = [{ id: 'u-1', githubId: 7, githubLogin: 'dev1' }];
    store.invites = [];
  });

  it('blocks non-admin access', async () => {
    const response = await request(app.server)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${userToken}`);
    expect(response.status).toBe(403);
  });

  it('allows admin invite CRUD', async () => {
    const create = await request(app.server)
      .post('/api/admin/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maxUses: 3 });
    expect(create.status).toBe(201);
    expect(create.body.code).toHaveLength(16);

    const list = await request(app.server)
      .get('/api/admin/invites')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.invites).toHaveLength(1);

    const deactivate = await request(app.server)
      .delete(`/api/admin/invites/${create.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deactivate.status).toBe(200);
    expect(store.invites[0].isActive).toBe(false);
  });
});
