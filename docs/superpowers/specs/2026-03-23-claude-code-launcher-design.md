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
- If no workspace is open: shows an error notification
- If the terminal launch fails: shows an error notification with the failure reason

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
  2. Resolve workspace root via `vscode.workspace.workspaceFolders[0].uri.fsPath`
  3. If no workspace: `vscode.window.showErrorMessage("No workspace folder open")`
  4. Otherwise: call `launchInTerminal(projectPath, terminalApp)`
  5. On error from `launchInTerminal`: `vscode.window.showErrorMessage(err.message)`

### terminal.ts

Exports one function:

```ts
export async function launchInTerminal(
  projectPath: string,
  app: 'Terminal' | 'iTerm2' | 'Ghostty'
): Promise<void>
```

Internally dispatches to a per-app launcher:

| App | Strategy |
|-----|----------|
| `Terminal` | `osascript -e 'tell app "Terminal" to do script "cd <path> && claude"'` |
| `iTerm2` | AppleScript: create new tab in current/new window, send text `cd <path> && claude` |
| `Ghostty` | `open -a Ghostty` with `--command` arg to run `cd <path> && claude` |

All launchers execute via Node.js `child_process.exec`. Shell-special characters in the path are escaped before embedding in AppleScript strings.

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
    ]
  }
}
```

---

## Data Flow

```
User triggers command
  → extension.ts reads config + workspace path
  → terminal.ts builds osascript / open command string
  → child_process.exec runs the command
  → System terminal opens, executes: cd <workspace> && claude
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No workspace folder open | `showErrorMessage("No workspace folder open")` |
| `child_process.exec` error | `showErrorMessage` with the stderr/error message |
| Path contains shell special chars | Escape single quotes in AppleScript string before exec |

---

## Out of Scope

- Windows / Linux support
- Multiple workspace folder selection (always uses first root)
- Auto-installing Claude Code CLI if not found
- Passing additional flags to the `claude` command
