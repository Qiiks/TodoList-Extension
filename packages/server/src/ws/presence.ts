export interface PresenceUser {
  userId: string;
  username: string;
  avatar?: string;
}

export class PresenceTracker {
  private readonly repoPresence = new Map<string, Map<string, PresenceUser>>();
  private readonly pendingRemoval = new Map<string, NodeJS.Timeout>();

  add(repoId: string, user: PresenceUser) {
    const key = `${repoId}:${user.userId}`;
    const pending = this.pendingRemoval.get(key);
    if (pending) {
      clearTimeout(pending);
      this.pendingRemoval.delete(key);
    }

    const repoUsers = this.repoPresence.get(repoId) ?? new Map<string, PresenceUser>();
    repoUsers.set(user.userId, user);
    this.repoPresence.set(repoId, repoUsers);
  }

  removeWithGrace(repoId: string, userId: string, graceMs = 5000) {
    const key = `${repoId}:${userId}`;
    if (this.pendingRemoval.has(key)) {
      return;
    }

    const timeout = setTimeout(() => {
      const repoUsers = this.repoPresence.get(repoId);
      repoUsers?.delete(userId);
      this.pendingRemoval.delete(key);
    }, graceMs);
    this.pendingRemoval.set(key, timeout);
  }

  list(repoId: string) {
    const repoUsers = this.repoPresence.get(repoId);
    return repoUsers ? [...repoUsers.values()] : [];
  }
}
