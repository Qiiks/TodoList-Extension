import { renderChecklistItem } from './ChecklistItem';
import { renderCommentThread } from './CommentThread';
import type { WebviewCommentItem, WebviewTodo } from '../types';

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function checklistProgress(todo: WebviewTodo): string {
  const total = todo.checklist.length;
  const done = todo.checklist.filter((item) => item.completed).length;
  return `${done}/${total}`;
}

function relativeTime(epochMs: number): string {
  const deltaMs = Date.now() - epochMs;
  const deltaSec = Math.max(1, Math.floor(deltaMs / 1000));
  if (deltaSec < 60) {
    return `${deltaSec}s ago`;
  }
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) {
    return `${deltaMin}m ago`;
  }
  const deltaHour = Math.floor(deltaMin / 60);
  if (deltaHour < 24) {
    return `${deltaHour}h ago`;
  }
  const deltaDay = Math.floor(deltaHour / 24);
  return `${deltaDay}d ago`;
}

function priorityClass(priority: WebviewTodo['priority']): string {
  return `tt-priority tt-priority--${priority}`;
}

export function renderTodoItem(todo: WebviewTodo, comments: WebviewCommentItem[], assigneeOptions: string[]): string {
  const assignedText = todo.assignedTo ?? 'Unassigned';
  const description = todo.description?.trim() ?? '';
  const createdAgo = relativeTime(todo.createdAt);

  return `
    <article class="tt-todo-item" draggable="true" data-todo-id="${escapeHtml(todo.id)}">
      <header class="tt-todo-header">
        <div class="tt-todo-left">
          <button class="tt-expand-btn" data-action="toggle-expand" data-todo-id="${escapeHtml(todo.id)}" type="button" aria-label="Expand todo">▸</button>
          <input type="checkbox" data-action="toggle-todo" data-todo-id="${escapeHtml(todo.id)}" ${todo.status === 'completed' ? 'checked' : ''} />
          <span class="tt-todo-title">${escapeHtml(todo.title)}</span>
        </div>
        <div class="tt-todo-meta">
          <span class="tt-status-badge tt-status-badge--${escapeHtml(todo.status)}">${escapeHtml(todo.status)}</span>
          <span class="${priorityClass(todo.priority)}" aria-label="Priority ${escapeHtml(todo.priority)}"></span>
          <span class="tt-avatar" title="Assignee">${escapeHtml(assignedText.slice(0, 1).toUpperCase() || '?')}</span>
          <span class="tt-assignee">${escapeHtml(assignedText)}</span>
          <span class="tt-check-progress">Checklist ${escapeHtml(checklistProgress(todo))}</span>
        </div>
      </header>
      <div class="tt-labels">
        ${todo.labels.map((label) => `<span class="tt-label-chip">${escapeHtml(label)}</span>`).join('')}
      </div>
      <section class="tt-todo-expanded" hidden data-todo-expanded="${escapeHtml(todo.id)}">
        <label class="tt-field-row">
          <span>Description (markdown)</span>
          <textarea class="tt-description-input" data-action="set-description" data-todo-id="${escapeHtml(todo.id)}" rows="3">${escapeHtml(description)}</textarea>
        </label>
        <div class="tt-description-rendered" data-md-rendered="${escapeHtml(todo.id)}">${escapeHtml(description || 'No description')}</div>
        <label class="tt-field-row">
          <span>Priority</span>
          <select data-action="set-priority" data-todo-id="${escapeHtml(todo.id)}">
            <option value="low" ${todo.priority === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${todo.priority === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${todo.priority === 'high' ? 'selected' : ''}>High</option>
          </select>
        </label>
        <label class="tt-field-row">
          <span>Labels (comma separated)</span>
          <input type="text" data-action="set-labels" data-todo-id="${escapeHtml(todo.id)}" value="${escapeHtml(todo.labels.join(', '))}" />
        </label>
        <label class="tt-field-row">
          <span>Assignee</span>
          <select data-action="set-assignee" data-todo-id="${escapeHtml(todo.id)}">
            <option value="">Unassigned</option>
            ${assigneeOptions
              .map(
                (assignee) =>
                  `<option value="${escapeHtml(assignee)}" ${todo.assignedTo === assignee ? 'selected' : ''}>${escapeHtml(assignee)}</option>`,
              )
              .join('')}
          </select>
        </label>
        <div class="tt-checklist-add-row">
          <input type="text" data-checklist-input="${escapeHtml(todo.id)}" placeholder="New checklist item" />
          <button type="button" data-action="add-checklist-item" data-todo-id="${escapeHtml(todo.id)}">Add item</button>
        </div>
        <div class="tt-checklist">
          ${todo.checklist.map((item) => renderChecklistItem(todo.id, item)).join('')}
        </div>
        <div class="tt-metadata">Created by ${escapeHtml(todo.createdBy)} · ${escapeHtml(createdAgo)}</div>
        <button type="button" class="tt-delete-btn" data-action="delete-todo" data-todo-id="${escapeHtml(todo.id)}">Delete</button>
        ${renderCommentThread(todo.id, comments)}
      </section>
    </article>
  `;
}
