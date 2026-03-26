import { renderTodoItem } from './TodoItem';
import type { WebviewCommentItem, WebviewTodo } from '../types';

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderTodoList(
  todos: WebviewTodo[],
  orderedIds: string[],
  commentByTodoId: Record<string, WebviewCommentItem[]>,
  assigneeOptions: string[],
): string {
  const orderedTodos = orderedIds
    .map((id) => todos.find((todo) => todo.id === id))
    .filter((todo): todo is WebviewTodo => Boolean(todo));

  if (orderedTodos.length === 0) {
    return '<div class="tt-empty-state">No todos yet. Add one above.</div>';
  }

  return `
    <div class="tt-todo-list" data-droppable="todo-list">
      ${orderedTodos
        .map((todo, index) => {
          const comments = commentByTodoId[todo.id] ?? [];
          return `
            <div class="tt-todo-row" tabindex="0" role="listitem" data-order-index="${index}" data-todo-id="${escapeHtml(todo.id)}">
              <span class="tt-drag-handle" title="Drag to reorder" aria-label="Drag handle">⋮⋮</span>
              ${renderTodoItem(todo, comments, assigneeOptions)}
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}
