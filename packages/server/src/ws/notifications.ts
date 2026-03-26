import type { ActivityAction } from '@teamtodo/shared';

export interface NotificationPayload {
  type: 'notification';
  action: ActivityAction;
  actor: string;
  todoTitle?: string;
}

export function createNotification(
  action: ActivityAction,
  actor: string,
  todoTitle?: string,
): NotificationPayload {
  return {
    type: 'notification',
    action,
    actor,
    todoTitle,
  };
}
