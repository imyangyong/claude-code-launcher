import * as fs from 'fs';
import { execFile as _execFile } from 'child_process';

export type TerminalApp = 'Terminal' | 'iTerm2' | 'Ghostty';

const APP_PATHS: Record<TerminalApp, string> = {
  Terminal: '/System/Applications/Utilities/Terminal.app',
  iTerm2: '/Applications/iTerm.app',
  Ghostty: '/Applications/Ghostty.app'
};

function checkInstalled(app: TerminalApp): void {
  if (!fs.existsSync(APP_PATHS[app])) {
    throw new Error(`${app} is not installed`);
  }
}

export async function launchInTerminal(
  projectPath: string,
  app: TerminalApp
): Promise<void> {
  checkInstalled(app);
  // launchers added in subsequent tasks
}

export function escapeForAppleScript(p: string): string {
  return p.replace(/'/g, "'\\''");
}

export function escapeForShell(p: string): string {
  return p.replace(/'/g, "'\\''");
}
