import type { GithubUser } from '@teamtodo/shared';
import { config } from '../config';

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

interface OAuthTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeGithubOauthCode(code: string): Promise<string> {
  if (!config.githubClientId || !config.githubClientSecret || !config.githubOauthRedirectUri) {
    throw new Error('GitHub OAuth is not configured');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'teamtodo-server',
    },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
      redirect_uri: config.githubOauthRedirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub OAuth exchange failed: ${response.status}`);
  }

  const payload = (await response.json()) as OAuthTokenResponse;
  if (!payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'GitHub OAuth did not return access token');
  }

  return payload.access_token;
}
