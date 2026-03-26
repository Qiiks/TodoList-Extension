import * as Y from 'yjs';
import { db } from '../db/client';
import { todosProjection } from '../db/schema';
import { and, eq } from 'drizzle-orm';

export function extractTodosFromDoc(repoId: string, ydoc: Y.Doc) {
  const todosMap = ydoc.getMap('todos');
  const todoOrder = ydoc.getArray('todoOrder').toArray() as string[];

  return todoOrder
    .map((id, position) => {
      const todo = todosMap.get(id) as Y.Map<unknown> | undefined;
      if (!todo) {
        return null;
      }

      const labels = todo.get('labels');
      const labelsArray = labels instanceof Y.Array ? labels.toArray() : [];

      return {
        id: String(todo.get('id') ?? id),
        repoId,
        title: String(todo.get('title') ?? ''),
        description: todo.get('description') ? String(todo.get('description')) : null,
        status: String(todo.get('status') ?? 'open'),
        priority: String(todo.get('priority') ?? 'medium'),
        createdBy: String(todo.get('createdBy') ?? 'unknown'),
        completedBy: todo.get('completedBy') ? String(todo.get('completedBy')) : null,
        assignedTo: todo.get('assignedTo') ? String(todo.get('assignedTo')) : null,
        labels: labelsArray,
        position,
        createdAt: todo.get('createdAt') ? new Date(Number(todo.get('createdAt'))) : null,
        updatedAt: todo.get('updatedAt') ? new Date(Number(todo.get('updatedAt'))) : null,
        deletedAt: todo.get('deletedAt') ? new Date(Number(todo.get('deletedAt'))) : null,
      };
    })
    .filter((todo): todo is NonNullable<typeof todo> => Boolean(todo));
}

export async function syncProjection(repoId: string, ydoc: Y.Doc) {
  const projected = extractTodosFromDoc(repoId, ydoc);
  const projectedIds = projected.map((todo) => todo.id);

  if (projectedIds.length === 0) {
    await db.delete(todosProjection).where(eq(todosProjection.repoId, repoId));
    return;
  }

  for (const todo of projected) {
    await db
      .insert(todosProjection)
      .values(todo)
      .onConflictDoUpdate({
        target: todosProjection.id,
        set: todo,
      });
  }

  const existing = await db.select({ id: todosProjection.id }).from(todosProjection).where(eq(todosProjection.repoId, repoId));
  for (const row of existing) {
    if (!projectedIds.includes(row.id)) {
      await db.delete(todosProjection).where(and(eq(todosProjection.repoId, repoId), eq(todosProjection.id, row.id)));
    }
  }
}
