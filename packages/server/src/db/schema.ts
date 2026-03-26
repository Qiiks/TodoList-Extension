import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, bigint, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const bytea = customType<{ data: Buffer; driverData: string }>({
  dataType() {
    return 'bytea';
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: bigint('github_id', { mode: 'number' }).unique().notNull(),
  githubLogin: varchar('github_login', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  displayName: varchar('display_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
});

export const inviteCodes = pgTable('invite_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 16 }).unique().notNull(),
  maxUses: integer('max_uses').notNull().default(10),
  currentUses: integer('current_uses').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const crdtDocuments = pgTable('crdt_documents', {
  repoId: varchar('repo_id', { length: 512 }).primaryKey(),
  stateVector: bytea('state_vector'),
  document: bytea('document').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const todosProjection = pgTable('todos_projection', {
  id: uuid('id').primaryKey(),
  repoId: varchar('repo_id', { length: 512 }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  createdBy: varchar('created_by', { length: 255 }).notNull(),
  completedBy: varchar('completed_by', { length: 255 }),
  assignedTo: varchar('assigned_to', { length: 255 }),
  labels: jsonb('labels').default('[]'),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  todoId: uuid('todo_id').notNull(),
  repoId: varchar('repo_id', { length: 512 }).notNull(),
  author: varchar('author', { length: 255 }).notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: varchar('repo_id', { length: 512 }).notNull(),
  actor: varchar('actor', { length: 255 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  todoId: uuid('todo_id'),
  todoTitle: text('todo_title'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
