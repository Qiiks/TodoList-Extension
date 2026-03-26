import * as vscode from 'vscode';
import { TeamTodoProvider } from './ui/panel';

export function activate(context: vscode.ExtensionContext) {
  const provider = new TeamTodoProvider(context);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('teamtodo.webview', provider));

  context.subscriptions.push(
    vscode.commands.registerCommand('teamtodo.addTodo', () => {
      void provider.focusQuickAdd();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('teamtodo.toggleShowCompleted', () => {
      provider.toggleShowCompleted();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('teamtodo.signIn', () => {
      void provider.signInInteractive();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('teamtodo.signOut', () => {
      void provider.signOut();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('teamtodo.switchRepository', () => {
      void provider.switchRepositoryInteractive();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('teamtodo.exportMarkdown', () => {
      void provider.exportMarkdown();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('teamtodo.refresh', () => {
      void provider.refreshAll();
    }),
  );
}

export function deactivate() {}
