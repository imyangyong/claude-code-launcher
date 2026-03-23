import * as vscode from 'vscode';
import { launchInTerminal, TerminalApp } from './terminal';

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand(
    'claude-code-launcher.openInTerminal',
    async () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const config = vscode.workspace.getConfiguration('claudeCodeLauncher');
      const terminal = (config.get('terminal') ?? 'Terminal') as TerminalApp;
      const projectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

      try {
        await launchInTerminal(projectPath, terminal);
      } catch (err) {
        vscode.window.showErrorMessage((err as Error).message);
      }
    }
  );

  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
