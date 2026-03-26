import type { WebviewCommentItem } from '../types';

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTimestamp(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleString();
  } catch {
    return 'Unknown time';
  }
}

export function renderCommentThread(todoId: string, comments: WebviewCommentItem[]): string {
  return `
    <section class="tt-comment-thread" data-todo-comments="${escapeHtml(todoId)}">
      <h4 class="tt-section-title">Comments</h4>
      <div class="tt-comment-list">
        ${comments
          .map(
            (comment) => `
          <article class="tt-comment-item">
            <div class="tt-comment-avatar" aria-hidden="true">${escapeHtml(comment.author.slice(0, 1).toUpperCase() || '?')}</div>
            <div class="tt-comment-content">
              <div class="tt-comment-meta">
                <strong>${escapeHtml(comment.author)}</strong>
                <span>${escapeHtml(formatTimestamp(comment.createdAt))}</span>
              </div>
              <p>${escapeHtml(comment.body)}</p>
            </div>
          </article>
        `,
          )
          .join('')}
      </div>
      <form class="tt-comment-form" data-action="submit-comment" data-todo-id="${escapeHtml(todoId)}">
        <textarea name="body" required placeholder="Add a comment"></textarea>
        <button type="submit">Post</button>
      </form>
    </section>
  `;
}
