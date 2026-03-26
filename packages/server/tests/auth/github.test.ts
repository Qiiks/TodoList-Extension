import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateGithubToken } from '../../src/auth/github';

describe('auth/github.validateGithubToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns GitHub user for valid token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, login: 'alice', avatar_url: 'https://avatar' }),
      }),
    );

    const user = await validateGithubToken('valid-token');
    expect(user.login).toBe('alice');
    expect(user.id).toBe(1);
  });

  it('throws when GitHub rejects token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    await expect(validateGithubToken('bad-token')).rejects.toThrow('GitHub token validation failed: 401');
  });

  it('throws when GitHub payload misses fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      }),
    );

    await expect(validateGithubToken('weird-token')).rejects.toThrow(
      'GitHub response missing required user fields',
    );
  });
});
