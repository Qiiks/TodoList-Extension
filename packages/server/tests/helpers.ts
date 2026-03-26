import { createApp } from '../src/app';
import { issueAccessToken } from '../src/auth/jwt';

export function createTestApp() {
  const { app, store } = createApp();
  const adminToken = issueAccessToken({
    userId: 'admin-user',
    githubUsername: process.env.ADMIN_GITHUB_USERNAME || 'admin',
    githubAvatarUrl: null,
  });
  const userToken = issueAccessToken({
    userId: 'normal-user',
    githubUsername: 'developer',
    githubAvatarUrl: null,
  });
  return { app, store, adminToken, userToken };
}
