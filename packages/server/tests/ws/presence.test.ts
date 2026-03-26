import { describe, expect, it } from 'vitest';
import { PresenceTracker } from '../../src/ws/presence';

describe('ws/presence', () => {
  it('adds user on connect and dedups by userId', () => {
    const tracker = new PresenceTracker();
    tracker.add('owner/repo', { userId: 'u-1', username: 'alice' });
    tracker.add('owner/repo', { userId: 'u-1', username: 'alice', avatar: 'url' });
    const users = tracker.list('owner/repo');
    expect(users).toHaveLength(1);
    expect(users[0].avatar).toBe('url');
  });

  it('removes user after grace period', async () => {
    const tracker = new PresenceTracker();
    tracker.add('owner/repo', { userId: 'u-1', username: 'alice' });
    tracker.removeWithGrace('owner/repo', 'u-1', 5);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(tracker.list('owner/repo')).toHaveLength(0);
  });
});
