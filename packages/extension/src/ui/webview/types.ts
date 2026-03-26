export interface WebviewChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface WebviewTodo {
  id: string;
  title: string;
  description?: string;
  status: 'open' | 'completed';
  priority: 'low' | 'medium' | 'high';
  createdBy: string;
  assignedTo: string | null;
  labels: string[];
  checklist: WebviewChecklistItem[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface WebviewPresenceUser {
  userId: string;
  username: string;
  avatar?: string;
}

export interface WebviewActivityItem {
  id: string;
  actor: string;
  action: string;
  todoTitle?: string;
  createdAt: number;
}

export interface WebviewCommentItem {
  id: string;
  author: string;
  body: string;
  createdAt: number;
}

export interface ConnectionIndicatorState {
  state: 'connected' | 'reconnecting' | 'disconnected';
  retryInSec?: number;
}
