import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers';
import { issueAccessToken } from '../../src/auth/jwt';

describe('routes/comments', () => {
  const { app, store, userToken } = createTestApp();
  let secondUserToken = '';

  beforeEach(async () => {
    await app.ready();
    store.comments = [];
    store.activity = [];
    store.users = [
      { id: 'normal-user', githubId: 2, githubLogin: 'developer' },
      { id: 'user-2', githubId: 3, githubLogin: 'other-dev' },
    ];
    secondUserToken = issueAccessToken({ userId: 'user-2', githubUsername: 'other-dev' });
  });

  it('creates and lists comments', async () => {
    const create = await request(app.server)
      .post('/api/repos/owner%2Frepo/todos/todo-1/comments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ body: 'comment text' });

    expect(create.status).toBe(201);
    expect(create.body.body).toBe('comment text');

    const list = await request(app.server)
      .get('/api/repos/owner%2Frepo/todos/todo-1/comments')
      .set('Authorization', `Bearer ${userToken}`);
    expect(list.status).toBe(200);
    expect(list.body.comments).toHaveLength(1);
    expect(store.activity[0].action).toBe('comment_added');
  });

  it('updates and deletes own comment', async () => {
    const create = await request(app.server)
      .post('/api/repos/owner%2Frepo/todos/todo-1/comments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ body: 'original' });
    const commentId = create.body.id;

    const update = await request(app.server)
      .put(`/api/comments/${commentId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ body: 'updated' });

    expect(update.status).toBe(200);
    expect(update.body.body).toBe('updated');

    const remove = await request(app.server)
      .delete(`/api/comments/${commentId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(remove.status).toBe(200);
    expect(store.comments).toHaveLength(0);
  });

  it('blocks editing/deleting comments by another user', async () => {
    const create = await request(app.server)
      .post('/api/repos/owner%2Frepo/todos/todo-1/comments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ body: 'original' });
    const commentId = create.body.id;

    const update = await request(app.server)
      .put(`/api/comments/${commentId}`)
      .set('Authorization', `Bearer ${secondUserToken}`)
      .send({ body: 'illegal' });
    expect(update.status).toBe(403);

    const remove = await request(app.server)
      .delete(`/api/comments/${commentId}`)
      .set('Authorization', `Bearer ${secondUserToken}`);
    expect(remove.status).toBe(403);
  });
});
