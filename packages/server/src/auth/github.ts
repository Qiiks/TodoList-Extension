import type { GithubUser } from '@teamtodo/shared';

export async function validateGithubToken(githubToken: string): Promise<GithubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'teamtodo-server',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub token validation failed: ${response.status}`);
  }

  const user = (await response.json()) as GithubUser;
  if (!user?.id || !user?.login) {
    throw new Error('GitHub response missing required user fields');
  }

  return user;
}
