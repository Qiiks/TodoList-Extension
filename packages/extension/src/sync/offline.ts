import * as vscode from 'vscode';
import * as Y from 'yjs';

export async function loadOfflineDoc(globalStorageUri: vscode.Uri, repoId: string): Promise<Y.Doc> {
  const doc = new Y.Doc();
  const safeRepoId = repoId.replace(/\//g, '_');
  const docUri = vscode.Uri.joinPath(globalStorageUri, `${safeRepoId}.yjs`);

  // Ensure storage directory exists
  try {
    await vscode.workspace.fs.createDirectory(globalStorageUri);
  } catch (e) {
    // Ignore error if it already exists
  }

  try {
    const data = await vscode.workspace.fs.readFile(docUri);
    Y.applyUpdate(doc, data);
  } catch (e) {
    // File likely doesn't exist yet (first run for this repo), start fresh
  }

  // Save on update
  // In a production app, we would debounce this write operation
  doc.on('update', async () => {
    const currentState = Y.encodeStateAsUpdate(doc);
    await vscode.workspace.fs.writeFile(docUri, currentState);
  });

  return doc;
}
