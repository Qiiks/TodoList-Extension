import type * as vscode from 'vscode';

const ACCESS_TOKEN_KEY = 'teamtodo.accessToken';
const REFRESH_TOKEN_KEY = 'teamtodo.refreshToken';
const GITHUB_EXCHANGE_TOKEN_KEY = 'teamtodo.githubExchangeToken';

export async function saveSession(
  secretStorage: vscode.SecretStorage,
  accessToken: string,
  refreshToken: string,
) {
  await secretStorage.store(ACCESS_TOKEN_KEY, accessToken);
  await secretStorage.store(REFRESH_TOKEN_KEY, refreshToken);
}

export async function readSession(secretStorage: vscode.SecretStorage) {
  const accessToken = await secretStorage.get(ACCESS_TOKEN_KEY);
  const refreshToken = await secretStorage.get(REFRESH_TOKEN_KEY);
  return {
    accessToken: accessToken ?? null,
    refreshToken: refreshToken ?? null,
  };
}

export async function clearSession(secretStorage: vscode.SecretStorage) {
  await secretStorage.delete(ACCESS_TOKEN_KEY);
  await secretStorage.delete(REFRESH_TOKEN_KEY);
}

export async function saveGithubExchangeToken(
  secretStorage: vscode.SecretStorage,
  githubToken: string,
) {
  await secretStorage.store(GITHUB_EXCHANGE_TOKEN_KEY, githubToken);
}

export async function readGithubExchangeToken(secretStorage: vscode.SecretStorage) {
  const token = await secretStorage.get(GITHUB_EXCHANGE_TOKEN_KEY);
  return token ?? null;
}

export async function clearGithubExchangeToken(secretStorage: vscode.SecretStorage) {
  await secretStorage.delete(GITHUB_EXCHANGE_TOKEN_KEY);
}

export async function refreshSession(
  serverUrl: string,
  refreshToken: string,
): Promise<{ jwt: string; refreshToken: string }> {
  const response = await fetch(`${serverUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh session: ${response.status}`);
  }

  const data = (await response.json()) as { jwt: string; refreshToken: string };
  return data;
}
