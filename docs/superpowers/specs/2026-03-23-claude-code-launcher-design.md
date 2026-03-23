# claude-code-launcher VSCode Extension — Design Spec

**Date:** 2026-03-23
**Status:** Approved

---

## Overview

A VSCode extension named `claude-code-launcher` that provides a single command to open the current project in a system terminal and automatically run the Claude Code CLI (`claude`).

---

## Requirements

- One command: `claude-code-launcher.openInTerminal` ("Open in Terminal")
- Accessible via Command Palette (`Cmd+Shift+P`) and right-click context menus (editor + explorer)
- Supports three macOS terminals: Terminal.app, iTerm2, Ghostty
- User selects terminal via VS Code Settings
- On activation: opens the selected terminal, `cd` to the workspace root, and runs `claude`
- On success: silent (no notification)
- If no workspace is open: shows an error notification
- If the terminal launch fails: shows an error notification with the failure reason
- If the configured terminal app is not installed: shows a friendly error message

---

## Architecture

```
src/
  extension.ts     — activation, command registration, config reading
  terminal.ts      — terminal launch logic for each supported app
package.json       — contributes command, context menus, configuration schema
```

---

## Components

### extension.ts

- `activate(context)`: registers `claude-code-launcher.openInTerminal` command
- On command execution:
  1. Read `claudeCodeLauncher.terminal` from workspace/user settings
  2. Resolve workspace root: `vscode.workspace.workspaceFolders[0].uri.fsPath` (always the first folder; multi-root is out of scope)
  3. If `workspaceFolders` is undefined or empty: `vscode.window.showErrorMessage("No workspace folder open")` and return
  4. `await launchInTerminal(projectPath, terminalApp)`
  5. On error (any thrown Error): `vscode.window.showErrorMessage(err.message)`
  6. On success: do nothing (no notification)

### terminal.ts

Exports one function:

```ts
export async function launchInTerminal(
  projectPath: string,
  app: 'Terminal' | 'iTerm2' | 'Ghostty'
): Promise<void>
```

All errors from this function are thrown as `Error` instances with human-readable messages.

---

#### App existence checks

Before any exec, check that the app is installed. Use separate sentinel paths for the existence check vs. the binary to execute:

| App | Existence check path | Binary / app used for launch |
|-----|---------------------|-------------------------------|
| Terminal.app | `/System/Applications/Utilities/Terminal.app` | via osascript |
| iTerm2 | `/Applications/iTerm.app` (bundle name on disk is `iTerm`, AppleScript name is `"iTerm2"` — this discrepancy is intentional and correct) | via osascript |
| Ghostty | `/Applications/Ghostty.app` (`.app` bundle) | `/Applications/Ghostty.app/Contents/MacOS/ghostty` (binary inside bundle) |

If existence check fails: throw `new Error("<AppName> is not installed")`.

---

#### Path escaping

Two separate escaping strategies are used depending on context:

**AppleScript context (Terminal.app and iTerm2):**
The path is embedded inside a double-quoted AppleScript string, which in turn contains a single-quoted shell argument. Escape backslashes first, then single quotes:

```ts
function escapeForAppleScript(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
}
```

Result is embedded as: `cd '${escapeForAppleScript(path)}' && claude`

**execFile context (Ghostty):**
The path is passed as a direct element in the `args` array to `child_process.execFile` — no shell or AppleScript interpolation occurs. The path is embedded inside a zsh single-quoted string within the `-c` script argument. Escape only single quotes (backslash doubling is NOT applied):

```ts
function escapeForShell(p: string): string {
  return p.replace(/'/g, "'\\''");
}
```

Result is embedded as: `cd '${escapeForShell(path)}' && claude; exec $SHELL`

---

#### Error callback wrapping

Both `child_process.exec` and `child_process.execFile` are wrapped in a `Promise`. The Node.js callback receives `(error, stdout, stderr)`. The promise rejects if:
- `error` is non-null (non-zero exit code or spawn failure): reject with `Error(error.message + '\n' + stderr)`
- `error` is null but `stderr` contains `"execution error"` or `"AppleScript"` (AppleScript-only): reject with `Error(stderr)`

---

#### Terminal.app launcher

