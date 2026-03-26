import type { WebviewChecklistItem } from '../types';

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderChecklistItem(todoId: string, item: WebviewChecklistItem): string {
  const completedClass = item.completed ? 'tt-check-item--done' : '';
  return `
    <label class="tt-check-item ${completedClass}">
      <input
        class="tt-check-toggle"
        data-action="toggle-checklist-item"
        data-todo-id="${escapeHtml(todoId)}"
        data-checklist-id="${escapeHtml(item.id)}"
        type="checkbox"
        ${item.completed ? 'checked' : ''}
      />
      <span class="tt-check-text">${escapeHtml(item.text)}</span>
    </label>
  `;
}
