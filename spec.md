# TeamTodo — Technical Specification

> **Synced Collaborative Todo List for VS Code**
> A self-hosted, real-time collaborative todo list extension scoped per GitHub repository.

---

## 1. Product Overview

### 1.1 What Is It?
TeamTodo is an open-source VS Code extension paired with a self-hosted backend server. Teams share todo lists that are scoped per GitHub repository — every collaborator working on the same repo sees the same list, in real-time.

### 1.2 Core Principles
- **Self-hosted.** Users deploy their own server. No SaaS, no vendor lock-in.
- **Real-time & offline-first.** Powered by CRDTs — changes sync instantly when online, merge cleanly when offline.
- **Native feel.** The extension looks and behaves like a built-in VS Code feature.
- **Per-repository scoping.** Todos are tied to GitHub repositories, not workspaces or branches.

### 1.3 Target Users
Small engineering teams (2–20 people) working on shared GitHub repositories who want a lightweight, integrated task tracker inside their editor.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │ Webview   │  │ Yjs Doc  │  │ GitHub Auth (built-in) │ │
│  │ Panel     │  │ (CRDT)   │  │ via vscode.auth API    │ │
│  └────┬─────┘  └────┬─────┘  └──────────┬─────────────┘ │
│       │              │                   │               │
│       └──────────────┼───────────────────┘               │
│                      │                                   │
│              ┌───────┴────────┐                          │
│              │ y-websocket    │                          │
│              │ provider       │                          │
│              └───────┬────────┘                          │
│                      │  Local persistence                │
│              ┌───────┴────────┐                          │
│              │ globalStorage  │                          │
│              │ (offline CRDT) │                          │
│              └────────────────┘                          │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (wss://)
                       │
┌──────────────────────┴──────────────────────────────────┐
│                    Backend Server                        │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │ HTTP API │  │ WS Relay │  │ Yjs Persistence        │ │
│  │ (Fastify)│  │ (ws)     │  │ (y-websocket server)   │ │
│  └────┬─────┘  └────┬─────┘  └──────────┬─────────────┘ │
│       │              │                   │               │
│       └──────────────┼───────────────────┘               │
│                      │                                   │
│              ┌───────┴────────┐                          │
│              │  PostgreSQL    │                          │
│              │  ┌───────────┐ │                          │
│              │  │ CRDT Blob │ │                          │
│              │  │ Users     │ │                          │
│              │  │ Invites   │ │                          │
│              │  │ Activity  │ │                          │
│              │  │ Comments  │ │                          │
│              │  │ Todos     │ (materialized projection) │
│              │  └───────────┘ │                          │
│              └────────────────┘                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Admin Dashboard (served at /admin)        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Dual Data Strategy
- **Primary source of truth:** Yjs CRDT document (one per repository), stored as binary blob in PostgreSQL.
- **Materialized projection:** A relational `todos` table that mirrors the CRDT state, updated on every CRDT change. This powers the admin dashboard, activity queries, and search.

---

## 3. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Extension** | TypeScript, VS Code Extension API, Webview | Shared language with server; Webview for rich UI |
| **CRDT Library** | Yjs | Battle-tested, built-in undo/redo, WebSocket provider |
| **WebSocket** | y-websocket (client), ws + y-websocket (server) | Native Yjs integration, handles sync protocol |
| **Server Runtime** | Node.js + TypeScript | Shared types with extension; monorepo structure |
| **HTTP Framework** | Fastify | Faster than Express, built-in schema validation |
| **Database** | PostgreSQL | Reliable, scalable, great JSON support |
| **ORM** | Drizzle ORM | Lightweight, TypeScript-native, excellent DX |
| **Admin Dashboard** | Embedded HTML/CSS/JS (served by Fastify) | No external framework; lightweight, self-contained |
| **Auth** | VS Code GitHub Auth → JWT | Client-side GitHub, server-issued JWT |
| **Containerization** | Docker + Docker Compose | One-command self-hosting |

### 3.1 Monorepo Structure

```
teamtodo/
├── packages/
│   ├── shared/           # Shared TypeScript types, constants, validation
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   ├── constants.ts
│   │   │   └── validation.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── server/           # Backend web server
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── config.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.ts
│   │   │   │   ├── migrations/
│   │   │   │   └── client.ts
│   │   │   ├── auth/
│   │   │   │   ├── github.ts
│   │   │   │   ├── jwt.ts
│   │   │   │   └── middleware.ts
│   │   │   ├── ws/
│   │   │   │   ├── handler.ts
│   │   │   │   ├── presence.ts
│   │   │   │   └── notifications.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── invite.ts
│   │   │   │   ├── activity.ts
│   │   │   │   ├── comments.ts
│   │   │   │   └── admin.ts
│   │   │   ├── crdt/
│   │   │   │   ├── persistence.ts
│   │   │   │   └── projection.ts
│   │   │   └── admin/
│   │   │       └── dashboard/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── extension/        # VS Code extension
│       ├── src/
│       │   ├── extension.ts
│       │   ├── auth/
│       │   │   ├── github.ts
│       │   │   └── session.ts
│       │   ├── git/
│       │   │   └── repo.ts
│       │   ├── sync/
│       │   │   ├── provider.ts
│       │   │   ├── document.ts
│       │   │   └── offline.ts
│       │   ├── ui/
│       │   │   ├── panel.ts
│       │   │   ├── webview/
│       │   │   │   ├── index.html
│       │   │   │   ├── main.ts
│       │   │   │   ├── styles.css
│       │   │   │   ├── components/
│       │   │   │   │   ├── TodoList.ts
│       │   │   │   │   ├── TodoItem.ts
│       │   │   │   │   ├── ChecklistItem.ts
│       │   │   │   │   ├── QuickAdd.ts
│       │   │   │   │   ├── SearchFilter.ts
│       │   │   │   │   ├── ActivityFeed.ts
│       │   │   │   │   ├── PresenceBar.ts
│       │   │   │   │   ├── CommentThread.ts
│       │   │   │   │   └── StatusIndicator.ts
│       │   │   │   └── utils/
│       │   │   │       ├── dragdrop.ts
│       │   │   │       └── theme.ts
│       │   │   └── commands.ts
│       │   └── notifications/
│       │       └── toasts.ts
│       ├── tests/
│       ├── package.json
│       └── tsconfig.json
├── docker-compose.yml
├── package.json          # Workspace root (npm workspaces)
├── tsconfig.base.json
└── README.md
```

---

## 4. Authentication & Authorization

### 4.1 Auth Flow

```
Extension                    Server                       GitHub API
   │                           │                              │
   │  1. vscode.authentication │                              │
   │     .getSession('github') │                              │
   │  ◄──── GitHub token ──────┤                              │
   │                           │                              │
   │  2. POST /api/auth/register                              │
   │     { githubToken,        │                              │
   │       inviteCode }        │                              │
   │  ─────────────────────►   │                              │
   │                           │  3. GET /user                │
   │                           │     Authorization: token     │
   │                           │  ─────────────────────────►  │
   │                           │  ◄── { login, avatar, id } ──┤
   │                           │                              │
   │                           │  4. Validate invite code     │
   │                           │     Create/find user         │
   │                           │     Issue JWT + refresh token│
   │                           │                              │
   │  ◄── { jwt, refreshToken, │                              │
   │        user } ────────────┤                              │
   │                           │                              │
   │  5. Store JWT in          │                              │
   │     SecretStorage         │                              │
   │                           │                              │
   │  6. Connect WebSocket     │                              │
   │     Authorization: jwt    │                              │
   │  ─────────────────────►   │                              │
   │                           │  7. Validate JWT             │
   │  ◄── Connection accepted ─┤                              │
```

### 4.2 Token Strategy
- **JWT (access token):** Short-lived (1 hour). Contains `userId`, `githubUsername`, `githubAvatarUrl`.
- **Refresh token:** Long-lived (30 days). Stored in VS Code `SecretStorage`. Used to silently obtain new JWTs.
- **Token refresh:** Extension checks JWT expiry before each WebSocket reconnect. If expired, calls `POST /api/auth/refresh` with the refresh token. If refresh token is also expired, triggers full re-authentication.

### 4.3 Invite Codes
- Generated by the server admin via the admin dashboard.
- Format: 16-character alphanumeric string (e.g., `A3xF9kL2mN7pQ1wR`).
- Each code has a `maxUses` count (set at creation, multi-use).
- Registration endpoint is rate-limited: 5 attempts per IP per minute.

### 4.4 Authorization Model
- **Open model:** All authenticated users can create, edit, complete, delete, and reorder any todo on any repository they access.
- **Future enhancement (flagged):** Per-repository access control lists.

---

## 5. Data Model

### 5.1 CRDT Document Structure (Yjs)

One Yjs `Y.Doc` per repository (`owner/repo`).

```typescript
// CRDT document structure
Y.Doc {
  // Ordered list of todo IDs — Y.Array for ordering
  todoOrder: Y.Array<string>  // ["todo-uuid-1", "todo-uuid-2", ...]

  // Map of todo ID → todo data — Y.Map of Y.Maps
  todos: Y.Map<string, Y.Map> {
    "todo-uuid-1": Y.Map {
      id: string              // UUID v4
      title: string           // Required
      description: string     // Optional, markdown
      status: "open" | "completed"
      priority: "low" | "medium" | "high"
      createdBy: string       // GitHub username
      completedBy: string     // GitHub username (null if open)
      assignedTo: string      // GitHub username (null if unassigned)
      labels: Y.Array<string> // ["bug", "frontend"]
      checklist: Y.Array<Y.Map> {
        { id: string, text: string, completed: boolean }
      }
      createdAt: number       // Unix timestamp
      updatedAt: number       // Unix timestamp
      deletedAt: number       // Unix timestamp (null if not deleted)
    }
  }
}
```

### 5.2 PostgreSQL Schema (Relational Projection + Non-CRDT Data)

```sql
-- Users table
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id     BIGINT UNIQUE NOT NULL,
  github_login  VARCHAR(255) NOT NULL,
  avatar_url    TEXT,
  display_name  VARCHAR(255),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Invite codes
CREATE TABLE invite_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(16) UNIQUE NOT NULL,
  max_uses      INTEGER NOT NULL DEFAULT 10,
  current_uses  INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT true
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(255) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- CRDT document blobs (one per repository)
CREATE TABLE crdt_documents (
  repo_id       VARCHAR(512) PRIMARY KEY,
  state_vector  BYTEA,
  document      BYTEA NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Materialized todo projection (mirrors CRDT for queries)
CREATE TABLE todos_projection (
  id            UUID PRIMARY KEY,
  repo_id       VARCHAR(512) NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'open',
  priority      VARCHAR(20) NOT NULL DEFAULT 'medium',
  created_by    VARCHAR(255) NOT NULL,
  completed_by  VARCHAR(255),
  assigned_to   VARCHAR(255),
  labels        JSONB DEFAULT '[]',
  position      INTEGER NOT NULL,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_todos_repo ON todos_projection(repo_id);
CREATE INDEX idx_todos_status ON todos_projection(repo_id, status);
CREATE INDEX idx_todos_deleted ON todos_projection(repo_id, deleted_at);

-- Comments (append-only, not in CRDT)
CREATE TABLE comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id       UUID NOT NULL,
  repo_id       VARCHAR(512) NOT NULL,
  author        VARCHAR(255) NOT NULL,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_todo ON comments(todo_id);

-- Activity log (append-only)
CREATE TABLE activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       VARCHAR(512) NOT NULL,
  actor         VARCHAR(255) NOT NULL,
  action        VARCHAR(50) NOT NULL,
  todo_id       UUID,
  todo_title    TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_repo ON activity_log(repo_id, created_at DESC);
```

### 5.3 Activity Actions

```typescript
type ActivityAction =
  | "todo_created"
  | "todo_completed"
  | "todo_reopened"
  | "todo_deleted"
  | "todo_restored"
  | "todo_edited"
  | "todo_assigned"
  | "todo_reordered"
  | "checklist_item_added"
  | "checklist_item_completed"
  | "comment_added"
  | "label_added"
  | "label_removed"
  | "priority_changed";
```

---

## 6. Real-time Syncing

### 6.1 CRDT Strategy
- **Library:** Yjs
- **Transport:** y-websocket protocol over `ws://` / `wss://`
- **Document granularity:** One `Y.Doc` per repository (`owner/repo`)
- **Conflict resolution:** Automatic via Yjs merge semantics:
  - Concurrent edits to the same field → last-writer-wins per field
  - Concurrent list insertions → both items preserved, deterministic ordering
  - Concurrent reorders → both applied, no data loss

### 6.2 Server-Side Persistence
On every CRDT update received, the server:
1. Merges the update into the in-memory Yjs document.
2. Persists the encoded Yjs document to `crdt_documents` table.
3. Updates the `todos_projection` table (materialized view).
4. Logs relevant actions to `activity_log`.
5. Broadcasts the update to all other connected clients for that repo.

### 6.3 Undo/Redo
- Yjs `Y.UndoManager` attached to the `todoOrder` and `todos` shared types.
- Undo is **per-user** — undoing your changes won't undo someone else's.
- Supported via `Ctrl+Z` / `Ctrl+Shift+Z` when the extension panel is focused.

### 6.4 Garbage Collection
A background job runs daily (configurable) to:
- Permanently purge soft-deleted todos older than 30 days.
- Compact the Yjs document to reclaim space.
- Clean up activity log entries older than 90 days (configurable).

---

## 7. VS Code Extension (Client)

### 7.1 Activation
- **Activation event:** `onStartupFinished` (lightweight check).
- On activation:
  1. Check for saved server URL in settings.
  2. Detect Git repository from workspace.
  3. Load persisted CRDT state from `globalStorageUri`.
  4. If authenticated, establish WebSocket connection.
  5. Register sidebar panel, commands, and URI handler.

### 7.2 Repository Detection

```typescript
function normalizeRepoUrl(remoteUrl: string): string | null {
  const patterns = [
    /github\.com[:/](.+?\/.+?)(?:\.git)?$/,
  ];
  for (const pattern of patterns) {
    const match = remoteUrl.match(pattern);
    if (match) return match[1];
  }
  return null;
}
```

- No Git repo detected → empty state: *"Open a GitHub repository to view todos."*
- Repo detected but not authenticated → show sign-in prompt.
- Setting `teamtodo.repoOverride` allows manual override.

### 7.3 UI: Webview Sidebar Panel

> [!IMPORTANT]
> Uses a **Webview** (not TreeView) for rich UI: drag-and-drop, inline editing, avatars, activity feed, and presence indicators. Styled with VS Code CSS variables to match the active theme.

#### Panel Layout (top to bottom):
1. **Presence bar** — GitHub avatars of currently active users.
2. **Search & filter bar** — Text search + filter dropdowns (status, priority, label, assignee).
3. **Todo list** — Ordered, with checkbox, title, priority dot, assignee/creator avatars, labels, expand arrow, drag handle.
4. **Show completed toggle** — "Show X completed" link.
5. **Quick-add input** — Fixed bottom. `Enter` to submit, `Shift+Enter` for line break.

#### Expanded Todo View:
- Rendered markdown description
- Toggleable checklist items
- Priority selector
- Label editor
- Assignee dropdown
- Comment thread
- Metadata ("Created by X · 2 hours ago")
- Delete button (with confirmation)

### 7.4 Theming

```css
body {
  background: var(--vscode-sideBar-background);
  color: var(--vscode-sideBar-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}

.todo-item:hover {
  background: var(--vscode-list-hoverBackground);
}
```

### 7.5 Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| `TeamTodo: Add New Todo` | `Ctrl+Shift+T` | Focus the quick-add input |
| `TeamTodo: Toggle Show Completed` | — | Toggle completed todos visibility |
| `TeamTodo: Sign In` | — | Trigger GitHub auth + server registration |
| `TeamTodo: Sign Out` | — | Clear tokens and disconnect |
| `TeamTodo: Switch Repository` | — | Manually set repo identifier |
| `TeamTodo: Export as Markdown` | — | Export current repo's todos |
| `TeamTodo: Refresh` | — | Force re-sync |

### 7.6 Extension Settings

```jsonc
{
  "teamtodo.serverUrl": "",
  "teamtodo.repoOverride": "",
  "teamtodo.notifications.showToasts": true,
  "teamtodo.notifications.showCreated": true,
  "teamtodo.notifications.showCompleted": true,
  "teamtodo.notifications.showDeleted": false,
  "teamtodo.defaultPriority": "medium"
}
```

### 7.7 Keyboard Navigation (when panel is focused)

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between todos |
| `Enter` / `Space` | Toggle completion |
| `Delete` | Soft-delete with confirmation |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+Shift+T` | Focus quick-add input |
| `Escape` | Blur panel / close expanded todo |

---

## 8. Backend Server

### 8.1 HTTP API Endpoints

#### Auth
| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/auth/register` | None |
| `POST` | `/api/auth/refresh` | Refresh token |
| `POST` | `/api/auth/logout` | JWT |

#### Comments
| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/repos/:repo/todos/:todoId/comments` | JWT |
| `POST` | `/api/repos/:repo/todos/:todoId/comments` | JWT |
| `PUT` | `/api/comments/:commentId` | JWT |
| `DELETE` | `/api/comments/:commentId` | JWT |

#### Activity & Export
| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/repos/:repo/activity` | JWT |
| `GET` | `/api/repos/:repo/export/markdown` | JWT |

#### Admin
| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/admin/users` | Admin |
| `DELETE` | `/api/admin/users/:id` | Admin |
| `GET` | `/api/admin/invites` | Admin |
| `POST` | `/api/admin/invites` | Admin |
| `DELETE` | `/api/admin/invites/:id` | Admin |
| `GET` | `/api/admin/repos` | Admin |

### 8.2 WebSocket Protocol
- Endpoint: `wss://server/ws/:repo`
- Auth: JWT sent as query parameter during handshake.
- Protocol: y-websocket sync protocol (Yjs native).
- Additional messages:
  - `{ type: "presence", users: [...] }` — on connect/disconnect.
  - `{ type: "notification", action, actor, todoTitle, ... }` — on activity.

### 8.3 Presence Tracking
- In-memory map: `Map<repoId, Set<{ userId, username, avatar }>>`.
- On connect → add, broadcast. On disconnect → remove after 5s grace period.
- Deduplicated by `userId` (multiple windows = one presence entry).

### 8.4 Server Configuration

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/teamtodo
JWT_SECRET=<random-256-bit-secret>

# Optional
PORT=3000
ADMIN_GITHUB_USERNAME=yourname
GC_INTERVAL_HOURS=24
GC_SOFT_DELETE_DAYS=30
GC_ACTIVITY_LOG_DAYS=90
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=5
```

### 8.5 Admin Dashboard
- Served at `/admin` by Fastify.
- Protected: requires GitHub login matching `ADMIN_GITHUB_USERNAME`.
- Features: invite CRUD, user management, repo stats, server health.
- Minimal: semantic HTML, vanilla CSS, no framework.

---

## 9. Offline Support

### 9.1 Local Persistence
- Yjs document saved to `globalStorageUri` after every change: `<repoId>.yjs`.
- Loaded before WebSocket connects for instant rendering.

### 9.2 Offline Behavior
- Status indicator: **"Offline — changes will sync when reconnected"**.
- All operations continue locally via CRDT.
- On reconnect, Yjs exchanges state vectors and syncs diffs automatically.

### 9.3 Reconnection Strategy
- **Exponential backoff:** 1s → 2s → 4s → 8s → 16s → 30s (max).
- **Visible indicators:**
  - `🔴 Disconnected — Retrying in Xs...`
  - `🟡 Reconnecting...`
  - `🟢 Connected`
- Manual "Retry Now" button available.

---

## 10. Security

### 10.1 Transport
- TLS enforced in production (`wss://`, `https://`).

### 10.2 Authentication
- GitHub tokens validated against GitHub API on registration.
- JWTs signed with HS256 using `JWT_SECRET`.
- Refresh tokens stored as bcrypt hashes.
- WebSocket rejects invalid/expired JWT at handshake.

### 10.3 Input Validation
- All request bodies validated with Zod schemas (shared package).
- Limits: titles 500 chars, descriptions 10K chars, comments 5K chars, 20 labels/todo, 50 checklist items/todo.

### 10.4 Rate Limiting
- Auth: 5/min per IP.
- API: 100/min per user.
- WebSocket connections: 10/min per IP.

### 10.5 Invite Code Security
- 16-char alphanumeric (62^16 combinations).
- Rate-limited, admin-deactivatable, optionally expiring.

---

## 11. Testing Plan

### 11.1 Unit Tests

**Shared:** `validation.test.ts`, `types.test.ts`

**Server:**
- `auth/github.test.ts` — GitHub token validation (mocked)
- `auth/jwt.test.ts` — JWT lifecycle
- `crdt/persistence.test.ts` — Yjs encode/decode/merge
- `crdt/projection.test.ts` — CRDT → relational accuracy
- `routes/auth.test.ts` — Registration, refresh, logout
- `routes/comments.test.ts` — CRUD, authorization
- `routes/activity.test.ts` — Pagination
- `routes/admin.test.ts` — Admin access, invite CRUD
- `ws/handler.test.ts` — WebSocket auth, lifecycle
- `ws/presence.test.ts` — Tracking, dedup, grace period

**Extension:**
- `git/repo.test.ts` — URL parsing/normalization
- `auth/session.test.ts` — Token storage, refresh
- `sync/offline.test.ts` — Local persistence
- `sync/document.test.ts` — CRDT operations

### 11.2 Integration Tests
- Two Yjs clients syncing through server
- Offline changes merge on reconnect
- Full auth flow (invite → GitHub → JWT → WebSocket)
- Presence broadcasts with multiple clients
- Comments → activity log pipeline
- Garbage collection of soft-deleted items

### 11.3 E2E Tests
- Extension activation and repo detection
- Add todo via quick-add
- Drag-and-drop reorder
- Multi-client real-time sync
- Offline disconnect → edit → reconnect → merge

### 11.4 Test Tooling

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit and integration tests |
| **Supertest** | HTTP endpoint testing |
| **testcontainers** | PostgreSQL in Docker for integration tests |
| **@vscode/test-electron** | Extension E2E |
| **Playwright** | Admin dashboard UI |

### 11.5 Running Tests

```bash
npm run test:unit -w packages/server
npm run test:unit -w packages/extension
npm run test:unit -w packages/shared
npm run test:integration -w packages/server
npm run test:e2e -w packages/extension
npm run test   # all
```

---

## 12. Deployment

### 12.1 Docker Compose

```yaml
version: "3.8"
services:
  server:
    build: ./packages/server
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://teamtodo:password@db:5432/teamtodo
      - JWT_SECRET=${JWT_SECRET}
      - ADMIN_GITHUB_USERNAME=${ADMIN_GITHUB_USERNAME}
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=teamtodo
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=teamtodo
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U teamtodo"]
      interval: 5s
      timeout: 5s
      retries: 5
volumes:
  pgdata:
```

### 12.2 Quick Start

```bash
git clone https://github.com/yourorg/teamtodo.git
cd teamtodo
cp .env.example .env
# Edit .env: set JWT_SECRET and ADMIN_GITHUB_USERNAME
docker compose up -d
# Server at http://localhost:3000
# Admin at http://localhost:3000/admin
```

### 12.3 Extension Distribution
- Published to VS Code Marketplace as `teamtodo`.
- Also available as `.vsix` for private installation.

---

## 13. Future Enhancements (Post-v1)

> [!NOTE]
> Out of scope for v1, documented for future reference.

- Per-repository access control
- Branch-scoped todo lists
- File-linked todos (associate with specific file/line)
- Recurring todos
- Due dates and reminders
- Mobile companion app / web UI
- Webhook integrations (Slack, Discord)
- SQLite as alternative database
