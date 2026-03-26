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
  return `
    <section class="tt-presence-bar">
      <h3 class="tt-section-title">Online</h3>
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
