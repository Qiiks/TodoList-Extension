export type Status = "open" | "completed";
export type Priority = "low" | "medium" | "high";

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Todo {
  id: string;
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  createdBy: string;
  completedBy: string | null;
  assignedTo: string | null;
  labels: string[];
  checklist: ChecklistItem[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type ActivityAction =
  | "todo_created"
  | "todo_completed"
  | "todo_reopened"
  | "todo_deleted"
  | "todo_restored"
  | "todo_edited"
  | "todo_assigned"
  | "todo_reordered"
  | "checklist_item_added"
  | "checklist_item_completed"
  | "comment_added"
  | "label_added"
  | "label_removed"
  | "priority_changed";

export const ACTIVITY_ACTIONS: ActivityAction[] = [
  "todo_created",
  "todo_completed",
  "todo_reopened",
  "todo_deleted",
  "todo_restored",
  "todo_edited",
  "todo_assigned",
  "todo_reordered",
  "checklist_item_added",
  "checklist_item_completed",
  "comment_added",
  "label_added",
  "label_removed",
  "priority_changed",
];

export interface GithubUser {
  id: number;
  login: string;
  avatar_url?: string;
  name?: string;
}
