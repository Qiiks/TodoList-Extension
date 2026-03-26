import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { inviteSchema } from '@teamtodo/shared';
import { requireAdmin } from '../auth/middleware';
import { config } from '../config';
import type { TeamTodoStore } from '../store';

function createInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(16);
  let code = '';
  for (let i = 0; i < 16; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export function registerAdminRoutes(app: FastifyInstance, store: TeamTodoStore) {
  app.get('/api/admin/users', { preHandler: requireAdmin }, async () => {
    return {
      users: store.users.map((user) => ({
        ...user,
        isAdmin: user.githubLogin === config.adminGithub,
      })),
    };
  });

  app.delete('/api/admin/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const initialLength = store.users.length;
    store.users = store.users.filter((user) => user.id !== id);
    if (store.users.length === initialLength) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return { ok: true };
  });

  app.get('/api/admin/invites', { preHandler: requireAdmin }, async () => {
    return { invites: store.invites };
  });

  app.post('/api/admin/invites', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = inviteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid invite payload' });
    }

    const invite = store.seedInvite(createInviteCode(), parsed.data.maxUses);
    if (parsed.data.expiresAt) {
      invite.expiresAt = parsed.data.expiresAt;
    }
    return reply.status(201).send(invite);
  });

  app.delete('/api/admin/invites/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invite = store.invites.find((item) => item.id === id);
    if (!invite) {
      return reply.status(404).send({ error: 'Invite not found' });
    }
    invite.isActive = false;
    return { ok: true };
  });

  app.get('/api/admin/repos', { preHandler: requireAdmin }, async () => {
    const repos = new Set<string>();
    for (const record of store.activity) {
      repos.add(record.repoId);
    }
    return { repos: [...repos] };
  });

  app.get('/api/admin/health', { preHandler: requireAdmin }, async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      now: Date.now(),
    };
  });

  app.get('/admin', { preHandler: requireAdmin }, async (request, reply) => {
    reply.type('text/html');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TeamTodo Admin Dashboard</title>
  <style>
    :root {
      /* Colors */
      --bg-base: #f9fafb;
      --bg-surface: #ffffff;
      --bg-surface-hover: #f3f4f6;
      --text-main: #111827;
      --text-muted: #6b7280;
      --border-color: #e5e7eb;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --danger: #ef4444;
      --danger-hover: #dc2626;
      --success: #10b981;
      
      /* Typography */
      --font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-display: "Clash Display", var(--font-family);
      
      /* Spacing & Borders */
      --radius: 8px;
      --spacing-sm: 8px;
      --spacing-md: 16px;
      --spacing-lg: 24px;
      --spacing-xl: 32px;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-base: #0f1115;
        --bg-surface: #1a1d24;
        --bg-surface-hover: #262932;
        --text-main: #f9fafb;
        --text-muted: #9ca3af;
        --border-color: #374151;
        --accent: #3b82f6;
        --accent-hover: #60a5fa;
      }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-family);
      background-color: var(--bg-base);
      color: var(--text-main);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: var(--spacing-xl);
      display: grid;
      gap: var(--spacing-xl);
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: var(--spacing-lg);
    }

    h1 { font-family: var(--font-display); font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
    h2 { font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; margin-bottom: var(--spacing-md); }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--spacing-lg);
    }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: var(--spacing-lg);
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    /* Stats Grid */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: var(--spacing-md);
    }
    
    .stat-box {
      background: var(--bg-surface-hover);
      padding: var(--spacing-md);
      border-radius: var(--radius);
      text-align: center;
    }
    .stat-value { font-size: 2rem; font-weight: 700; color: var(--accent); font-family: var(--font-display); }
    .stat-label { font-size: 0.875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

    /* Tables */
    .table-container { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th, td { padding: 12px var(--spacing-md); border-bottom: 1px solid var(--border-color); }
    th { font-size: 0.875rem; color: var(--text-muted); font-weight: 500; }
    tbody tr:hover { background-color: var(--bg-surface-hover); }

    /* Forms & Buttons */
    .form-group { display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md); }
    input, select {
      flex: 1;
      background: var(--bg-base);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.875rem;
    }
    input:focus, select:focus { outline: 2px solid var(--accent); border-color: transparent; }

    button {
      background: var(--accent);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-weight: 500;
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.2s, transform 0.1s;
    }
    button:hover { background: var(--accent-hover); }
    button:active { transform: scale(0.98); }
    button.danger { background: var(--danger); }
    button.danger:hover { background: var(--danger-hover); }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      background: var(--bg-surface-hover);
    }
    .badge.success { background: rgba(16, 185, 129, 0.1); color: var(--success); }
    .badge.danger { background: rgba(239, 68, 68, 0.1); color: var(--danger); }

    /* Toast */
    #toast {
      position: fixed; bottom: 24px; right: 24px;
      background: var(--text-main); color: var(--bg-base);
      padding: 12px 24px; border-radius: var(--radius);
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transform: translateY(100px); opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #toast.show { transform: translateY(0); opacity: 1; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>TeamTodo Workspace</h1>
        <p style="color: var(--text-muted); margin-top: 4px;">System Administration Dashboard</p>
      </div>
      <div>
        <span class="badge success" id="health-badge">● System Online</span>
      </div>
    </header>

    <div class="grid">
      <!-- Quick Stats -->
      <section class="card" style="grid-column: 1 / -1;">
        <h2>Overview</h2>
        <div class="stats">
          <div class="stat-box">
            <div class="stat-value" id="stat-users">-</div>
            <div class="stat-label">Total Users</div>
          </div>
          <div class="stat-box">
            <div class="stat-value" id="stat-repos">-</div>
            <div class="stat-label">Active Repos</div>
          </div>
          <div class="stat-box">
            <div class="stat-value" id="stat-invites">-</div>
            <div class="stat-label">Active Invites</div>
          </div>
          <div class="stat-box">
            <div class="stat-value" id="stat-uptime">-</div>
            <div class="stat-label">Uptime (h)</div>
          </div>
        </div>
      </section>

      <!-- Invite Management -->
      <section class="card">
        <h2>Invitations</h2>
        <form id="invite-form" class="form-group">
          <input type="number" id="invite-uses" placeholder="Max uses" min="1" value="1" required>
          <button type="submit">Generate Invite</button>
        </form>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Uses</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="invites-tbody">
              <tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- User Management -->
      <section class="card">
        <h2>Users</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="users-tbody">
              <tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>

  <div id="toast"></div>

  <script>
    const API = {
      get: async (url) => { 
        const r = await fetch(url);
        if(!r.ok) throw new Error('Request failed');
        return r.json(); 
      },
      post: async (url, body) => { 
        const r = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) });
        if(!r.ok) throw new Error('Request failed');
        return r.json();
      },
      delete: async (url) => {
        const r = await fetch(url, { method: 'DELETE' });
        if(!r.ok) throw new Error('Request failed');
        return r.json();
      }
    };

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    async function loadData() {
      try {
        const [usersRes, reposRes, invitesRes, healthRes] = await Promise.all([
          API.get('/api/admin/users'),
          API.get('/api/admin/repos'),
          API.get('/api/admin/invites'),
          API.get('/api/admin/health')
        ]);

        // Update Stats
        document.getElementById('stat-users').textContent = usersRes.users.length;
        document.getElementById('stat-repos').textContent = reposRes.repos.length;
        
        const activeInvites = invitesRes.invites.filter(i => i.isActive);
        document.getElementById('stat-invites').textContent = activeInvites.length;
        const uptimeHours = Math.floor((Number(healthRes.uptime) || 0) / 3600);
        document.getElementById('stat-uptime').textContent = String(uptimeHours);
        const healthBadge = document.getElementById('health-badge');
        healthBadge.textContent = healthRes.status === 'ok' ? '● System Online' : '● Degraded';
        healthBadge.className = healthRes.status === 'ok' ? 'badge success' : 'badge danger';

        // Render Users
        document.getElementById('users-tbody').innerHTML = usersRes.users.map(u => \`
          <tr>
            <td><strong>\${u.githubLogin}</strong></td>
            <td><span class="badge">\${u.isAdmin ? 'Admin' : 'Member'}</span></td>
            <td>
              \${!u.isAdmin ? \`<button class="danger" onclick="deleteUser('\${u.id}')" style="padding: 4px 8px; font-size: 12px;">Remove</button>\` : ''}
            </td>
          </tr>
        \`).join('');

        // Render Invites
        document.getElementById('invites-tbody').innerHTML = invitesRes.invites.map(i => \`
          <tr style="opacity: \${i.isActive ? '1' : '0.5'}">
            <td style="font-family: monospace;">\${i.code}</td>
            <td>\${i.currentUses} / \${i.maxUses}</td>
            <td><span class="badge \${i.isActive ? 'success' : 'danger'}">\${i.isActive ? 'Active' : 'Revoked'}</span></td>
            <td>
              \${i.isActive ? \`<button class="danger" onclick="revokeInvite('\${i.id}')" style="padding: 4px 8px; font-size: 12px;">Revoke</button>\` : ''}
            </td>
          </tr>
        \`).join('');

      } catch (err) {
        showToast('Failed to load data');
        console.error(err);
      }
    }

    // Actions
    document.getElementById('invite-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const uses = document.getElementById('invite-uses').value;
      try {
        await API.post('/api/admin/invites', { maxUses: parseInt(uses, 10) });
        showToast('Invite created');
        loadData();
      } catch (err) { showToast('Error creating invite'); }
    });

    window.revokeInvite = async (id) => {
      if(!confirm('Revoke this invite?')) return;
      try {
        await API.delete(\`/api/admin/invites/\${id}\`);
        showToast('Invite revoked');
        loadData();
      } catch (err) { showToast('Error revoking invite'); }
    };

    window.deleteUser = async (id) => {
      if(!confirm('Permanently remove this user?')) return;
      try {
        await API.delete(\`/api/admin/users/\${id}\`);
        showToast('User removed');
        loadData();
      } catch (err) { showToast('Error removing user'); }
    };

    // Initial load
    loadData();
  </script>
</body>
</html>`;
  });
}
