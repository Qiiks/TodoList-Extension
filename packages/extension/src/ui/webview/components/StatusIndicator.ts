import type { ConnectionIndicatorState } from '../types';

export function renderStatusIndicator(state: ConnectionIndicatorState): string {
  if (state.state === 'connected') {
    return '<div class="tt-status-indicator tt-status-indicator--connected">🟢 Connected</div>';
  }
  if (state.state === 'reconnecting') {
    return '<div class="tt-status-indicator tt-status-indicator--reconnecting">🟡 Reconnecting...</div>';
  }
  const retryText = typeof state.retryInSec === 'number' ? ` Retrying in ${state.retryInSec}s...` : '';
  return `
    <div class="tt-status-indicator tt-status-indicator--disconnected">
      🔴 Disconnected —${retryText}
      <button type="button" data-action="retry-now">Retry Now</button>
    </div>
  `;
}
