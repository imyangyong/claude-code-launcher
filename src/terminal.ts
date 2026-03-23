export type TerminalApp = 'Terminal' | 'iTerm2' | 'Ghostty';

export function escapeForAppleScript(p: string): string {
  return p.replace(/'/g, "'\\''");
}

export function escapeForShell(p: string): string {
  return p.replace(/'/g, "'\\''");
}