Uses `child_process.exec` to run osascript. The AppleScript must be a properly structured block:

```applescript
tell application "Terminal"
  activate
  do script "cd '<escaped-path>' && claude"
end tell
```

Passed to `exec` as: `osascript -e '<the above as a single escaped string>'`

Or passed as a heredoc / multi-line string using `osascript -e` repeated calls or a temp script file. The simplest approach: pass the script as a single `-e` argument with embedded newlines.

After exec: apply silent-failure stderr check (see error callback wrapping above).

---

#### iTerm2 launcher

Uses `child_process.exec` to run osascript:

```applescript
tell application "iTerm2"
  activate
  if (count of windows) = 0 then
    create window with default profile
  end if
  tell current window
    create tab with default profile
    tell current session of current tab
      write text "cd '<escaped-path>' && claude"
    end tell
  end tell
end tell
```

`write text` sends the string followed by a return keystroke, executing the command. If no window is open, a new window is created before creating a tab. The bundle on disk is `iTerm.app`; the AppleScript application name is `"iTerm2"` — both are correct.

After exec: apply silent-failure stderr check (see error callback wrapping above).

---

#### Ghostty launcher

Uses `child_process.execFile` (not `exec`) to avoid shell injection:

```ts
const ghosttyBin = '/Applications/Ghostty.app/Contents/MacOS/ghostty';
const shellScript = `cd '${escapeForShell(projectPath)}' && claude; exec $SHELL`;
// args: ['--command', 'zsh', '-c', shellScript]
// Ghostty interprets: --command <program> [args...], so 'zsh' is the program,
// '-c' and shellScript are its arguments.
execFile(ghosttyBin, ['--command', 'zsh', '-c', shellScript]);
```

`exec $SHELL` is intentional: it keeps the Ghostty window open after `claude` exits, consistent with how Terminal.app and iTerm2 remain open after a command completes.

No silent-failure stderr check for Ghostty (AppleScript not involved). Only the standard error-callback check applies.

---

### Configuration (package.json)

```json
"contributes": {
  "configuration": {
    "title": "Claude Code Launcher",
    "properties": {
      "claudeCodeLauncher.terminal": {
        "type": "string",
        "enum": ["Terminal", "iTerm2", "Ghostty"],
        "default": "Terminal",
        "description": "The system terminal application to use when opening Claude Code."
      }
    }
  },
  "commands": [
    {
      "command": "claude-code-launcher.openInTerminal",
      "title": "Open in Terminal (Claude Code)"
    }
  ],
  "menus": {
    "editor/context": [
      { "command": "claude-code-launcher.openInTerminal", "group": "navigation" }
    ],
    "explorer/context": [
      { "command": "claude-code-launcher.openInTerminal", "group": "navigation" }
    ],
    "commandPalette": [
      { "command": "claude-code-launcher.openInTerminal" }
    ]
  }
}
```

---

## Data Flow

```
User triggers command
  → extension.ts reads config + workspace path (first folder)
  → terminal.ts checks app is installed (fs.existsSync on bundle/binary path)
  → terminal.ts escapes path (AppleScript or shell context)
  → Terminal.app / iTerm2: child_process.exec runs osascript
  → Ghostty: child_process.execFile runs ghostty binary with ['--command', 'zsh', '-c', script]
  → Promise rejects on non-zero exit or AppleScript stderr error
  → extension.ts shows error message on rejection
  → On success: silent
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No workspace folder open | `showErrorMessage("No workspace folder open")` |
| App bundle not installed | `showErrorMessage("<App> is not installed")` |
| exec/execFile non-zero exit | `showErrorMessage` with error.message + stderr |
| AppleScript silent error in stderr (Terminal.app, iTerm2 only) | `showErrorMessage` with stderr |
| Single quotes in path | `escapeForAppleScript` or `escapeForShell` applied before embedding |
| Backslashes in path | `escapeForAppleScript` doubles them; `escapeForShell` leaves them unchanged |
| Success | Silent — no notification |

---

## Out of Scope

- Windows / Linux support
- Multiple workspace folder selection (always uses first root)
- Auto-installing Claude Code CLI if not found
- Passing additional flags to the `claude` command
