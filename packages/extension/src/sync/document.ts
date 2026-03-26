import * as Y from 'yjs';
import type { Priority, Status, Todo } from '@teamtodo/shared';
import { todoSchema } from '@teamtodo/shared';

export interface TodoInput {
  id: string;
  title: string;
  description?: string;
  priority?: Priority;
  createdBy: string;
  assignedTo?: string | null;
  labels?: string[];
}

export interface ChecklistInput {
  id: string;
  text: string;
  completed?: boolean;
}

function now(): number {
  return Date.now();
}

function getTodos(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('todos');
}

function getOrder(doc: Y.Doc): Y.Array<string> {
  return doc.getArray<string>('todoOrder');
}

function getLabelsArray(todo: Y.Map<unknown>): Y.Array<string> {
  const existing = todo.get('labels');
  if (existing instanceof Y.Array) {
    return existing as Y.Array<string>;
  }
  const labels = new Y.Array<string>();
  todo.set('labels', labels);
  return labels;
}

function getChecklistArray(todo: Y.Map<unknown>): Y.Array<Y.Map<unknown>> {
  const existing = todo.get('checklist');
  if (existing instanceof Y.Array) {
    return existing as Y.Array<Y.Map<unknown>>;
  }
  const checklist = new Y.Array<Y.Map<unknown>>();
  todo.set('checklist', checklist);
  return checklist;
}

function cloneLabels(todo: Y.Map<unknown>): string[] {
  return getLabelsArray(todo).toArray().filter((label): label is string => typeof label === 'string');
}

function cloneChecklist(todo: Y.Map<unknown>): Array<{ id: string; text: string; completed: boolean }> {
  return getChecklistArray(todo)
    .toArray()
    .map((item) => {
      if (!(item instanceof Y.Map)) {
        return null;
      }
      const id = item.get('id');
      const text = item.get('text');
      const completed = item.get('completed');
      if (typeof id !== 'string' || typeof text !== 'string' || typeof completed !== 'boolean') {
        return null;
      }
      return { id, text, completed };
    })
    .filter((item): item is { id: string; text: string; completed: boolean } => item !== null);
}

function normalizeStatus(value: unknown): Status {
  return value === 'completed' ? 'completed' : 'open';
}

function normalizePriority(value: unknown): Priority {
  if (value === 'low' || value === 'high') {
    return value;
  }
  return 'medium';
}

function todoSchemaInput(todo: Y.Map<unknown>) {
  const description = todo.get('description');
  return {
    title: typeof todo.get('title') === 'string' ? (todo.get('title') as string) : '',
    description: typeof description === 'string' && description.length > 0 ? description : undefined,
    status: normalizeStatus(todo.get('status')),
    priority: normalizePriority(todo.get('priority')),
    labels: cloneLabels(todo),
    checklist: cloneChecklist(todo),
  };
}

function validateTodo(todo: Y.Map<unknown>): boolean {
  return todoSchema.safeParse(todoSchemaInput(todo)).success;
}

function toTodo(todo: Y.Map<unknown>): Todo | null {
  const id = todo.get('id');
  const title = todo.get('title');
  const createdBy = todo.get('createdBy');
  if (typeof id !== 'string' || typeof title !== 'string' || typeof createdBy !== 'string') {
    return null;
  }

  const parsed = todoSchema.safeParse(todoSchemaInput(todo));
  if (!parsed.success) {
    return null;
  }

  return {
    id,
    title: parsed.data.title,
    description: parsed.data.description,
    status: parsed.data.status,
    priority: parsed.data.priority,
    createdBy,
    completedBy: typeof todo.get('completedBy') === 'string' ? (todo.get('completedBy') as string) : null,
    assignedTo: typeof todo.get('assignedTo') === 'string' ? (todo.get('assignedTo') as string) : null,
    labels: parsed.data.labels,
    checklist: parsed.data.checklist,
    createdAt: typeof todo.get('createdAt') === 'number' ? (todo.get('createdAt') as number) : now(),
    updatedAt: typeof todo.get('updatedAt') === 'number' ? (todo.get('updatedAt') as number) : now(),
    deletedAt: typeof todo.get('deletedAt') === 'number' ? (todo.get('deletedAt') as number) : null,
  };
}

export function getTodoMap(doc: Y.Doc, id: string): Y.Map<unknown> | null {
  const map = getTodos(doc).get(id);
  return map instanceof Y.Map ? map : null;
}

export function getTodosInOrder(doc: Y.Doc): Todo[] {
  const todos = getTodos(doc);
  const ordered = getOrder(doc)
    .toArray()
    .map((id) => {
      const value = todos.get(id);
      if (!(value instanceof Y.Map)) {
        return null;
      }
      return toTodo(value);
    })
    .filter((todo): todo is Todo => Boolean(todo));

  if (ordered.length > 0) {
    return ordered;
  }

  return Array.from(todos.values())
    .map((value) => (value instanceof Y.Map ? toTodo(value) : null))
    .filter((todo): todo is Todo => Boolean(todo));
}

