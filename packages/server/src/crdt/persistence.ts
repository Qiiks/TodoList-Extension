import * as Y from 'yjs';
import { db } from '../db/client';
import { crdtDocuments, todosProjection } from '../db/schema';
import { eq } from 'drizzle-orm';
// @ts-ignore
import { setPersistence } from 'y-websocket/bin/utils';

export function setupPersistence() {
  setPersistence({
    bindState: async (docName: string, ydoc: Y.Doc) => {
      try {
        const record = await db.query.crdtDocuments.findFirst({
          where: eq(crdtDocuments.repoId, docName)
        });
        if (record && record.document) {
          // Depending on the driver, it may return the Buffer directly or wrapped in an object
          const docBuffer = (record.document as any).data || record.document;
          Y.applyUpdate(ydoc, new Uint8Array(docBuffer));
        }
      } catch (err) {
        console.error(`Failed to bind state for ${docName}:`, err);
      }
    },
    writeState: async (docName: string, ydoc: Y.Doc) => {
      try {
        const stateVector = Y.encodeStateVector(ydoc);
        const documentUpdate = Y.encodeStateAsUpdate(ydoc);

        await db.insert(crdtDocuments).values({
          repoId: docName,
          stateVector: Buffer.from(stateVector),
          document: Buffer.from(documentUpdate),
          updatedAt: new Date()
        }).onConflictDoUpdate({
          target: crdtDocuments.repoId,
          set: {
            stateVector: Buffer.from(stateVector),
            document: Buffer.from(documentUpdate),
            updatedAt: new Date()
          }
        });

        await projectTodos(docName, ydoc);
      } catch (err) {
        console.error(`Failed to write state for ${docName}:`, err);
      }
    }
  });
}

async function projectTodos(repoId: string, ydoc: Y.Doc) {
  const todosMap = ydoc.getMap('todos');
  const todoOrder = ydoc.getArray('todoOrder').toArray();

  const toUpsert = [];
  for (let i = 0; i < todoOrder.length; i++) {
    const id = todoOrder[i] as string;
    const todo = todosMap.get(id) as Y.Map<any>;
    if (!todo) continue;

    toUpsert.push({
      id: todo.get('id'),
      repoId,
      title: todo.get('title'),
      description: todo.get('description'),
      status: todo.get('status') || 'open',
      priority: todo.get('priority') || 'medium',
      createdBy: todo.get('createdBy') || 'system',
      completedBy: todo.get('completedBy') || null,
      assignedTo: todo.get('assignedTo') || null,
      labels: todo.get('labels')?.toArray() || [],
      position: i,
      createdAt: todo.get('createdAt') ? new Date(todo.get('createdAt')) : new Date(),
      updatedAt: todo.get('updatedAt') ? new Date(todo.get('updatedAt')) : new Date(),
      deletedAt: todo.get('deletedAt') ? new Date(todo.get('deletedAt')) : null,
    });
  }

  if (toUpsert.length > 0) {
    for (const item of toUpsert) {
      await db.insert(todosProjection).values(item).onConflictDoUpdate({
        target: todosProjection.id,
        set: item
      });
    }
  }
}
