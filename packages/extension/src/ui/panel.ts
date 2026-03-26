import * as vscode from 'vscode';
import * as Y from 'yjs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'isomorphic-ws';
import { CONSTANTS, type Priority } from '@teamtodo/shared';
import { normalizeRepoUrl } from '../git/repo';
import {
  clearGithubExchangeToken,
  clearSession,
  readSession,
  refreshSession,
  saveGithubExchangeToken,
  saveSession,
} from '../auth/session';
import { loadOfflineDoc } from '../sync/offline';
import {
  addChecklistItem,
  addTodo,
  deleteTodo,
  getTodosInOrder,
  reorderTodo,
  setTodoAssignee,
  setTodoDescription,
  setTodoLabels,
  setTodoPriority,
  toggleTodo,
  updateChecklistItem,
} from '../sync/document';
import { renderActivityFeed } from './webview/components/ActivityFeed';
import { renderPresenceBar } from './webview/components/PresenceBar';
import { renderQuickAdd } from './webview/components/QuickAdd';
import { renderSearchFilter, type SearchFilterState } from './webview/components/SearchFilter';
import { renderStatusIndicator } from './webview/components/StatusIndicator';
import { renderTodoList } from './webview/components/TodoList';
import type {
  ConnectionIndicatorState,
  WebviewActivityItem,
  WebviewCommentItem,
  WebviewPresenceUser,
  WebviewTodo,
} from './webview/types';

const execFileAsync = promisify(execFile);

interface WebviewMessage {
  action: string;
  [key: string]: unknown;
}

interface JwtPayload {
  userId?: string;
  githubUsername?: string;
  githubAvatarUrl?: string;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeJwt(token: string | null): JwtPayload {
  if (!token) {
    return {};
  }
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return {};
    }
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4;
    const normalized = pad === 0 ? payload : payload + '='.repeat(4 - pad);
    const value = Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(value) as JwtPayload;
  } catch {
    return {};
  }
}

