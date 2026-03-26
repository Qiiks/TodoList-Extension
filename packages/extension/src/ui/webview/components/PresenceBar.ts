import type { WebviewPresenceUser } from '../types';

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderPresenceBar(users: WebviewPresenceUser[]): string {
  if (users.length === 0) {
    return '<section class="tt-presence-bar"><div class="tt-presence-empty">No collaborators active</div></section>';
  }

  return `
    <section class="tt-presence-bar">
      <div class="tt-presence-list">
        ${users
          .map(
            (user) => `
            <span class="tt-presence-user" title="${escapeHtml(user.username)}">
              <span class="tt-avatar">${escapeHtml(user.username.slice(0, 1).toUpperCase() || '?')}</span>
              <span class="tt-presence-name">${escapeHtml(user.username)}</span>
            </span>
          `,
          )
          .join('')}
      </div>
    </section>
  `;
}
