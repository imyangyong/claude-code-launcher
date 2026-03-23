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
- On success: no notification shown (silent success)
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

Single responsibility per file:
- `extension.ts` owns VSCode lifecycle and wiring
- `terminal.ts` owns the platform-specific launch logic

---

## Components

### extension.ts

- `activate(context)`: registers `claude-code-launcher.openInTerminal` command
- On command execution:
  1. Read `claudeCodeLauncher.terminal` from workspace/user settings
  2. Resolve workspace root: `vscode.workspace.workspaceFolders[0].uri.fsPath` (always the first folder; multi-root is out of scope)
  3. If `workspaceFolders` is undefined or empty: `vscode.window.showErrorMessage("No workspace folder open")` and return
  4. Call `await launchInTerminal(projectPath, terminalApp)`
  5. On error: `vscode.window.showErrorMessage(err.message)`
  6. On success: do nothing (no notification)

### terminal.ts

Exports one function:

```ts
export async function launchInTerminal(
  projectPath: string,
  app: 'Terminal' | 'iTerm2' | 'Ghostty'
): Promise<void>
```

#### App existence checks

Before any exec, each launcher checks whether the app is installed using `fs.existsSync` at its known path:

| App | Check path |
|-----|-----------|
| Terminal.app | `/System/Applications/Utilities/Terminal.app` |
| iTerm2 | `/Applications/iTerm.app` |
| Ghostty | `/Applications/Ghostty.app/Contents/MacOS/ghostty` |

If the path does not exist: throw `new Error("<AppName> is not installed")`.

#### Path escaping for AppleScript (Terminal.app and iTerm2)

Before embedding `projectPath` in an AppleScript single-quoted string, escape single quotes:

```ts
const appleScriptPath = projectPath.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
```

The resulting path is embedded as: `cd '${appleScriptPath}' && claude`

#### Terminal.app launcher

Uses `child_process.exec` to run osascript:

```applescript
tell application "Terminal"
  activate
  do script "cd '<escaped-path>' && claude"
end tell
```

`do script` always opens a new window in Terminal.app.

After exec: if the returned `stderr` is non-empty and contains known AppleScript error patterns (substring `"execution error"` or `"error"`), throw `new Error(stderr)`.

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

`write text` sends the string followed by a return keystroke. If no window is open, a new window is created before creating a tab.

After exec: same silent-failure check as Terminal.app (check stderr for `"execution error"` or `"error"`).

#### Ghostty launcher

Does **not** use AppleScript. Uses `child_process.execFile` directly with the Ghostty binary:

```ts
const ghosttyBin = '/Applications/Ghostty.app/Contents/MacOS/ghostty';
const shellCommand = `cd '${appleScriptPath}' && claude; exec $SHELL`;
// appleScriptPath escaping applies here too — same single-quote escaping rule
execFile(ghosttyBin, ['--command', `zsh -c '${shellCommand}'`]);
```

`exec $SHELL` is intentional: it keeps the Ghostty window open after `claude` exits, matching the behavior of Terminal.app and iTerm2 which remain open after the command completes.

`execFile` is used (not `exec`) to avoid shell injection from the binary path.

Silent-failure check does **not** apply to Ghostty (no AppleScript involved).

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
  → terminal.ts checks app is installed (fs.existsSync)
  → terminal.ts escapes path (single-quote escaping)
  → Terminal.app / iTerm2: child_process.exec runs osascript
  → Ghostty: child_process.execFile runs ghostty binary
  → (Terminal.app / iTerm2: check stderr for silent AppleScript errors)
  → System terminal opens new window/tab, runs: cd '<path>' && claude
  → On success: silent (no notification)
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No workspace folder open | `showErrorMessage("No workspace folder open")` |
| App not installed | `showErrorMessage("<App> is not installed")` |
| exec / execFile non-zero exit | `showErrorMessage` with stderr content |
| AppleScript silent error in stderr (Terminal.app, iTerm2 only) | `showErrorMessage` with stderr content |
| Single quotes in path | Escaped via `replace(/'/g, "'\\''")` before embedding |
| Success | Silent — no notification |

---

## Out of Scope

- Windows / Linux support
- Multiple workspace folder selection (always uses first root)
- Auto-installing Claude Code CLI if not found
- Passing additional flags to the `claude` command
