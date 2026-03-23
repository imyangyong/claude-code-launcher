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
- If the configured terminal app is not installed: shows a friendly error message (not raw stderr)

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
  2. Resolve workspace root: use `vscode.workspace.workspaceFolders[0].uri.fsPath` (always the first folder; multiple-root workspaces are out of scope — the first folder is used without prompting)
  3. If `workspaceFolders` is undefined or empty: `vscode.window.showErrorMessage("No workspace folder open")`
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

Internally dispatches to a per-app launcher. All launchers use Node.js `child_process.exec` and reject with a descriptive `Error` on failure.

#### Path escaping

Before embedding `projectPath` in any AppleScript string (single-quoted), escape single quotes:
```ts
const escaped = projectPath.replace(/'/g, "'\\''");
```
For the Ghostty CLI invocation, pass `projectPath` as a shell argument and use `shell-quote` or manual escaping appropriate for the shell command string.

#### Terminal.app

```applescript
osascript -e 'tell application "Terminal"
  activate
  do script "cd '\''<escaped-path>'\'' && claude"
end tell'
```

Opens a new terminal window (or tab in the frontmost window, per Terminal.app default behavior) and runs the command.

#### iTerm2

```applescript
osascript -e 'tell application "iTerm2"
  activate
  tell current window
    create tab with default profile
    tell current session of current tab
      write text "cd '\''<escaped-path>'\'' && claude"
    end tell
  end tell
end tell'
```

Creates a new tab in the current iTerm2 window and sends the command followed by a newline (the `write text` verb sends text + return). If iTerm2 has no open window, the AppleScript error will be caught and surfaced as an error message.

#### Ghostty

Uses the `ghostty` CLI binary directly (does not use `open -a`):

```sh
/Applications/Ghostty.app/Contents/MacOS/ghostty \
  --command="zsh -c 'cd <escaped-path> && claude; exec $SHELL'"
```

The binary path `/Applications/Ghostty.app/Contents/MacOS/ghostty` is used. If the binary does not exist at that path, the launcher throws `Error("Ghostty is not installed at /Applications/Ghostty.app")` before calling `exec`.

The `exec $SHELL` at the end keeps the terminal session alive after `claude` exits.

#### Detecting missing terminal apps

Before executing, each launcher checks whether the app exists:

| App | Check |
|-----|-------|
| Terminal.app | `fs.existsSync("/Applications/Utilities/Terminal.app")` or `"/System/Applications/Utilities/Terminal.app"` |
| iTerm2 | `fs.existsSync("/Applications/iTerm.app")` |
| Ghostty | `fs.existsSync("/Applications/Ghostty.app/Contents/MacOS/ghostty")` |

If the app is not found: throw `Error("<AppName> is not installed")`. This produces a friendly message via `showErrorMessage`.

#### Silent AppleScript failures

After `child_process.exec` completes, check if `stderr` contains known error patterns (e.g., `"execution error"`, `"Can't get current window"`). If so, throw an `Error` with the stderr content so it surfaces to the user.

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
  → terminal.ts checks app is installed
  → terminal.ts escapes path
  → terminal.ts builds osascript / ghostty CLI command
  → child_process.exec runs it
  → (checks stderr for silent errors)
  → System terminal opens new window/tab, runs: cd <workspace> && claude
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No workspace folder open | `showErrorMessage("No workspace folder open")` |
| Configured terminal not installed | `showErrorMessage("<App> is not installed")` |
| `child_process.exec` non-zero exit | `showErrorMessage` with stderr content |
| AppleScript silent error in stderr | `showErrorMessage` with stderr content |
| Path contains single quotes | Escaped via `replace(/'/g, "'\\''")` before embedding |

---

## Out of Scope

- Windows / Linux support
- Multiple workspace folder selection (always uses first root)
- Auto-installing Claude Code CLI if not found
- Passing additional flags to the `claude` command
