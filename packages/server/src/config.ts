import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use',
  dbUrl: process.env.DATABASE_URL || 'postgresql://teamtodo:password@localhost:5432/teamtodo',
  adminGithub: process.env.ADMIN_GITHUB_USERNAME || 'admin',
};
