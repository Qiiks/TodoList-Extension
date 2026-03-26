import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers';

describe('routes/activity', () => {
  const { app, store, userToken } = createTestApp();

  beforeEach(async () => {
    await app.ready();
    store.activity = [];
    for (let i = 0; i < 30; i += 1) {
      store.addActivity({
        repoId: 'owner/repo',
        actor: 'dev',
        action: 'todo_created',
        todoId: `todo-${i}`,
      });
    }
  });

  it('returns paginated activity list', async () => {
    const response = await request(app.server)
      .get('/api/repos/owner%2Frepo/activity?offset=5&limit=10')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(10);
    expect(response.body.pagination.offset).toBe(5);
    expect(response.body.pagination.limit).toBe(10);
  });
});
