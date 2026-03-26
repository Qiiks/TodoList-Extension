import { randomUUID } from 'crypto';
import type { ActivityAction, GithubUser } from '@teamtodo/shared';

export interface UserRecord {
  id: string;
  githubId: number;
  githubLogin: string;
  avatarUrl?: string;
}

export interface InviteRecord {
  id: string;
  code: string;
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  expiresAt?: string;
}

export interface RefreshRecord {
  userId: string;
  tokenHash: string;
  expiresAt: number;
}

export interface CommentRecord {
  id: string;
  repoId: string;
  todoId: string;
  author: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActivityRecord {
  id: string;
  repoId: string;
  actor: string;
  action: ActivityAction;
  todoId?: string;
  todoTitle?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export class TeamTodoStore {
  public users: UserRecord[] = [];
  public invites: InviteRecord[] = [];
  public refreshTokens: RefreshRecord[] = [];
  public comments: CommentRecord[] = [];
  public activity: ActivityRecord[] = [];

  seedInvite(code: string, maxUses = 10) {
    const invite: InviteRecord = {
      id: randomUUID(),
      code,
      maxUses,
      currentUses: 0,
      isActive: true,
    };
    this.invites.push(invite);
    return invite;
  }

  findInvite(code: string) {
    return this.invites.find((invite) => invite.code === code);
  }

  findOrCreateUser(githubUser: GithubUser) {
    const existing = this.users.find((user) => user.githubId === githubUser.id);
    if (existing) {
      return existing;
    }

    const created: UserRecord = {
      id: randomUUID(),
      githubId: githubUser.id,
      githubLogin: githubUser.login,
      avatarUrl: githubUser.avatar_url,
    };
    this.users.push(created);
    return created;
  }

  addRefreshToken(record: RefreshRecord) {
    this.refreshTokens.push(record);
  }

  consumeRefreshToken(tokenHash: string) {
    const index = this.refreshTokens.findIndex((token) => token.tokenHash === tokenHash);
    if (index === -1) {
      return null;
    }
    const [record] = this.refreshTokens.splice(index, 1);
    return record;
  }

  removeRefreshTokensForUser(userId: string) {
    this.refreshTokens = this.refreshTokens.filter((token) => token.userId !== userId);
  }

  addComment(record: Omit<CommentRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = Date.now();
    const created: CommentRecord = {
      ...record,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.comments.push(created);
    return created;
  }

  updateComment(commentId: string, author: string, body: string) {
    const comment = this.comments.find((item) => item.id === commentId);
    if (!comment || comment.author !== author) {
      return null;
    }
    comment.body = body;
    comment.updatedAt = Date.now();
    return comment;
  }

  deleteComment(commentId: string, author: string) {
    const index = this.comments.findIndex((item) => item.id === commentId && item.author === author);
    if (index === -1) {
      return false;
    }
    this.comments.splice(index, 1);
    return true;
  }

  listComments(repoId: string, todoId: string) {
    return this.comments.filter((item) => item.repoId === repoId && item.todoId === todoId);
  }

  addActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt'>) {
    const created: ActivityRecord = {
      ...activity,
      id: randomUUID(),
      createdAt: Date.now(),
    };
    this.activity.push(created);
    return created;
  }

  listActivity(repoId: string, offset = 0, limit = 20) {
    return this.activity
      .filter((item) => item.repoId === repoId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit);
  }
}

export function createStore() {
  return new TeamTodoStore();
}
