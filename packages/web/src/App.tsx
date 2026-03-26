import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

type Priority = 'low' | 'medium' | 'high';
type Status = 'open' | 'completed';

interface Todo {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  createdBy: string;
  assignedTo: string | null;
  labels: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

interface SessionUser {
  id: string;
  login: string;
  avatarUrl?: string;
  isAdmin: boolean;
}

interface CommentItem {
  id: string;
  author: string;
  body: string;
  createdAt: number;
}

interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  todoTitle?: string;
  createdAt: number;
}

const SESSION_KEY = 'teamtodo.web.session';
const REPO_KEY = 'teamtodo.web.repo';

function readSession(): { jwt: string; refreshToken: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { jwt?: string; refreshToken?: string };
    if (!parsed.jwt || !parsed.refreshToken) {
      return null;
    }
    return { jwt: parsed.jwt, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

function saveSession(jwt: string, refreshToken: string): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ jwt, refreshToken }));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function decodeRepo(defaultValue = ''): string {
  return localStorage.getItem(REPO_KEY) ?? defaultValue;
}

function saveRepo(repo: string): void {
  localStorage.setItem(REPO_KEY, repo);
}

function asTodo(value: unknown): Todo | null {
  if (!(value instanceof Y.Map)) {
    return null;
  }
  const id = value.get('id');
  const title = value.get('title');
  const createdBy = value.get('createdBy');
  if (typeof id !== 'string' || typeof title !== 'string' || typeof createdBy !== 'string') {
    return null;
  }
  const labels = value.get('labels');
  const labelsList = labels instanceof Y.Array ? labels.toArray().filter((item): item is string => typeof item === 'string') : [];
  return {
    id,
    title,
    description: typeof value.get('description') === 'string' ? (value.get('description') as string) : '',
    status: value.get('status') === 'completed' ? 'completed' : 'open',
    priority:
      value.get('priority') === 'low' || value.get('priority') === 'high' ? (value.get('priority') as Priority) : 'medium',
    createdBy,
    assignedTo: typeof value.get('assignedTo') === 'string' ? (value.get('assignedTo') as string) : null,
    labels: labelsList,
    createdAt: typeof value.get('createdAt') === 'number' ? (value.get('createdAt') as number) : Date.now(),
    updatedAt: typeof value.get('updatedAt') === 'number' ? (value.get('updatedAt') as number) : Date.now(),
    deletedAt: typeof value.get('deletedAt') === 'number' ? (value.get('deletedAt') as number) : null,
  };
}

