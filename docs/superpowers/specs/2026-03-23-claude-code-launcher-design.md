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
- If the configured terminal app is not installed: shows a friendly error message
- If the terminal launch fails: shows an error notification with the failure reason

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
- On command execution (in this order):
  1. Check `vscode.workspace.workspaceFolders` — if undefined or empty: `showErrorMessage("No workspace folder open")` and return immediately
  2. Read `claudeCodeLauncher.terminal` from settings
  3. Resolve workspace root: `workspaceFolders[0].uri.fsPath`
  4. `await launchInTerminal(projectPath, terminalApp)` — this performs the app-existence check
  5. On error (any thrown Error): `vscode.window.showErrorMessage(err.message)`
  6. On success: do nothing

**Evaluation order:** workspace check always runs first, before app-existence check.

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

Before any exec, check that the app is installed using `fs.existsSync`:

| App | Existence sentinel path | Launch resource |
|-----|------------------------|-----------------|
| Terminal.app | `/System/Applications/Utilities/Terminal.app` | `execFile('osascript', ...)` |
| iTerm2 | `/Applications/iTerm.app` (bundle name on disk is `iTerm` — no "2") | `execFile('osascript', ...)` |
| Ghostty | `/Applications/Ghostty.app` | `execFile('/Applications/Ghostty.app/Contents/MacOS/ghostty', ...)` |

If existence check fails: throw `new Error("<AppName> is not installed")`.

---

#### Node.js exec strategy

All launchers use `child_process.execFile` wrapped in a `Promise` (not `child_process.exec`), avoiding a shell-escaping layer:

- Terminal.app and iTerm2: `execFile('osascript', ['-e', scriptString])`
- Ghostty: `execFile(ghosttyBin, ['-e', 'zsh', '-c', shellScript])`

The `-e` flag is the standard POSIX terminal flag to execute a command; Ghostty follows this convention.

---

#### Error callback wrapping (all launchers)

The `execFile` callback receives `(error, stdout, stderr)`. The promise rejects if:

1. **`error` is non-null** (Node.js sets this when the process exits with non-zero code or fails to spawn): reject with `new Error(error.message + (stderr ? '\n' + stderr : ''))`
2. **`error` is null but `stderr` is non-empty and contains `"execution error"` or `"AppleScript"`** — AppleScript launchers only (Terminal.app and iTerm2): reject with `new Error(stderr)`

For Ghostty: only condition 1 applies. Node.js `execFile` sets `error` non-null on any non-zero exit code, so Ghostty process failures are reliably detected. If Ghostty exits 0 but the shell command fails internally, that failure runs inside the terminal window and is not detectable from the extension — this is accepted behavior.

---

#### Path escaping

**AppleScript context (Terminal.app and iTerm2):**
Escape backslashes first, then single quotes:

```ts
function escapeForAppleScript(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
}
```

Embedded as: `cd '${escapeForAppleScript(path)}' && claude`

**Shell context (Ghostty):**
The path is a direct `execFile` argument — no shell layer. Escape only single quotes (do not double backslashes):

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

`do script` opens a new Terminal.app window and runs the command.

---

#### iTerm2 launcher

Uses the AppleScript bundle identifier `com.googlecode.iterm2` instead of the app name to avoid version-specific name resolution issues:

```ts
execFile('osascript', ['-e', `
tell application id "com.googlecode.iterm2"
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

`write text` sends the string followed by a return keystroke. If no window is open, a new window is created before the tab. The existence check path (`/Applications/iTerm.app`) is distinct from the AppleScript bundle ID — both are correct for the same app.

---

#### Ghostty launcher

```ts
const ghosttyBin = '/Applications/Ghostty.app/Contents/MacOS/ghostty';
const shellScript = `cd '${escapeForShell(projectPath)}' && claude; exec $SHELL`;
execFile(ghosttyBin, ['-e', 'zsh', '-c', shellScript]);
```

`-e program args...` is the standard terminal flag; Ghostty follows this convention. The args `zsh`, `-c`, and `shellScript` are passed as separate elements — no extra shell interpolation occurs.

`exec $SHELL` keeps the Ghostty window open after `claude` exits, matching Terminal.app and iTerm2 behavior.

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
  → Check workspaceFolders (error + return if empty)
  → Read config, resolve first workspace path
  → terminal.ts: check app bundle installed (fs.existsSync)
  → terminal.ts: escape path (AppleScript or shell context)
  → Terminal.app / iTerm2: execFile('osascript', ['-e', script])
  → Ghostty: execFile(ghosttyBin, ['-e', 'zsh', '-c', script])
  → Reject on non-zero exit or AppleScript stderr error
  → extension.ts shows error message on rejection
  → On success: silent
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No workspace folder open | `showErrorMessage("No workspace folder open")` — checked first |
| App bundle not installed | `showErrorMessage("<App> is not installed")` |
| execFile non-zero exit / spawn error | `showErrorMessage` with error.message + stderr |
| AppleScript silent error in stderr (Terminal.app, iTerm2 only) | `showErrorMessage` with stderr |
| Single quotes in path | Escaped by `escapeForAppleScript` or `escapeForShell` |
| Backslashes in path | Doubled by `escapeForAppleScript`; unchanged by `escapeForShell` |
| Shell command fails inside Ghostty after clean launch | Not detectable; failure appears in the terminal window |
| Success | Silent — no notification |

---

## Out of Scope

- Windows / Linux support
- Multiple workspace folder selection (always uses first root)
- Auto-installing Claude Code CLI if not found
- Passing additional flags to the `claude` command
