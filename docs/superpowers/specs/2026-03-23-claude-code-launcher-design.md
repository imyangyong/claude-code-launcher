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

All errors are thrown as `Error` instances with human-readable messages.

---

#### App existence checks

Before any exec, check that the app is installed:

| App | Existence sentinel path | Launch method |
|-----|------------------------|---------------|
| Terminal.app | `/System/Applications/Utilities/Terminal.app` | `execFile('osascript', ...)` |
| iTerm2 | `/Applications/iTerm.app` | `execFile('osascript', ...)` |
| Ghostty | `/Applications/Ghostty.app` | `execFile('/Applications/Ghostty.app/Contents/MacOS/ghostty', ...)` |

**iTerm2 note:** The app bundle on disk is named `iTerm.app` (no "2"). The AppleScript application name is `"iTerm2"` (with "2"). Both values are correct and intentional — this is not a typo.

If existence check fails: throw `new Error("<AppName> is not installed")`.

---

#### Node.js exec strategy

All launchers use `child_process.execFile` wrapped in a `Promise`, **not** `child_process.exec`. This avoids an extra shell-escaping layer:

- Terminal.app and iTerm2: `execFile('osascript', ['-e', appleScriptString])`
- Ghostty: `execFile(ghosttyBin, ['--command', 'zsh', '--', '-c', shellScript])`

The `appleScriptString` or `shellScript` is a JavaScript string passed directly as an argument — no shell interpolation occurs.

---

#### Error callback wrapping (applies to all three launchers)

The `execFile` callback receives `(error, stdout, stderr)`. The promise rejects if:

1. **`error` is non-null** (non-zero exit or spawn failure): reject with `new Error(error.message + (stderr ? '\n' + stderr : ''))`
2. **`error` is null but `stderr` is non-empty and contains `"execution error"` or `"AppleScript"`** (AppleScript launchers only — Terminal.app and iTerm2): reject with `new Error(stderr)`

For Ghostty: only condition 1 applies (condition 2 is not checked).

---

#### Path escaping

**AppleScript context (Terminal.app and iTerm2):**
The path is embedded inside an AppleScript double-quoted string that contains a shell single-quoted argument. The string is passed directly to `execFile` — no shell layer. Escape backslashes first, then single quotes:

```ts
function escapeForAppleScript(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
}
```

Embedded as: `cd '${escapeForAppleScript(path)}' && claude`

**Shell context (Ghostty):**
The path is embedded in a zsh `-c` script string, passed as a direct `execFile` argument (no shell interpolation). Escape only single quotes — do not double backslashes:

```ts
function escapeForShell(p: string): string {
  return p.replace(/'/g, "'\\''");
}
```

Embedded as: `cd '${escapeForShell(path)}' && claude; exec $SHELL`

---

#### Terminal.app launcher

```ts
execFile('osascript', ['-e', `
tell application "Terminal"
  activate
  do script "cd '${escapeForAppleScript(projectPath)}' && claude"
end tell
`]);
```

`do script` opens a new Terminal window and runs the command.

---

#### iTerm2 launcher

```ts
execFile('osascript', ['-e', `
tell application "iTerm2"
  activate
  if (count of windows) = 0 then
    create window with default profile
  end if
  tell current window
    create tab with default profile
    tell current session of current tab
      write text "cd '${escapeForAppleScript(projectPath)}' && claude"
    end tell
  end tell
end tell
`]);
```

`write text` sends the string followed by a return keystroke. If no window is open, a new window is created before creating a tab.

---

#### Ghostty launcher

Ghostty's `--command` flag sets the shell executable. Arguments after `--` are forwarded to that executable:

```ts
const ghosttyBin = '/Applications/Ghostty.app/Contents/MacOS/ghostty';
const shellScript = `cd '${escapeForShell(projectPath)}' && claude; exec $SHELL`;
execFile(ghosttyBin, ['--command', 'zsh', '--', '-c', shellScript]);
```

`exec $SHELL` is intentional: it keeps the Ghostty window open after `claude` exits, matching the behavior of Terminal.app and iTerm2 which remain open after a command completes.

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
  → terminal.ts checks app is installed (fs.existsSync on bundle path)
  → terminal.ts escapes path (AppleScript or shell context)
  → Terminal.app / iTerm2: execFile('osascript', ['-e', script])
  → Ghostty: execFile(ghosttyBin, ['--command', 'zsh', '--', '-c', script])
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
| execFile non-zero exit / spawn error | `showErrorMessage` with error.message + stderr |
| AppleScript silent error in stderr (Terminal.app, iTerm2 only) | `showErrorMessage` with stderr |
| Single quotes in path | Escaped by `escapeForAppleScript` or `escapeForShell` |
| Backslashes in path | Doubled by `escapeForAppleScript`; unchanged by `escapeForShell` |
| Success | Silent — no notification |

---

## Out of Scope

- Windows / Linux support
- Multiple workspace folder selection (always uses first root)
- Auto-installing Claude Code CLI if not found
- Passing additional flags to the `claude` command
