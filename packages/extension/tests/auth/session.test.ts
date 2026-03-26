import { describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  readSession,
  refreshSession,
  saveSession,
} from '../../src/auth/session';

function createSecretStorageMock() {
  const map = new Map<string, string>();
  return {
    store: vi.fn(async (key: string, value: string) => {
      map.set(key, value);
    }),
    get: vi.fn(async (key: string) => map.get(key)),
    delete: vi.fn(async (key: string) => {
      map.delete(key);
    }),
  };
}

describe('auth/session', () => {
  it('stores and reads session tokens via SecretStorage', async () => {
    const storage = createSecretStorageMock();
    await saveSession(storage as any, 'jwt-1', 'refresh-1');
    const session = await readSession(storage as any);
    expect(session.accessToken).toBe('jwt-1');
    expect(session.refreshToken).toBe('refresh-1');
  });

  it('clears session tokens', async () => {
    const storage = createSecretStorageMock();
    await saveSession(storage as any, 'jwt-1', 'refresh-1');
    await clearSession(storage as any);
    const session = await readSession(storage as any);
    expect(session.accessToken).toBeNull();
    expect(session.refreshToken).toBeNull();
  });

  it('refreshes session from server endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jwt: 'jwt-2', refreshToken: 'refresh-2' }),
      }),
    );

    const refreshed = await refreshSession('http://localhost:3000', 'refresh-1');
    expect(refreshed.jwt).toBe('jwt-2');
    expect(refreshed.refreshToken).toBe('refresh-2');
  });
});
