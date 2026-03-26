function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderQuickAdd(defaultPriority: 'low' | 'medium' | 'high' = 'medium'): string {
  return `
    <form class="tt-quick-add" data-action="quick-add">
      <div class="tt-quick-add-grid">
        <textarea
          class="tt-quick-add-input"
          name="title"
          placeholder="Add a todo..."
          autocomplete="off"
          aria-label="Quick add todo"
          rows="1"
        ></textarea>
        <select class="tt-quick-add-priority" name="priority" aria-label="Priority">
          <option value="low" ${defaultPriority === 'low' ? 'selected' : ''}>Low</option>
          <option value="medium" ${defaultPriority === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="high" ${defaultPriority === 'high' ? 'selected' : ''}>High</option>
        </select>
        <button class="tt-quick-add-submit" type="submit">Add</button>
      </div>
      <small class="tt-quick-add-hint">${escapeHtml('Enter to submit · Shift+Enter for line break')}</small>
    </form>
  `;
}