export function addTodo(doc: Y.Doc, input: TodoInput): boolean {
  const parsed = todoSchema.safeParse({
    title: input.title,
    description: input.description,
    status: 'open',
    priority: input.priority ?? 'medium',
    labels: input.labels ?? [],
    checklist: [],
  });

  if (!parsed.success) {
    return false;
  }

  const todos = getTodos(doc);
  if (todos.has(input.id)) {
    return false;
  }

  const timestamp = now();
  const labels = new Y.Array<string>();
  if (parsed.data.labels.length > 0) {
    labels.push(parsed.data.labels);
  }
  const checklist = new Y.Array<Y.Map<unknown>>();

  const todo = new Y.Map<unknown>();
  todo.set('id', input.id);
  todo.set('title', parsed.data.title);
  todo.set('description', parsed.data.description ?? '');
  todo.set('status', parsed.data.status);
  todo.set('priority', parsed.data.priority);
  todo.set('createdBy', input.createdBy);
  todo.set('completedBy', null);
  todo.set('assignedTo', input.assignedTo ?? null);
  todo.set('labels', labels);
  todo.set('checklist', checklist);
  todo.set('createdAt', timestamp);
  todo.set('updatedAt', timestamp);
  todo.set('deletedAt', null);

  todos.set(input.id, todo);
  getOrder(doc).push([input.id]);
  return true;
}

export function toggleTodo(doc: Y.Doc, id: string): boolean {
  const todo = getTodoMap(doc, id);
  if (!todo || !validateTodo(todo)) {
    return false;
  }

  const nextStatus: Status = todo.get('status') === 'completed' ? 'open' : 'completed';
  const candidate = {
    ...todoSchemaInput(todo),
    status: nextStatus,
  };

  if (!todoSchema.safeParse(candidate).success) {
    return false;
  }

  todo.set('status', nextStatus);
  todo.set('completedBy', nextStatus === 'completed' ? (todo.get('createdBy') as string) : null);
  todo.set('updatedAt', now());
  return true;
}

export function reorderTodo(doc: Y.Doc, from: number, to: number): boolean {
  const order = getOrder(doc);
  const items = order.toArray();
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) {
    return false;
  }
  const [moved] = items.splice(from, 1);
  if (!moved) {
    return false;
  }
  items.splice(to, 0, moved);
  order.delete(0, order.length);
  order.push(items);
  return true;
}

export function updateChecklistItem(doc: Y.Doc, todoId: string, checklistId: string, completed: boolean): boolean {
  const todo = getTodoMap(doc, todoId);
  if (!todo || !validateTodo(todo)) {
    return false;
  }
  const checklist = getChecklistArray(todo);
  const items = checklist.toArray();
  const index = items.findIndex((item) => item instanceof Y.Map && item.get('id') === checklistId);
  if (index < 0) {
    return false;
  }

  const item = items[index] as Y.Map<unknown>;
  const previous = item.get('completed');
  item.set('completed', completed);

  if (!validateTodo(todo)) {
    item.set('completed', previous);
    return false;
  }

  todo.set('updatedAt', now());
  return true;
}

export function addChecklistItem(doc: Y.Doc, todoId: string, item: ChecklistInput): boolean {
  const todo = getTodoMap(doc, todoId);
  if (!todo || !validateTodo(todo)) {
    return false;
  }

  const checklist = getChecklistArray(todo);
  const next = new Y.Map<unknown>();
  next.set('id', item.id);
  next.set('text', item.text);
  next.set('completed', item.completed ?? false);
  checklist.push([next]);

  if (!validateTodo(todo)) {
    checklist.delete(checklist.length - 1, 1);
    return false;
  }

  todo.set('updatedAt', now());
  return true;
}

export function setTodoDescription(doc: Y.Doc, todoId: string, description: string): boolean {
  const todo = getTodoMap(doc, todoId);
  if (!todo || !validateTodo(todo)) {
    return false;
  }

  const previous = todo.get('description');
  todo.set('description', description);

  if (!validateTodo(todo)) {
    todo.set('description', previous);
    return false;
  }

  todo.set('updatedAt', now());
  return true;
}

export function setTodoPriority(doc: Y.Doc, todoId: string, priority: Priority): boolean {
  const todo = getTodoMap(doc, todoId);
  if (!todo || !validateTodo(todo)) {
    return false;
  }

  const previous = todo.get('priority');
  todo.set('priority', priority);
  if (!validateTodo(todo)) {
    todo.set('priority', previous);
    return false;
  }
  todo.set('updatedAt', now());
  return true;
}

export function setTodoLabels(doc: Y.Doc, todoId: string, labels: string[]): boolean {
  const todo = getTodoMap(doc, todoId);
  if (!todo || !validateTodo(todo)) {
    return false;
  }

  const labelsArray = getLabelsArray(todo);
  const previous = labelsArray.toArray();
  labelsArray.delete(0, labelsArray.length);
  if (labels.length > 0) {
    labelsArray.push(labels);
  }

  if (!validateTodo(todo)) {
    labelsArray.delete(0, labelsArray.length);
    if (previous.length > 0) {
      labelsArray.push(previous);
    }
    return false;
  }

  todo.set('updatedAt', now());
  return true;
}

export function setTodoAssignee(doc: Y.Doc, todoId: string, assignee: string | null): boolean {
  const todo = getTodoMap(doc, todoId);
  if (!todo || !validateTodo(todo)) {
    return false;
  }
  todo.set('assignedTo', assignee && assignee.length > 0 ? assignee : null);
  todo.set('updatedAt', now());
  return true;
}

export function deleteTodo(doc: Y.Doc, todoId: string): boolean {
  const todo = getTodoMap(doc, todoId);
  if (!todo) {
    return false;
  }
  todo.set('deletedAt', now());
  todo.set('updatedAt', now());
  return true;
}