export class TeamTodoProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private readonly context: vscode.ExtensionContext;
  private readonly _extensionUri: vscode.Uri;
  private doc: Y.Doc | null = null;
  private provider: WebsocketProvider | null = null;
  private undoManager: Y.UndoManager | null = null;
  private repoId: string | null = null;
  private jwt: string | null = null;
  private refreshToken: string | null = null;
  private commentsByTodo: Record<string, WebviewCommentItem[]> = {};
  private activityItems: WebviewActivityItem[] = [];
  private presenceUsers: WebviewPresenceUser[] = [];
  private filterState: SearchFilterState = {
    query: '',
    status: 'all',
    priority: 'all',
    label: '',
    assignee: '',
  };
  private showCompleted = true;
  private activityOffset = 0;
  private readonly activityLimit = 20;
  private connection: ConnectionIndicatorState = { state: 'disconnected' };
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectCountdown: NodeJS.Timeout | null = null;
  private reconnectRemainingSec = 0;
  private suppressReconnect = false;
  private activityCollapsed = true;
  private defaultPriority: Priority = 'medium';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this._extensionUri = context.extensionUri;
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = this.renderShell(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((raw) => {
      void this.handleWebviewMessage(raw as WebviewMessage);
    });

    webviewView.onDidDispose(() => {
      this.disposeRuntime();
      this.view = null;
    });

    await this.bootstrap();
  }

  public async focusQuickAdd(): Promise<void> {
    await this.view?.show?.(true);
    void this.view?.webview.postMessage({ type: 'focus-quick-add' });
  }

  public toggleShowCompleted(): void {
    this.showCompleted = !this.showCompleted;
    this.pushRender();
  }

  public async signInInteractive(): Promise<void> {
    if (!this.repoId) {
      vscode.window.showWarningMessage('Open a GitHub repository to sign in.');
      return;
    }

    let githubSession: vscode.AuthenticationSession;
    try {
      const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: true });
      if (!session) {
        vscode.window.showWarningMessage('GitHub sign-in was cancelled.');
        return;
      }
      githubSession = session;
    } catch (error) {
      vscode.window.showErrorMessage(`GitHub sign-in failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return;
    }

    const inviteCode = await vscode.window.showInputBox({
      prompt: 'TeamTodo invite code (16 chars)',
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim().length === 16 ? null : 'Invite code must be 16 characters'),
    });
    if (!inviteCode) {
      return;
    }

    const serverUrl = this.serverUrl();
    const response = await fetch(`${serverUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ githubToken: githubSession.accessToken.trim(), inviteCode: inviteCode.trim() }),
    });

    if (!response.ok) {
      vscode.window.showErrorMessage(`Sign in failed (${response.status}).`);
      return;
    }

    const payload = (await response.json()) as { jwt: string; refreshToken: string };
    this.jwt = payload.jwt;
    this.refreshToken = payload.refreshToken;
    await saveGithubExchangeToken(this.context.secrets, githubSession.accessToken);
    await saveSession(this.context.secrets, payload.jwt, payload.refreshToken);
    this.connectRealtime();
    await this.refreshServerData();
    this.pushRender();
    vscode.window.showInformationMessage('TeamTodo signed in.');
  }

  public async signOut(): Promise<void> {
    if (this.jwt) {
      try {
        await fetch(`${this.serverUrl()}/api/auth/logout`, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.jwt}` },
        });
      } catch {
        // best effort
      }
    }

    this.jwt = null;
    this.refreshToken = null;
    try {
      await vscode.authentication.getSession('github', ['read:user'], { createIfNone: false, forceNewSession: false });
    } catch {
      // best effort
    }
    await clearSession(this.context.secrets);
    await clearGithubExchangeToken(this.context.secrets);
    this.disposeRealtime();
    this.connection = { state: 'disconnected' };
    this.presenceUsers = [];
    this.pushRender();
    vscode.window.showInformationMessage('TeamTodo signed out.');
  }

  public async switchRepositoryInteractive(): Promise<void> {
    const current = vscode.workspace.getConfiguration('teamtodo').get<string>('repoOverride') ?? '';
    const value = await vscode.window.showInputBox({
      prompt: 'Repository override (owner/repo). Leave blank to use detected git remote.',
      value: current,
      ignoreFocusOut: true,
    });
    if (value === undefined) {
      return;
    }
    await vscode.workspace.getConfiguration('teamtodo').update('repoOverride', value.trim(), vscode.ConfigurationTarget.Global);
    await this.bootstrap();
  }

  public async exportMarkdown(): Promise<void> {
    if (!this.jwt || !this.repoId) {
      vscode.window.showWarningMessage('Sign in and open a repository first.');
      return;
    }

    const response = await this.authedFetch(`/api/repos/${encodeURIComponent(this.repoId)}/export/markdown`, {
      method: 'GET',
    });

    if (!response.ok) {
      vscode.window.showErrorMessage(`Export failed (${response.status}).`);
      return;
    }

    const markdown = await response.text();
    const uri = await vscode.window.showSaveDialog({
      saveLabel: 'Export TeamTodo Markdown',
      defaultUri: vscode.Uri.file(`${this.repoId.replace('/', '_')}.md`),
      filters: { Markdown: ['md'] },
    });
    if (!uri) {
      return;
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(markdown, 'utf8'));
    vscode.window.showInformationMessage(`Exported markdown to ${uri.fsPath}`);
  }

  public async refreshAll(): Promise<void> {
    await this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.disposeRuntime();
    this.defaultPriority = this.readDefaultPriority();

    this.repoId = await this.resolveRepoId();
    const session = await readSession(this.context.secrets);
    this.jwt = session.accessToken;
    this.refreshToken = session.refreshToken;

    if (!this.repoId) {
      this.connection = { state: 'disconnected' };
      this.pushRender();
      return;
    }

    this.doc = await loadOfflineDoc(this.context.globalStorageUri, this.repoId);
    this.ensureDocShape(this.doc);
    this.undoManager = new Y.UndoManager([this.doc.getMap('todos'), this.doc.getArray('todoOrder')]);
    this.doc.on('update', this.handleDocUpdate);

    if (this.jwt) {
      this.connectRealtime();
      await this.refreshServerData();
    } else {
      this.connection = { state: 'disconnected' };
      this.activityItems = [];
      this.commentsByTodo = {};
      this.presenceUsers = [];
    }

    this.pushRender();
  }

  private readDefaultPriority(): Priority {
    const value = vscode.workspace.getConfiguration('teamtodo').get<string>('defaultPriority', 'medium');
    if (value === 'low' || value === 'high') {
      return value;
    }
    return 'medium';
  }

  private ensureDocShape(doc: Y.Doc): void {
    doc.getMap('todos');
    doc.getArray('todoOrder');
  }

  private readonly handleDocUpdate = () => {
    this.pushRender();
  };

  private connectRealtime(): void {
    if (!this.doc || !this.repoId || !this.jwt) {
      return;
    }
    this.disposeRealtime();

    const wsBase = this.wsBaseUrl();
    this.provider = new WebsocketProvider(wsBase, this.repoId, this.doc, {
      connect: true,
      params: { token: this.jwt },
      maxBackoffTime: CONSTANTS.WS_RECONNECT_MAX_BACKOFF,
      WebSocketPolyfill: WebSocket as any,
    });

    const payload = decodeJwt(this.jwt);
    this.provider.awareness.setLocalStateField('user', {
      userId: payload.userId ?? 'local-user',
      username: payload.githubUsername ?? 'you',
      avatar: payload.githubAvatarUrl,
    });

    this.provider.awareness.on('change', this.handleAwarenessChange);
    this.provider.on('status', this.handleProviderStatus);
    this.provider.on('connection-close', this.handleProviderDisconnect);
    this.provider.on('connection-error', this.handleProviderDisconnect);
  }

  private readonly handleAwarenessChange = () => {
    if (!this.provider) {
      return;
    }

    const users = new Map<string, WebviewPresenceUser>();
    for (const state of this.provider.awareness.getStates().values()) {
      const user = (state as { user?: unknown }).user;
      if (!user || typeof user !== 'object') {
        continue;
      }
      const typed = user as { userId?: unknown; username?: unknown; avatar?: unknown };
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
    this.presenceUsers = Array.from(users.values());
    this.pushRender();
  };

  private readonly handleProviderStatus = ({ status }: { status: 'connected' | 'disconnected' | 'connecting' }) => {
    if (status === 'connected') {
      this.connection = { state: 'connected' };
      this.reconnectAttempt = 0;
      this.clearReconnectTimers();
      this.pushRender();
      return;
    }
    if (status === 'connecting') {
      this.connection = { state: 'reconnecting' };
      this.pushRender();
      return;
    }
    this.scheduleReconnect();
  };

  private readonly handleProviderDisconnect = () => {
    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    if (this.suppressReconnect || !this.provider) {
      return;
    }
    this.clearReconnectTimers();
    this.provider.disconnect();

    this.reconnectAttempt += 1;
    const delay = Math.min(30, 2 ** (this.reconnectAttempt - 1));
    this.reconnectRemainingSec = delay;
    this.connection = { state: 'disconnected', retryInSec: delay };
    this.pushRender();

    this.reconnectCountdown = setInterval(() => {
      this.reconnectRemainingSec = Math.max(0, this.reconnectRemainingSec - 1);
      this.connection = { state: 'disconnected', retryInSec: this.reconnectRemainingSec };
      this.pushRender();
    }, 1000);

    this.reconnectTimer = setTimeout(() => {
      this.clearReconnectTimers();
      if (!this.provider || this.suppressReconnect) {
        return;
      }
      this.connection = { state: 'reconnecting' };
      this.pushRender();
      this.provider.connect();
    }, delay * 1000);
  }

  private triggerRetryNow(): void {
    this.clearReconnectTimers();
    if (!this.provider) {
      this.connectRealtime();
      return;
    }
    this.connection = { state: 'reconnecting' };
    this.pushRender();
    this.provider.connect();
  }

  private clearReconnectTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.reconnectCountdown) {
      clearInterval(this.reconnectCountdown);
      this.reconnectCountdown = null;
    }
  }

  private disposeRealtime(): void {
    this.clearReconnectTimers();
    if (this.provider) {
      this.provider.awareness.off('change', this.handleAwarenessChange);
      this.provider.off('status', this.handleProviderStatus);
      this.provider.off('connection-close', this.handleProviderDisconnect);
      this.provider.off('connection-error', this.handleProviderDisconnect);
      this.provider.destroy();
      this.provider = null;
    }
  }

  private disposeRuntime(): void {
    this.suppressReconnect = true;
    this.disposeRealtime();
    this.suppressReconnect = false;
    if (this.doc) {
      this.doc.off('update', this.handleDocUpdate);
      this.doc = null;
    }
    this.undoManager = null;
  }

  private async resolveRepoId(): Promise<string | null> {
    const override = vscode.workspace.getConfiguration('teamtodo').get<string>('repoOverride', '').trim();
    if (override.length > 0) {
      return override;
    }

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: folder.uri.fsPath });
      return normalizeRepoUrl(stdout.trim());
    } catch {
      return null;
    }
  }

  private wsBaseUrl(): string {
    const serverUrl = this.serverUrl();
    if (serverUrl.startsWith('https://')) {
      return `${serverUrl.replace('https://', 'wss://')}/ws`;
    }
    return `${serverUrl.replace('http://', 'ws://')}/ws`;
  }

  private serverUrl(): string {
    return vscode.workspace.getConfiguration('teamtodo').get<string>('serverUrl', 'http://localhost:3000');
  }

  private async ensureJwt(): Promise<string | null> {
    if (!this.refreshToken) {
      return this.jwt;
    }

    if (this.jwt) {
      return this.jwt;
    }

    try {
      const refreshed = await refreshSession(this.serverUrl(), this.refreshToken);
      this.jwt = refreshed.jwt;
      this.refreshToken = refreshed.refreshToken;
      await saveSession(this.context.secrets, refreshed.jwt, refreshed.refreshToken);
      return this.jwt;
    } catch {
      return null;
    }
  }

  private async authedFetch(path: string, init: RequestInit): Promise<Response> {
    const token = await this.ensureJwt();
    const headers = new Headers(init.headers);
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return fetch(`${this.serverUrl()}${path}`, {
      ...init,
      headers,
    });
  }

  private async refreshServerData(): Promise<void> {
    if (!this.repoId || !this.jwt) {
      this.activityItems = [];
      this.commentsByTodo = {};
      return;
    }
    await Promise.all([this.fetchActivity(), this.fetchCommentsForVisibleTodos()]);
  }

  private async fetchActivity(): Promise<void> {
    if (!this.repoId || !this.jwt) {
      this.activityItems = [];
      return;
    }

    try {
      const response = await this.authedFetch(
        `/api/repos/${encodeURIComponent(this.repoId)}/activity?offset=${this.activityOffset}&limit=${this.activityLimit}`,
        { method: 'GET' },
      );

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        items: Array<{ id: string; actor: string; action: string; todoTitle?: string; createdAt: number }>;
      };

      this.activityItems = payload.items.map((item) => ({
        id: item.id,
        actor: item.actor,
        action: item.action,
        todoTitle: item.todoTitle,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.parse(String(item.createdAt)),
      }));
    } catch {
      // keep prior state
    }
  }

  private async fetchCommentsForTodo(todoId: string): Promise<void> {
    if (!this.repoId || !this.jwt) {
      this.commentsByTodo[todoId] = [];
      return;
    }

    try {
      const response = await this.authedFetch(
        `/api/repos/${encodeURIComponent(this.repoId)}/todos/${encodeURIComponent(todoId)}/comments`,
        { method: 'GET' },
      );

      if (response.status === 404) {
        this.commentsByTodo[todoId] = [];
        return;
      }

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        comments: Array<{ id: string; author: string; body: string; createdAt: number }>;
      };

      this.commentsByTodo[todoId] = payload.comments.map((comment) => ({
        id: comment.id,
        author: comment.author,
        body: comment.body,
        createdAt:
          typeof comment.createdAt === 'number'
            ? comment.createdAt
            : Date.parse(String(comment.createdAt)),
      }));
    } catch {
      // keep prior state
    }
  }

  private async fetchCommentsForVisibleTodos(): Promise<void> {
    const todos = this.allTodos();
    await Promise.all(todos.map((todo) => this.fetchCommentsForTodo(todo.id)));
  }

  private allTodos(): WebviewTodo[] {
    if (!this.doc) {
      return [];
    }
    return getTodosInOrder(this.doc).map((todo) => ({
      id: todo.id,
      title: todo.title,
      description: todo.description,
      status: todo.status,
      priority: todo.priority,
      createdBy: todo.createdBy,
      assignedTo: todo.assignedTo,
      labels: todo.labels,
      checklist: todo.checklist,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      deletedAt: todo.deletedAt,
    }));
  }

  private filteredTodos(): WebviewTodo[] {
    return this.allTodos().filter((todo) => {
      if (todo.deletedAt !== null) {
        return false;
      }
      if (!this.showCompleted && todo.status === 'completed') {
        return false;
      }
      if (this.filterState.status !== 'all' && todo.status !== this.filterState.status) {
        return false;
      }
      if (this.filterState.priority !== 'all' && todo.priority !== this.filterState.priority) {
        return false;
      }
      if (this.filterState.label && !todo.labels.includes(this.filterState.label)) {
        return false;
      }
      if (this.filterState.assignee === '__unassigned' && todo.assignedTo !== null) {
        return false;
      }
      if (this.filterState.assignee && this.filterState.assignee !== '__unassigned' && todo.assignedTo !== this.filterState.assignee) {
        return false;
      }
      if (this.filterState.query.trim().length > 0) {
        const q = this.filterState.query.trim().toLowerCase();
        const inTitle = todo.title.toLowerCase().includes(q);
        const inDescription = (todo.description ?? '').toLowerCase().includes(q);
        if (!inTitle && !inDescription) {
          return false;
        }
      }
      return true;
    });
  }

  private completedCount(): number {
    return this.allTodos().filter((todo) => todo.deletedAt === null && todo.status === 'completed').length;
  }

  private assignees(): string[] {
    return Array.from(
      new Set(
        this.allTodos()
          .map((todo) => todo.assignedTo)
          .filter((assignee): assignee is string => typeof assignee === 'string' && assignee.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  private labels(): string[] {
    return Array.from(new Set(this.allTodos().flatMap((todo) => todo.labels))).sort((a, b) => a.localeCompare(b));
  }

  private pushRender(): void {
    if (!this.view) {
      return;
    }

    const todos = this.filteredTodos();
    const orderedIds = todos.map((todo) => todo.id);
    const completedCount = this.completedCount();
    const signedIn = Boolean(this.jwt);
    const hasRepo = Boolean(this.repoId);

    const sections = {
      status: renderStatusIndicator(this.connection),
      presence: renderPresenceBar(this.presenceUsers),
      options: this.renderOptionsBar(signedIn, hasRepo, completedCount),
      search: renderSearchFilter(this.filterState, this.labels(), this.assignees()),
      todos: renderTodoList(todos, orderedIds, this.commentsByTodo, this.assignees()),
      quickAdd: renderQuickAdd(this.defaultPriority),
      activityHeader: `<button class="tt-activity-toggle" type="button" data-action="toggle-activity">${
        this.activityCollapsed ? '▸ Activity' : '▾ Activity'
      }</button>`,
      activity: this.activityCollapsed ? '' : renderActivityFeed(this.activityItems, this.activityOffset, this.activityLimit),
      emptyState: this.repoId
        ? ''
        : '<section class="tt-empty-state-main">Open a GitHub repository to view todos.</section>',
      authBanner: this.repoId && !signedIn ? '<section class="tt-auth-banner">Not signed in. Use TeamTodo: Sign In.</section>' : '',
      repoText: this.repoId ? escapeHtml(this.repoId) : 'No repository detected',
    };

    void this.view.webview.postMessage({ type: 'render', sections });
  }

  private renderOptionsBar(signedIn: boolean, hasRepo: boolean, completedCount: number): string {
    const authButton = signedIn
      ? '<button class="tt-icon-btn" type="button" data-action="sign-out" title="Sign out" aria-label="Sign out"><span aria-hidden="true">⎋</span></button>'
      : '<button class="tt-icon-btn" type="button" data-action="sign-in" title="Sign in with GitHub" aria-label="Sign in with GitHub"><span aria-hidden="true">⏻</span></button>';

    return `
      <div class="tt-options">
        ${authButton}
        <button class="tt-icon-btn" type="button" data-action="switch-repo" title="Switch repository" aria-label="Switch repository"><span aria-hidden="true">⇄</span></button>
        <button class="tt-icon-btn" type="button" data-action="toggle-show-completed" title="${
          this.showCompleted ? 'Hide' : 'Show'
        } completed (${completedCount})" aria-label="Toggle completed todos"><span aria-hidden="true">☑</span></button>
        <button class="tt-icon-btn" type="button" data-action="undo" ${hasRepo ? '' : 'disabled'} title="Undo" aria-label="Undo"><span aria-hidden="true">↶</span></button>
        <button class="tt-icon-btn" type="button" data-action="redo" ${hasRepo ? '' : 'disabled'} title="Redo" aria-label="Redo"><span aria-hidden="true">↷</span></button>
        <button class="tt-icon-btn" type="button" data-action="export-markdown" ${
          signedIn && hasRepo ? '' : 'disabled'
        } title="Export markdown" aria-label="Export markdown"><span aria-hidden="true">⤓</span></button>
        <button class="tt-icon-btn" type="button" data-action="refresh" title="Refresh" aria-label="Refresh"><span aria-hidden="true">↻</span></button>
      </div>
    `;
  }

  private async handleWebviewMessage(message: WebviewMessage): Promise<void> {
    switch (message.action) {
      case 'webview-ready': {
        this.pushRender();
        return;
      }
      case 'sign-in': {
        await this.signInInteractive();
        return;
      }
      case 'sign-out': {
        await this.signOut();
        return;
      }
      case 'switch-repo': {
        await this.switchRepositoryInteractive();
        return;
      }
      case 'export-markdown': {
        await this.exportMarkdown();
        return;
      }
      case 'refresh': {
        await this.refreshAll();
        return;
      }
      case 'toggle-show-completed': {
        this.toggleShowCompleted();
        return;
      }
      case 'toggle-activity': {
        this.activityCollapsed = !this.activityCollapsed;
        this.pushRender();
        return;
      }
      case 'retry-now': {
        this.triggerRetryNow();
        return;
      }
      default:
        break;
    }

    if (!this.doc) {
      return;
    }

    switch (message.action) {
      case 'quick-add': {
        const title = typeof message.title === 'string' ? message.title.trim() : '';
        const priority = message.priority === 'low' || message.priority === 'high' ? message.priority : 'medium';
        if (title.length === 0) {
          return;
        }
        const payload = decodeJwt(this.jwt);
        addTodo(this.doc, {
          id: randomUUID(),
          title,
          priority,
          createdBy: payload.githubUsername ?? 'you',
        });
        await this.fetchActivity();
        this.pushRender();
        return;
      }
      case 'toggle-todo': {
        if (typeof message.todoId !== 'string') {
          return;
        }
        toggleTodo(this.doc, message.todoId);
        await this.fetchActivity();
        this.pushRender();
        return;
      }
      case 'reorder': {
        if (typeof message.from !== 'number' || typeof message.to !== 'number') {
          return;
        }
        reorderTodo(this.doc, message.from, message.to);
        this.pushRender();
        return;
      }
      case 'set-description': {
        if (typeof message.todoId !== 'string' || typeof message.description !== 'string') {
          return;
        }
        setTodoDescription(this.doc, message.todoId, message.description);
        this.pushRender();
        return;
      }
      case 'set-priority': {
        if (typeof message.todoId !== 'string') {
          return;
        }
        if (message.priority !== 'low' && message.priority !== 'medium' && message.priority !== 'high') {
          return;
        }
        setTodoPriority(this.doc, message.todoId, message.priority);
        this.pushRender();
        return;
      }
      case 'set-labels': {
        if (typeof message.todoId !== 'string' || typeof message.labels !== 'string') {
          return;
        }
        const labels = Array.from(
          new Set(
            message.labels
              .split(',')
              .map((label) => label.trim())
              .filter((label) => label.length > 0),
          ),
        );
        setTodoLabels(this.doc, message.todoId, labels);
        this.pushRender();
        return;
      }
      case 'set-assignee': {
        if (typeof message.todoId !== 'string') {
          return;
        }
        const assignee = typeof message.assignee === 'string' && message.assignee.trim().length > 0 ? message.assignee.trim() : null;
        setTodoAssignee(this.doc, message.todoId, assignee);
        this.pushRender();
        return;
      }
      case 'add-checklist-item': {
        if (typeof message.todoId !== 'string' || typeof message.text !== 'string') {
          return;
        }
        const text = message.text.trim();
        if (text.length === 0) {
          return;
        }
        addChecklistItem(this.doc, message.todoId, {
          id: randomUUID(),
          text,
          completed: false,
        });
        this.pushRender();
        return;
      }
      case 'toggle-checklist-item': {
        if (typeof message.todoId !== 'string' || typeof message.checklistId !== 'string' || typeof message.completed !== 'boolean') {
          return;
        }
        updateChecklistItem(this.doc, message.todoId, message.checklistId, message.completed);
        this.pushRender();
        return;
      }
      case 'delete-todo': {
        if (typeof message.todoId !== 'string') {
          return;
        }
        deleteTodo(this.doc, message.todoId);
        this.pushRender();
        return;
      }
      case 'submit-comment': {
        if (typeof message.todoId !== 'string' || typeof message.body !== 'string' || !this.repoId) {
          return;
        }
        if (!this.jwt) {
          vscode.window.showWarningMessage('Sign in to post comments.');
          return;
        }
        const body = message.body.trim();
        if (body.length === 0) {
          return;
        }

        const response = await this.authedFetch(
          `/api/repos/${encodeURIComponent(this.repoId)}/todos/${encodeURIComponent(message.todoId)}/comments`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body }),
          },
        );

        if (response.ok) {
          await Promise.all([this.fetchCommentsForTodo(message.todoId), this.fetchActivity()]);
          this.pushRender();
        }
        return;
      }
      case 'filter-change': {
        if (typeof message.name !== 'string' || typeof message.value !== 'string') {
          return;
        }
        if (message.name === 'query') {
          this.filterState.query = message.value;
        } else if (message.name === 'label') {
          this.filterState.label = message.value;
        } else if (message.name === 'status' && ['all', 'open', 'completed'].includes(message.value)) {
          this.filterState.status = message.value as SearchFilterState['status'];
        } else if (message.name === 'priority' && ['all', 'low', 'medium', 'high'].includes(message.value)) {
          this.filterState.priority = message.value as SearchFilterState['priority'];
        } else if (message.name === 'assignee') {
          this.filterState.assignee = message.value;
        }
        this.pushRender();
        return;
      }
      case 'activity-next': {
        this.activityOffset += this.activityLimit;
        await this.fetchActivity();
        this.pushRender();
        return;
      }
      case 'activity-prev': {
        this.activityOffset = Math.max(0, this.activityOffset - this.activityLimit);
        await this.fetchActivity();
        this.pushRender();
        return;
      }
      case 'undo': {
        this.undoManager?.undo();
        this.pushRender();
        return;
      }
      case 'redo': {
        this.undoManager?.redo();
        this.pushRender();
        return;
      }
      default:
        return;
    }
  }

  private renderShell(webview: vscode.Webview): string {
    const csp = [
      "default-src 'none'",
      `script-src ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `img-src ${webview.cspSource} https: data:`,
    ].join('; ');

    const scriptUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.js'))
      .toString();

    const logoUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.svg'))
      .toString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TeamTodo</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .tt-root { display: grid; grid-template-rows: auto auto auto auto 1fr auto auto; height: 100vh; min-height: 100vh; }
    .tt-section { padding: 8px; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); }
    .tt-scroller { overflow-y: auto; padding: 8px; min-height: 0; }
    .tt-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .tt-brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .tt-brand-meta { min-width: 0; }
    .tt-logo {
      width: 22px;
      height: 22px;
      border-radius: 5px;
      border: 1px solid var(--vscode-sideBarSectionHeader-border);
      background: var(--vscode-editorWidget-background);
      flex: 0 0 auto;
    }
    .tt-options { display: flex; gap: 4px; align-items: center; justify-content: flex-end; flex-wrap: nowrap; }
    .tt-icon-btn {
      width: 24px;
      height: 24px;
      min-width: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      line-height: 1;
      border-color: var(--vscode-toolbar-hoverBackground);
      background: transparent;
      color: var(--vscode-icon-foreground);
    }
    .tt-icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
    .tt-repo { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .tt-auth-banner, .tt-empty-state-main {
      margin: 8px;
      padding: 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-editorWidget-background);
      border-radius: 6px;
    }
    .tt-quick-add { display: grid; gap: 8px; }
    .tt-quick-add-grid {
      display: grid;
      grid-template-columns: minmax(0, 7fr) minmax(0, 2fr) minmax(64px, 1fr);
      gap: 8px;
      align-items: stretch;
    }
    .tt-quick-add-input { width: 100%; min-height: 36px; resize: vertical; }
    .tt-quick-add-priority { width: 100%; }
    .tt-quick-add-submit { width: 100%; }
    .tt-quick-add-hint { color: var(--vscode-descriptionForeground); }

    .tt-search-wrap { display: grid; gap: 8px; }
    .tt-search-filter {
      display: grid;
      grid-template-columns: minmax(0, 2fr) repeat(4, minmax(0, 1fr));
      gap: 8px;
      align-items: center;
    }

    .tt-todo-list { display: grid; gap: 8px; }
    .tt-todo-item { border: 1px solid var(--vscode-sideBarSectionHeader-border); border-radius: 6px; padding: 8px; margin-bottom: 8px; }
    .tt-todo-item:hover { background: var(--vscode-list-hoverBackground); }
    .tt-todo-header { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .tt-todo-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .tt-todo-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tt-todo-meta { display: flex; align-items: center; gap: 6px; }
    .tt-status-badge { padding: 2px 6px; border-radius: 4px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .tt-priority { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--vscode-descriptionForeground); }
    .tt-priority--low { background: var(--vscode-charts-green); }
    .tt-priority--medium { background: var(--vscode-charts-yellow); }
    .tt-priority--high { background: var(--vscode-charts-red); }
    .tt-avatar, .tt-comment-avatar { width: 20px; height: 20px; border-radius: 50%; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
    .tt-label-chip { border: 1px solid var(--vscode-input-border); border-radius: 10px; padding: 1px 6px; margin-right: 4px; }
    .tt-field-row { display: grid; gap: 4px; margin: 8px 0; }
    input[type='text'], input[type='search'], textarea, select {
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 6px;
      font: inherit;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border);
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      font: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.6; cursor: default; }
    .tt-delete-btn { background: var(--vscode-errorForeground); color: var(--vscode-button-foreground); }
    .tt-presence-list, .tt-comment-form, .tt-checklist-add-row, .tt-activity-pagination { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

    .tt-activity-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .tt-activity-toggle {
      width: 100%;
      text-align: left;
      border: 1px solid var(--vscode-sideBarSectionHeader-border);
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-sideBar-foreground);
      padding: 4px 8px;
      border-radius: 4px;
    }
    .tt-activity-items { display: grid; gap: 8px; margin-top: 8px; }
    .tt-activity-item { border: 1px solid var(--vscode-sideBarSectionHeader-border); border-radius: 4px; padding: 8px; }

    .tt-status-bar {
      border-top: 1px solid var(--vscode-statusBar-border, var(--vscode-sideBarSectionHeader-border));
      background: var(--vscode-statusBar-background);
      color: var(--vscode-statusBar-foreground);
      padding: 4px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      min-height: 24px;
      font-size: 12px;
    }
    .tt-status-indicator { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
    .tt-status-retry {
      background: transparent;
      color: var(--vscode-statusBar-foreground);
      border-color: transparent;
      text-decoration: underline;
      padding: 0;
    }
    .tt-description-rendered { border-left: 2px solid var(--vscode-textLink-foreground); padding-left: 8px; margin: 8px 0; }
    .tt-comment-item { display: flex; gap: 8px; padding: 4px 0; }
    .tt-comment-content p { margin: 4px 0 0 0; }
    .tt-section-title { margin: 0 0 6px 0; font-size: 12px; color: var(--vscode-descriptionForeground); text-transform: uppercase; }
    .tt-todo-row:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .tt-drag-over { outline: 1px dashed var(--vscode-focusBorder); }
    .tt-empty-state { color: var(--vscode-descriptionForeground); padding: 8px; }
  </style>
</head>
<body>
  <div class="tt-root">
    <section class="tt-section tt-toolbar">
      <div class="tt-brand">
        <img class="tt-logo" src="${logoUri}" alt="TeamTodo logo" />
        <div class="tt-brand-meta">
          <div id="repoText" class="tt-repo"></div>
        </div>
      </div>
      <div id="optionsSection"></div>
    </section>
    <section class="tt-section" id="quickAddSection"></section>
    <section class="tt-section" id="presenceSection"></section>
    <section class="tt-section tt-search-wrap" id="searchSection"></section>
    <div id="emptyState"></div>
    <div id="authBanner"></div>
    <section class="tt-scroller" id="todoSection"></section>
    <section class="tt-section">
      <div class="tt-activity-header" id="activityHeader"></div>
      <div id="activitySection"></div>
    </section>
    <section class="tt-status-bar" id="statusSection"></section>
  </div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
