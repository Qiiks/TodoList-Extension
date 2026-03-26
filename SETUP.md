# TeamTodo Self-Hosting Setup

This guide explains how to run your own TeamTodo server, create invites, and onboard teammates.

## 1) Prerequisites

- Node.js 20+ (recommended LTS)
- npm 10+
- Docker
- Docker Compose (`docker compose`)
- Git

Quick checks:

```bash
node -v
npm -v
docker -v
docker compose version
git --version
```

## 2) Clone and install

```bash
git clone <your-private-repo-url>
cd "TodoList Extension"
npm install
```

## 3) Environment setup

Copy sample env:

```bash
cp .env.example .env
```

Current variables in `.env.example`:

- `DATABASE_URL`
  - PostgreSQL connection string used by the TeamTodo backend.
  - Example: `postgresql://teamtodo:password@localhost:5432/teamtodo`

- `JWT_SECRET`
  - Secret key used to sign and verify JWT access tokens.
  - Must be long, random, and private.
  - Generate securely:
    ```bash
    openssl rand -hex 32
    ```
  - Paste result into `.env` as `JWT_SECRET=<generated-value>`

- `ADMIN_GITHUB_USERNAME`
  - GitHub username that is allowed to use admin-only capabilities (invite management/admin routes/dashboard).
  - Set this to your GitHub handle.

- `PORT`
  - HTTP port for the backend server.
  - Default: `3000`

## 4) Start backend services

```bash
docker compose up -d
```

Verify containers are running:

```bash
docker compose ps
```

If needed, inspect logs:

```bash
docker compose logs -f
```

## 5) Access admin dashboard

Open:

```
http://localhost:3000/admin
```

Use your admin GitHub account (`ADMIN_GITHUB_USERNAME`) to manage invites.

## 6) Generate invite codes

From the admin dashboard:

1. Open **Invites** section
2. Create a new invite (set max uses as needed)
3. Copy the generated invite code

Share invite codes only with trusted teammates.

## 7) Share server URL with teammates

Teammates need the TeamTodo server URL, for example:

- Local network: `http://<your-lan-ip>:3000`
- Public host/reverse proxy: `https://teamtodo.your-domain.com`

Make sure the URL is reachable from teammate machines and WebSocket traffic is allowed.

## 8) Teammate onboarding flow

1. Install the extension `.vsix` in VS Code
2. Open Command Palette → **TeamTodo: Sign In**
3. Sign in via VS Code’s native GitHub OAuth prompt
4. Enter TeamTodo server URL in extension settings (`teamtodo.serverUrl`)
5. Run **TeamTodo: Switch Repository** and set target `owner/repo` if needed
6. Enter invite code when prompted

After this, live sync/presence/activity should appear in the TeamTodo sidebar.

## Deploying on Coolify

1. Go to Coolify dashboard → **New Resource** → choose **Docker Compose** or **Dockerfile**.
2. Point Coolify to your TeamTodo repository.
3. Use `docker-compose.yml` (production), **not** `docker-compose.dev.yml`.
4. In Coolify environment variable settings, add every variable from `.env.coolify.example`.
5. Set health check path to `/health`.
6. Deploy — Coolify handles build, container lifecycle, and routing.
7. Access admin dashboard at `https://your-coolify-domain/admin`.

## 9) Troubleshooting

### Connection errors (HTTP)

- Check `teamtodo.serverUrl` is correct and reachable
- Check backend is running: `docker compose ps`
- Check logs: `docker compose logs -f`
- Confirm firewall/proxy allows traffic to backend port

### JWT/auth issues (401/403)

- Ensure invite code is valid and not exhausted
- Ensure `JWT_SECRET` is set and stable (changing it invalidates existing sessions)
- Sign out and sign in again from the extension

### WebSocket disconnects / reconnect loops

- Confirm backend WebSocket endpoint is reachable
- If behind reverse proxy, ensure WS upgrade headers are enabled
- Verify `ws://`/`wss://` matches your server URL (`http` vs `https`)
- Check server logs for auth failures on WS connect

### GitHub sign-in issues

- Ensure VS Code GitHub auth provider is available
- Try VS Code account sign-out/sign-in, then re-run **TeamTodo: Sign In**

### Repo not detected

- Ensure workspace folder is a git repo with an `origin` remote
- Or set `teamtodo.repoOverride` manually to `owner/repo`
