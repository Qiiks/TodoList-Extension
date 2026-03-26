import { describe, expect, it } from 'vitest';
import {
  hashRefreshToken,
  isTokenExpired,
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
} from '../../src/auth/jwt';

describe('auth/jwt lifecycle', () => {
  it('issues and verifies JWT', () => {
    const token = issueAccessToken({
      userId: 'user-1',
      githubUsername: 'alice',
      githubAvatarUrl: 'https://avatar',
    });
    const decoded = verifyAccessToken(token) as { userId: string; githubUsername: string };
    expect(decoded.userId).toBe('user-1');
    expect(decoded.githubUsername).toBe('alice');
  });

  it('marks expired token as expired', async () => {
    const token = issueAccessToken(
      {
        userId: 'user-1',
        githubUsername: 'alice',
      },
      '1ms',
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(isTokenExpired(token)).toBe(true);
  });

  it('issues refresh token and hash changes deterministically', () => {
    const token = issueRefreshToken();
    const hash1 = hashRefreshToken(token);
    const hash2 = hashRefreshToken(token);
    expect(token).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });
});
