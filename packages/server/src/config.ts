import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use',
  dbUrl: process.env.DATABASE_URL || 'postgresql://teamtodo:password@localhost:5432/teamtodo',
  adminGithub: process.env.ADMIN_GITHUB_USERNAME || 'admin',
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  githubOauthRedirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI || '',
  webAppUrl: process.env.WEB_APP_URL || '',
};
