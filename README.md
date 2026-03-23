# Claude Code Launcher

A macOS-only VS Code extension that opens your current project in a terminal and launches the [Claude Code](https://claude.ai/code) CLI with a single command.

## Features

When triggered, the extension automatically:

1. Opens your configured terminal application
2. Navigates to the current workspace root directory
3. Runs the `claude` command

Supports three macOS terminals: **Terminal.app**, **iTerm2**, and **Ghostty**.

## Installation

### From VSIX

```bash
code --install-extension claude-code-launcher-0.0.1.vsix
```

### From Source

```bash
git clone <repo-url>
cd vscode-extension-claude-code
npm install
npm run package
code --install-extension claude-code-launcher-0.0.1.vsix
```

## Usage

Trigger the command via any of the following:

- **Command Palette**: `Cmd+Shift+P` → search "Open in Terminal (Claude Code)"
- **File Explorer**: Right-click any file or folder → "Open in Terminal (Claude Code)"

### Prerequisites

- macOS
- [Claude Code CLI](https://claude.ai/code) installed and available on your PATH
- At least one supported terminal application installed

## Configuration

Set your preferred terminal in VS Code settings:

```json
{
  "claudeCodeLauncher.terminal": "Terminal"
}
```

| Value | Description |
|---|---|
| `"Terminal"` | macOS built-in Terminal.app (default) |
| `"iTerm2"` | iTerm2 |
| `"Ghostty"` | Ghostty |

You can also search "Claude Code Launcher" in the VS Code Settings UI to configure this graphically.

## Development

### Requirements

- Node.js
- VS Code 1.85.0+

### Local Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (for development)
npm run watch

# Run tests
npm run test

# Package the extension
npm run package
```

### Debugging

Press `F5` in VS Code to launch the extension in debug mode. This opens a new VS Code window with the extension loaded.

## Error Handling

| Scenario | Message |
|---|---|
| No workspace folder open | "No workspace folder open" |
| Terminal app not installed | "\<AppName\> is not installed" |
| Terminal launch failure | Specific error details |

## Tech Stack

- **TypeScript** — strict mode
- **VS Code Extension API**
- **AppleScript** — Terminal.app / iTerm2 integration
- **Jest + ts-jest** — unit testing

## License

MIT
