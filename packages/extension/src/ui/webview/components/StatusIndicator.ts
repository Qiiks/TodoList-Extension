import type { ConnectionIndicatorState } from '../types';

export function renderStatusIndicator(state: ConnectionIndicatorState): string {
  if (state.state === 'connected') {
    return '<div class="tt-status-indicator tt-status-indicator--connected"><span>🟢 Connected</span></div>';
  }
  if (state.state === 'reconnecting') {
    return '<div class="tt-status-indicator tt-status-indicator--reconnecting"><span>🟡 Reconnecting…</span></div>';
  }
  const retryText = typeof state.retryInSec === 'number' ? ` Retrying in ${state.retryInSec}s...` : '';
  return `
    <div class="tt-status-indicator tt-status-indicator--disconnected">
      <span>🔴 Disconnected —${retryText}</span>
      <button class="tt-status-retry" type="button" data-action="retry-now">Retry now</button>
    </div>
  `;
}