function getTodosInOrder(doc: Y.Doc): Todo[] {
  const todosMap = doc.getMap<Y.Map<unknown>>('todos');
  const order = doc.getArray<string>('todoOrder').toArray();
  const ordered = order
    .map((id) => asTodo(todosMap.get(id)))
    .filter((todo): todo is Todo => todo !== null && todo.deletedAt === null);
  if (ordered.length > 0) {
    return ordered;
  }
  return Array.from(todosMap.values())
    .map((value) => asTodo(value))
    .filter((todo): todo is Todo => todo !== null && todo.deletedAt === null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

function wsBaseFromCurrentOrigin(): string {
  if (window.location.protocol === 'https:') {
    return `wss://${window.location.host}/ws`;
  }
  return `ws://${window.location.host}/ws`;
}

export function App() {
  const [inviteCode, setInviteCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [jwt, setJwt] = useState<string>('');
  const [refreshToken, setRefreshToken] = useState<string>('');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [repoId, setRepoId] = useState<string>(decodeRepo(''));
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [comments, setComments] = useState<Record<string, CommentItem[]>>({});
  const [newCommentByTodo, setNewCommentByTodo] = useState<Record<string, string>>({});
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [presenceUsers, setPresenceUsers] = useState<Array<{ userId: string; username: string; avatar?: string }>>([]);
  const [wsProvider, setWsProvider] = useState<WebsocketProvider | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [doc, setDoc] = useState<Y.Doc | null>(null);

  const authedFetch = async (path: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${jwt}`);
    return fetch(path, { ...init, headers });
  };

  const refreshMe = async (currentJwt: string): Promise<void> => {
    setAuthLoading(true);
    const response = await fetch('/api/auth/me', {
      headers: { authorization: `Bearer ${currentJwt}` },
    });
    if (response.status === 401 && refreshToken) {
      const refreshed = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!refreshed.ok) {
        clearSession();
        setJwt('');
        setRefreshToken('');
        setUser(null);
        setAuthLoading(false);
        return;
      }
      const payload = (await refreshed.json()) as { jwt: string; refreshToken: string };
      setJwt(payload.jwt);
      setRefreshToken(payload.refreshToken);
      saveSession(payload.jwt, payload.refreshToken);
      await refreshMe(payload.jwt);
      setAuthLoading(false);
      return;
    }
    if (!response.ok) {
      setAuthLoading(false);
      return;
    }
    const payload = (await response.json()) as { user: SessionUser };
    setUser(payload.user);
    setAuthLoading(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlJwt = params.get('jwt');
    const urlRefresh = params.get('refreshToken');
    const urlError = params.get('authError');

    if (urlError) {
      setAuthError(urlError);
    }

    if (urlJwt && urlRefresh) {
      setJwt(urlJwt);
      setRefreshToken(urlRefresh);
      saveSession(urlJwt, urlRefresh);
      window.history.replaceState({}, document.title, '/app');
      return;
    }

    const stored = readSession();
    if (stored) {
      setJwt(stored.jwt);
      setRefreshToken(stored.refreshToken);
    }
  }, []);

  useEffect(() => {
    if (!jwt) {
      return;
    }
    void refreshMe(jwt);
  }, [jwt]);

  useEffect(() => {
    if (!jwt || !repoId) {
      setStatus('disconnected');
      setTodos([]);
      setPresenceUsers([]);
      return;
    }

    saveRepo(repoId);

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(wsBaseFromCurrentOrigin(), repoId, ydoc, {
      connect: true,
      params: { token: jwt },
    });
    setWsProvider(provider);
    setDoc(ydoc);

    const updateTodos = () => setTodos(getTodosInOrder(ydoc));
    updateTodos();
    ydoc.on('update', updateTodos);

    provider.on('status', ({ status: next }: { status: 'connected' | 'connecting' | 'disconnected' }) => {
      setStatus(next);
    });

    provider.awareness.setLocalStateField('user', {
      userId: user?.id ?? 'web-user',
      username: user?.login ?? 'user',
      avatar: user?.avatarUrl,
    });

    const onAwareness = () => {
      const users = new Map<string, { userId: string; username: string; avatar?: string }>();
      for (const value of provider.awareness.getStates().values()) {
        const candidate = (value as { user?: unknown }).user;
        if (!candidate || typeof candidate !== 'object') {
          continue;
        }
        const typed = candidate as { userId?: unknown; username?: unknown; avatar?: unknown };
        if (typeof typed.userId !== 'string' || typeof typed.username !== 'string') {
          continue;
        }
        if (!users.has(typed.userId)) {
          users.set(typed.userId, {
            userId: typed.userId,
            username: typed.username,
            avatar: typeof typed.avatar === 'string' ? typed.avatar : undefined,
          });
        }
      }
      setPresenceUsers(Array.from(users.values()));
    };

    provider.awareness.on('change', onAwareness);

    return () => {
      provider.awareness.off('change', onAwareness);
      ydoc.off('update', updateTodos);
      provider.destroy();
      ydoc.destroy();
      setWsProvider(null);
      setDoc(null);
      setPresenceUsers([]);
    };
  }, [jwt, repoId, user?.id, user?.login, user?.avatarUrl]);

  const retryConnection = () => {
    wsProvider?.connect();
    setStatus('connecting');
  };

  const fetchActivity = async () => {
    if (!repoId || !jwt) {
      return;
    }
    setActivityLoading(true);
    const response = await authedFetch(`/api/repos/${encodeURIComponent(repoId)}/activity?offset=0&limit=20`);
    if (!response.ok) {
      setActivityLoading(false);
      return;
    }
    const payload = (await response.json()) as { items: ActivityItem[] };
    setActivity(payload.items);
    setActivityLoading(false);
  };

  const fetchComments = async (todoId: string) => {
    if (!repoId || !jwt) {
      return;
    }
    const response = await authedFetch(`/api/repos/${encodeURIComponent(repoId)}/todos/${encodeURIComponent(todoId)}/comments`);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { comments: CommentItem[] };
    setComments((prev) => ({ ...prev, [todoId]: payload.comments }));
  };

  useEffect(() => {
    if (!repoId || !jwt) {
      setActivity([]);
      return;
    }
    void fetchActivity();
  }, [repoId, jwt, todos.length]);

  const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  const addTodo = () => {
    if (!doc || !user || !newTodoTitle.trim()) {
      return;
    }
    const todosMap = doc.getMap<Y.Map<unknown>>('todos');
    const order = doc.getArray<string>('todoOrder');
    const id = newId();
    const now = Date.now();
    const todo = new Y.Map<unknown>();
    todo.set('id', id);
    todo.set('title', newTodoTitle.trim());
    todo.set('description', '');
    todo.set('status', 'open');
    todo.set('priority', 'medium');
    todo.set('createdBy', user.login);
    todo.set('completedBy', null);
    todo.set('assignedTo', null);
    todo.set('labels', new Y.Array<string>());
    todo.set('checklist', new Y.Array<Y.Map<unknown>>());
    todo.set('createdAt', now);
    todo.set('updatedAt', now);
    todo.set('deletedAt', null);
    todosMap.set(id, todo);
    order.push([id]);
    setNewTodoTitle('');
  };

  const toggleTodo = (id: string) => {
    if (!doc) {
      return;
    }
    const todo = doc.getMap<Y.Map<unknown>>('todos').get(id);
    if (!(todo instanceof Y.Map)) {
      return;
    }
    const next: Status = todo.get('status') === 'completed' ? 'open' : 'completed';
    todo.set('status', next);
    todo.set('updatedAt', Date.now());
    if (next === 'completed' && user) {
      todo.set('completedBy', user.login);
    } else {
      todo.set('completedBy', null);
    }
  };

  const removeTodo = (id: string) => {
    if (!doc) {
      return;
    }
    const todo = doc.getMap<Y.Map<unknown>>('todos').get(id);
    if (!(todo instanceof Y.Map)) {
      return;
    }
    todo.set('deletedAt', Date.now());
    todo.set('updatedAt', Date.now());
  };

  const addComment = async (todoId: string) => {
    const value = (newCommentByTodo[todoId] ?? '').trim();
    if (!value || !repoId || !jwt) {
      return;
    }
    const response = await authedFetch(`/api/repos/${encodeURIComponent(repoId)}/todos/${encodeURIComponent(todoId)}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: value }),
    });
    if (!response.ok) {
      return;
    }
    setNewCommentByTodo((prev) => ({ ...prev, [todoId]: '' }));
    await fetchComments(todoId);
    await fetchActivity();
  };

  const exportMarkdown = async () => {
    if (!repoId || !jwt) {
      return;
    }
    setExporting(true);
    const response = await authedFetch(`/api/repos/${encodeURIComponent(repoId)}/export/markdown`);
    if (!response.ok) {
      setExporting(false);
      return;
    }
    const markdown = await response.text();
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${repoId.replace('/', '_')}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const logout = async () => {
    if (jwt) {
      try {
        await authedFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // best effort
      }
    }
    clearSession();
    setJwt('');
    setRefreshToken('');
    setUser(null);
    setRepoId(decodeRepo(''));
  };

  const completionRatio = useMemo(() => {
    if (todos.length === 0) {
      return '0/0';
    }
    const done = todos.filter((todo) => todo.status === 'completed').length;
    return `${done}/${todos.length}`;
  }, [todos]);

  if (!jwt || !refreshToken || !user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>TeamTodo Web</h1>
          <p className="lede">Sign in with GitHub to use realtime todos, comments, and activity feeds.</p>
          <p className="social-proof">Trusted by 10,000+ collaborative sessions.</p>
          <label htmlFor="invite-code">Invite code</label>
          <input
            id="invite-code"
            aria-label="Invite code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="16-character invite code"
            maxLength={16}
          />
          {authError ? <p className="error">Auth error: {authError}</p> : null}
          <button
            className="primary-cta"
            type="button"
            onClick={() => {
              if (inviteCode.trim().length !== 16) {
                setAuthError('invite code must be 16 characters');
                return;
              }
              window.location.href = `/api/auth/github/start?inviteCode=${encodeURIComponent(inviteCode.trim())}`;
            }}
          >
            Continue with GitHub
          </button>
          <small className="hint">Secure GitHub OAuth. No GitHub password is stored by TeamTodo.</small>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>TeamTodo</h1>
          <p>
            Signed in as <strong>{user.login}</strong> ·
            <span className={`status-dot ${status}`}>{status}</span>
          </p>
        </div>
        <div className="topbar-actions">
          {status === 'disconnected' ? (
            <button type="button" className="ghost" onClick={retryConnection}>
              Retry Now
            </button>
          ) : null}
          <button type="button" onClick={exportMarkdown} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Markdown'}
          </button>
          {user.isAdmin ? (
            <a className="link-btn" href={`/admin?token=${encodeURIComponent(jwt)}`} target="_blank" rel="noreferrer">
              Admin
            </a>
          ) : null}
          <button type="button" className="danger" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <section className="repo-bar">
        <label htmlFor="repo">Repository</label>
        <input id="repo" aria-label="Repository" value={repoId} onChange={(event) => setRepoId(event.target.value)} placeholder="owner/repo" />
        <span className="pill">Presence: {presenceUsers.length}</span>
        <span className="pill">Completed: {completionRatio}</span>
      </section>

      {status === 'disconnected' ? (
        <section className="notice warning" role="status" aria-live="polite">
          Offline — changes stay local and sync on reconnect.
        </section>
      ) : null}

      {status === 'connecting' ? (
        <section className="notice" role="status" aria-live="polite">
          Reconnecting…
        </section>
      ) : null}

      <section className="composer">
        <label className="sr-only" htmlFor="new-todo">New todo</label>
        <input
          id="new-todo"
          value={newTodoTitle}
          onChange={(event) => setNewTodoTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              addTodo();
            }
          }}
          placeholder="Add a todo and press Create"
        />
        <button type="button" onClick={addTodo}>Create</button>
      </section>

      <div className="content-grid">
        <section className="panel">
          <h2>Todos ({todos.length})</h2>
          {todos.length === 0 ? <p className="empty">No todos yet. Create one above.</p> : null}
          <ul className="todo-list">
            {todos.map((todo) => (
              <li key={todo.id} className="todo-item">
                <div className="todo-main">
                  <input
                    type="checkbox"
                    aria-label={`Toggle completion for ${todo.title}`}
                    checked={todo.status === 'completed'}
                    onChange={() => toggleTodo(todo.id)}
                  />
                  <div>
                    <p className={todo.status === 'completed' ? 'done' : ''}>{todo.title}</p>
                    <small className="meta">
                      <span className="priority-badge">{todo.priority.toUpperCase()}</span> · created by {todo.createdBy}
                    </small>
                  </div>
                </div>
                <div className="todo-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setActiveTodoId((current) => (current === todo.id ? null : todo.id));
                      void fetchComments(todo.id);
                    }}
                  >
                    {activeTodoId === todo.id ? 'Hide Comments' : 'Comments'}
                  </button>
                  <button type="button" className="danger" onClick={() => removeTodo(todo.id)}>
                    Delete
                  </button>
                </div>
                <div className={`comment-box ${activeTodoId === todo.id ? '' : 'hidden'}`}>
                  <div className="comment-input-row">
                    <label className="sr-only" htmlFor={`comment-${todo.id}`}>Comment</label>
                    <input
                      id={`comment-${todo.id}`}
                      aria-label="Comment"
                      value={newCommentByTodo[todo.id] ?? ''}
                      onChange={(event) =>
                        setNewCommentByTodo((prev) => ({
                          ...prev,
                          [todo.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void addComment(todo.id);
                        }
                      }}
                      placeholder="Write a comment"
                    />
                    <button type="button" onClick={() => void addComment(todo.id)}>
                      Add
                    </button>
                  </div>
                  <ul className="comment-list">
                    {(comments[todo.id] ?? []).map((comment) => (
                      <li key={comment.id}>
                        <strong>{comment.author}</strong>: {comment.body}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Activity</h2>
          {activityLoading ? <p className="empty">Loading activity…</p> : null}
          {!activityLoading && activity.length === 0 ? <p className="empty">No recent activity yet.</p> : null}
          <ul className="activity-list">
            {activity.map((item) => (
              <li key={item.id}>
                <strong>{item.actor}</strong> {item.action.replace(/_/g, ' ')}
                {item.todoTitle ? `: ${item.todoTitle}` : ''}
              </li>
            ))}
          </ul>
        </section>
      </div>
      {authLoading ? (
        <section className="notice" role="status" aria-live="polite">
          Refreshing session…
        </section>
      ) : null}
    </main>
  );
}
