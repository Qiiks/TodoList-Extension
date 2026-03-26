import type { WebviewActivityItem } from '../types';

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderActivityFeed(items: WebviewActivityItem[], offset: number, limit: number): string {
  return `
    <section class="tt-activity-feed">
      <h3 class="tt-section-title">Activity</h3>
      <div class="tt-activity-items">
        ${items
          .map(
            (item) => `
            <article class="tt-activity-item">
              <strong>${escapeHtml(item.actor)}</strong>
              <span>${escapeHtml(item.action.replaceAll('_', ' '))}</span>
              <small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small>
            </article>
          `,
          )
          .join('')}
      </div>
      <div class="tt-activity-pagination">
        <button type="button" data-action="activity-prev" ${offset <= 0 ? 'disabled' : ''}>Previous</button>
        <span>Offset ${offset} · Limit ${limit}</span>
        <button type="button" data-action="activity-next">Next</button>
      </div>
    </section>
  `;
}
