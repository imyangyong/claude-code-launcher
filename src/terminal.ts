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

function execFilePromise(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    _execFile(bin, args, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(error.message + (stderr ? '\n' + stderr : '')));
        return;
      }
      if (stderr && (stderr.includes('execution error') || stderr.includes('AppleScript'))) {
        reject(new Error(stderr));
        return;
      }
      resolve();
    });
  });
}

async function launchTerminalApp(projectPath: string): Promise<void> {
  const escaped = escapeForAppleScript(projectPath);
  const script = `
tell application "Terminal"
  activate
  do script "cd '${escaped}' && claude"
end tell`;
  await execFilePromise('osascript', ['-e', script]);
}

async function launchITerm2(projectPath: string): Promise<void> {
  const escaped = escapeForAppleScript(projectPath);
  const script = `
tell application id "com.googlecode.iterm2"
  activate
  if (count of windows) = 0 then
    create window with default profile
  end if
  tell current window
    create tab with default profile
    tell current session of current tab
      write text "cd '${escaped}' && claude"
    end tell
  end tell
end tell`;
  await execFilePromise('osascript', ['-e', script]);
}

export async function launchInTerminal(
  projectPath: string,
  app: TerminalApp
): Promise<void> {
  checkInstalled(app);
  switch (app) {
    case 'Terminal':
      return launchTerminalApp(projectPath);
    case 'iTerm2':
      return launchITerm2(projectPath);
    default:
      throw new Error(`Unsupported terminal: ${app}`);
  }
}

export function escapeForAppleScript(p: string): string {
  return p.replace(/'/g, "'\\''");
}

export function escapeForShell(p: string): string {
  return p.replace(/'/g, "'\\''");
}
