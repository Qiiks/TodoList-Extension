export interface SearchFilterState {
  query: string;
  status: 'all' | 'open' | 'completed';
  priority: 'all' | 'low' | 'medium' | 'high';
  label: string;
  assignee: string;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderSearchFilter(state: SearchFilterState, labels: string[], assignees: string[]): string {
  return `
    <section class="tt-search-filter">
      <input
        class="tt-filter-query"
        type="search"
        name="query"
        data-action="filter-change"
        placeholder="Search title"
        value="${escapeHtml(state.query)}"
      />
      <select name="status" data-action="filter-change">
        <option value="all" ${state.status === 'all' ? 'selected' : ''}>All statuses</option>
        <option value="open" ${state.status === 'open' ? 'selected' : ''}>Open</option>
        <option value="completed" ${state.status === 'completed' ? 'selected' : ''}>Completed</option>
      </select>
      <select name="priority" data-action="filter-change">
        <option value="all" ${state.priority === 'all' ? 'selected' : ''}>All priorities</option>
        <option value="low" ${state.priority === 'low' ? 'selected' : ''}>Low</option>
        <option value="medium" ${state.priority === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="high" ${state.priority === 'high' ? 'selected' : ''}>High</option>
      </select>
      <select name="label" data-action="filter-change">
        <option value="">All labels</option>
        ${labels
          .map((label) => `<option value="${escapeHtml(label)}" ${state.label === label ? 'selected' : ''}>${escapeHtml(label)}</option>`)
          .join('')}
      </select>
      <select name="assignee" data-action="filter-change">
        <option value="">All assignees</option>
        <option value="__unassigned" ${state.assignee === '__unassigned' ? 'selected' : ''}>Unassigned</option>
        ${assignees
          .map(
            (assignee) =>
              `<option value="${escapeHtml(assignee)}" ${state.assignee === assignee ? 'selected' : ''}>${escapeHtml(assignee)}</option>`,
          )
          .join('')}
      </select>
    </section>
  `;
}
