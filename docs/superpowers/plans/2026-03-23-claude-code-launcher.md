# claude-code-launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VSCode extension with one command that opens the current workspace in a macOS system terminal (Terminal.app, iTerm2, or Ghostty) and runs `claude`.

**Architecture:** The extension registers a single command in `extension.ts`. All terminal-launch logic lives in `terminal.ts`, which uses `child_process.execFile` to drive osascript (for Terminal.app/iTerm2) or the Ghostty binary directly. Unit tests use Jest with mocks for `child_process` and `fs`.

**Tech Stack:** TypeScript, VSCode Extension API, Node.js `child_process.execFile`, `fs.existsSync`, Jest + ts-jest for unit tests, `@vscode/vsce` for packaging.

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Extension manifest: name, version, engines, contributes (command, menus, configuration), scripts |
| `tsconfig.json` | TypeScript config targeting ES2020, CommonJS modules |
| `src/extension.ts` | `activate()` — registers the command, reads config, resolves workspace path, calls `launchInTerminal` |
| `src/terminal.ts` | `launchInTerminal()`, `escapeForAppleScript()`, `escapeForShell()`, per-app launchers, app-existence checks |
| `src/test/terminal.test.ts` | Unit tests for all terminal.ts exports (mocking execFile and fs) |
| `src/test/extension.test.ts` | Unit tests for extension.ts command handler (mocking vscode API and terminal module) |
| `.vscodeignore` | Exclude src, tests, node_modules from packaged extension |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.vscodeignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "claude-code-launcher",
  "displayName": "Claude Code Launcher",
  "description": "Open the current project in a system terminal and launch Claude Code CLI",
  "version": "0.0.1",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
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
    },
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
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "jest",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^2.22.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create .vscodeignore**

```
.vscode/**
src/**
out/test/**
node_modules/**
*.map
tsconfig.json
jest.config.js
```

- [ ] **Step 4: Create jest.config.js**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  moduleNameMapper: {
    vscode: '<rootDir>/src/test/__mocks__/vscode.ts'
  }
};
```

- [ ] **Step 5: Create vscode mock at src/test/__mocks__/vscode.ts**

```ts
export const window = {
  showErrorMessage: jest.fn()
};
export const workspace = {
  workspaceFolders: undefined as any,
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn().mockReturnValue('Terminal')
  })
};
export const commands = {
  registerCommand: jest.fn()
};
export const ExtensionContext = jest.fn();
```

- [ ] **Step 6: Create .gitignore**

```
out/
node_modules/
*.vsix
```

- [ ] **Step 7: Create src/ and src/test/ directories, install dependencies**

```bash
mkdir -p src/test/__mocks__
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .vscodeignore .gitignore jest.config.js src/test/__mocks__/vscode.ts
git commit -m "chore: scaffold claude-code-launcher extension"
```

---

## Task 2: Path Escaping Utilities

**Files:**
- Create: `src/terminal.ts` (escaping functions only)
- Create: `src/test/terminal.test.ts` (escaping tests only)

- [ ] **Step 1: Write failing tests for escapeForAppleScript**

Create `src/test/terminal.test.ts`:

```ts
import { escapeForAppleScript, escapeForShell } from '../terminal';

describe('escapeForAppleScript', () => {
  it('leaves simple paths unchanged', () => {
    expect(escapeForAppleScript('/Users/alice/projects/myapp')).toBe(
      '/Users/alice/projects/myapp'
    );
  });

  it('escapes single quotes', () => {
    expect(escapeForAppleScript("/Users/alice/it's mine")).toBe(
      "/Users/alice/it'\\''s mine"
    );
  });

  it('doubles backslashes', () => {
    expect(escapeForAppleScript('/Users/alice/back\\slash')).toBe(
      '/Users/alice/back\\\\slash'
    );
  });

  it('handles both backslashes and single quotes', () => {
    expect(escapeForAppleScript("/a\\b'c")).toBe("/a\\\\b'\\''c");
  });
});

describe('escapeForShell', () => {
  it('leaves simple paths unchanged', () => {
    expect(escapeForShell('/Users/alice/projects')).toBe('/Users/alice/projects');
  });

  it('escapes single quotes', () => {
    expect(escapeForShell("/Users/alice/it's mine")).toBe(
      "/Users/alice/it'\\''s mine"
    );
  });

  it('does NOT double backslashes', () => {
    expect(escapeForShell('/Users/alice/back\\slash')).toBe(
      '/Users/alice/back\\slash'
    );
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --testPathPattern=terminal
```

Expected: FAIL — `escapeForAppleScript` and `escapeForShell` not found.

- [ ] **Step 3: Create src/terminal.ts with escaping functions**

```ts
import * as fs from 'fs';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(_execFile);

export type TerminalApp = 'Terminal' | 'iTerm2' | 'Ghostty';

export function escapeForAppleScript(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
}

export function escapeForShell(p: string): string {
  return p.replace(/'/g, "'\\''");
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --testPathPattern=terminal
```

Expected: PASS (4 + 3 = 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/terminal.ts src/test/terminal.test.ts
git commit -m "feat: add path escaping utilities"
```

---

## Task 3: App Existence Check

**Files:**
- Modify: `src/terminal.ts`
- Modify: `src/test/terminal.test.ts`

- [ ] **Step 1: Add failing tests for app existence check**

Add to `src/test/terminal.test.ts`:

```ts
import * as fs from 'fs';

jest.mock('fs');
const mockExistsSync = fs.existsSync as jest.Mock;

describe('app existence paths', () => {
  const PATHS = {
    Terminal: '/System/Applications/Utilities/Terminal.app',
    iTerm2: '/Applications/iTerm.app',
    Ghostty: '/Applications/Ghostty.app'
  };

  it.each(Object.entries(PATHS))(
    'throws "not installed" when %s bundle is missing',
    async (app, path) => {
      mockExistsSync.mockImplementation((p: string) => p !== path);
      await expect(
        launchInTerminal('/some/path', app as TerminalApp)
      ).rejects.toThrow(`${app} is not installed`);
    }
  );
});
```

Also add at top of file:
```ts
import { escapeForAppleScript, escapeForShell, launchInTerminal, TerminalApp } from '../terminal';
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
npm test -- --testPathPattern=terminal
```

Expected: FAIL — `launchInTerminal` not exported.

- [ ] **Step 3: Add app existence check to src/terminal.ts**

```ts
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --testPathPattern=terminal
```

Expected: PASS (all previous tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/terminal.ts src/test/terminal.test.ts
git commit -m "feat: add app existence check in launchInTerminal"
```

---

## Task 4: Terminal.app Launcher

**Files:**
- Modify: `src/terminal.ts`
- Modify: `src/test/terminal.test.ts`

- [ ] **Step 1: Add failing tests for Terminal.app**

Add to `src/test/terminal.test.ts`:

```ts
import * as child_process from 'child_process';

jest.mock('child_process');
const mockExecFile = child_process.execFile as jest.Mock;

describe('Terminal.app launcher', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, '', '');
    });
  });

  it('calls execFile with osascript and -e flag', async () => {
    await launchInTerminal('/Users/alice/myapp', 'Terminal');
    expect(mockExecFile).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining(['-e']),
      expect.any(Function)
    );
  });

  it('embeds the project path in the AppleScript', async () => {
    await launchInTerminal('/Users/alice/myapp', 'Terminal');
    const script: string = mockExecFile.mock.calls[0][1][1];
    expect(script).toContain("cd '/Users/alice/myapp'");
    expect(script).toContain('do script');
  });

  it('escapes single quotes in path', async () => {
    await launchInTerminal("/Users/alice/it's", 'Terminal');
    const script: string = mockExecFile.mock.calls[0][1][1];
    expect(script).toContain("cd '/Users/alice/it'\\''s'");
  });

  it('rejects when execFile returns non-null error', async () => {
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(new Error('osascript failed'), '', 'some error');
    });
    await expect(launchInTerminal('/path', 'Terminal')).rejects.toThrow('osascript failed');
  });

  it('rejects on AppleScript silent error in stderr', async () => {
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, '', 'execution error: Terminal not running (-1712)');
    });
    await expect(launchInTerminal('/path', 'Terminal')).rejects.toThrow(
      'execution error'
    );
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --testPathPattern=terminal
```

Expected: FAIL — `launchInTerminal` for `'Terminal'` does nothing.

- [ ] **Step 3: Implement Terminal.app launcher in src/terminal.ts**

Replace the `launchInTerminal` body:

```ts
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

export async function launchInTerminal(
  projectPath: string,
  app: TerminalApp
): Promise<void> {
  checkInstalled(app);
  switch (app) {
    case 'Terminal':
      return launchTerminalApp(projectPath);
    default:
      throw new Error(`Unsupported terminal: ${app}`);
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --testPathPattern=terminal
```

Expected: PASS (all Terminal.app tests).

- [ ] **Step 5: Commit**

```bash
git add src/terminal.ts src/test/terminal.test.ts
git commit -m "feat: implement Terminal.app launcher"
```

---

## Task 5: iTerm2 Launcher

**Files:**
- Modify: `src/terminal.ts`
- Modify: `src/test/terminal.test.ts`

- [ ] **Step 1: Add failing tests for iTerm2**

Add to `src/test/terminal.test.ts`:

```ts
describe('iTerm2 launcher', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, '', '');
    });
  });

  it('calls execFile with osascript and -e flag', async () => {
    await launchInTerminal('/Users/alice/myapp', 'iTerm2');
    expect(mockExecFile).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining(['-e']),
      expect.any(Function)
    );
  });

  it('uses bundle ID com.googlecode.iterm2', async () => {
    await launchInTerminal('/Users/alice/myapp', 'iTerm2');
    const script: string = mockExecFile.mock.calls[0][1][1];
    expect(script).toContain('com.googlecode.iterm2');
  });

  it('embeds the project path with write text', async () => {
    await launchInTerminal('/Users/alice/myapp', 'iTerm2');
    const script: string = mockExecFile.mock.calls[0][1][1];
    expect(script).toContain("write text");
    expect(script).toContain("cd '/Users/alice/myapp'");
  });

  it('escapes single quotes in path', async () => {
    await launchInTerminal("/Users/alice/it's", 'iTerm2');
    const script: string = mockExecFile.mock.calls[0][1][1];
    expect(script).toContain("cd '/Users/alice/it'\\''s'");
  });

  it('rejects on AppleScript silent error in stderr', async () => {
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, '', 'execution error: iTerm2 (-1728)');
    });
    await expect(launchInTerminal('/path', 'iTerm2')).rejects.toThrow('execution error');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --testPathPattern=terminal
```

Expected: FAIL — `launchInTerminal('iTerm2')` throws "Unsupported terminal".

- [ ] **Step 3: Implement iTerm2 launcher in src/terminal.ts**

Add function and update switch:

```ts
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
```

Update switch in `launchInTerminal`:
```ts
case 'iTerm2':
  return launchITerm2(projectPath);
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --testPathPattern=terminal
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/terminal.ts src/test/terminal.test.ts
git commit -m "feat: implement iTerm2 launcher"
```

---

## Task 6: Ghostty Launcher

**Files:**
- Modify: `src/terminal.ts`
- Modify: `src/test/terminal.test.ts`

- [ ] **Step 1: Add failing tests for Ghostty**

Add to `src/test/terminal.test.ts`:

```ts
describe('Ghostty launcher', () => {
  const GHOSTTY_BIN = '/Applications/Ghostty.app/Contents/MacOS/ghostty';

  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, '', '');
    });
  });

  it('calls execFile with the ghostty binary', async () => {
    await launchInTerminal('/Users/alice/myapp', 'Ghostty');
    expect(mockExecFile).toHaveBeenCalledWith(
      GHOSTTY_BIN,
      expect.any(Array),
      expect.any(Function)
    );
  });

  it('passes -e zsh -c <script> as args', async () => {
    await launchInTerminal('/Users/alice/myapp', 'Ghostty');
    const args: string[] = mockExecFile.mock.calls[0][1];
    expect(args[0]).toBe('-e');
    expect(args[1]).toBe('zsh');
    expect(args[2]).toBe('-c');
    expect(args[3]).toContain("cd '/Users/alice/myapp'");
    expect(args[3]).toContain('exec $SHELL');
  });

  it('escapes single quotes in path (shell-style, no backslash doubling)', async () => {
    await launchInTerminal("/Users/alice/it's", 'Ghostty');
    const args: string[] = mockExecFile.mock.calls[0][1];
    expect(args[3]).toContain("cd '/Users/alice/it'\\''s'");
    expect(args[3]).not.toContain('\\\\');
  });

  it('rejects when execFile returns non-null error', async () => {
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(new Error('spawn failed'), '', '');
    });
    await expect(launchInTerminal('/path', 'Ghostty')).rejects.toThrow('spawn failed');
  });

  it('does NOT reject on non-empty stderr (no AppleScript check)', async () => {
    mockExecFile.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, '', 'some warning on stderr');
    });
    await expect(launchInTerminal('/path', 'Ghostty')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --testPathPattern=terminal
```

Expected: FAIL.

- [ ] **Step 3: Implement Ghostty launcher in src/terminal.ts**

Add function:

```ts
const GHOSTTY_BIN = '/Applications/Ghostty.app/Contents/MacOS/ghostty';

async function launchGhostty(projectPath: string): Promise<void> {
  const escaped = escapeForShell(projectPath);
  const shellScript = `cd '${escaped}' && claude; exec $SHELL`;
  return new Promise((resolve, reject) => {
    _execFile(GHOSTTY_BIN, ['-e', 'zsh', '-c', shellScript], (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(error.message + (stderr ? '\n' + stderr : '')));
        return;
      }
      resolve();
    });
  });
}
```

Update switch:
```ts
case 'Ghostty':
  return launchGhostty(projectPath);
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --testPathPattern=terminal
```

Expected: PASS (all terminal tests).

- [ ] **Step 5: Commit**

```bash
git add src/terminal.ts src/test/terminal.test.ts
git commit -m "feat: implement Ghostty launcher"
```

---

## Task 7: extension.ts

**Files:**
- Create: `src/extension.ts`
- Create: `src/test/extension.test.ts`

- [ ] **Step 1: Write failing tests for extension.ts**

Create `src/test/extension.test.ts`:

```ts
import * as vscode from 'vscode';

jest.mock('../terminal', () => ({
  launchInTerminal: jest.fn()
}));
import { launchInTerminal } from '../terminal';
const mockLaunch = launchInTerminal as jest.Mock;

// Import activate AFTER mocks are set up
let activate: (ctx: any) => void;

beforeAll(async () => {
  ({ activate } = await import('../extension'));
});

function makeContext() {
  return { subscriptions: [] };
}

function triggerCommand() {
  const registeredHandler = (vscode.commands.registerCommand as jest.Mock).mock.calls
    .find(([cmd]: [string]) => cmd === 'claude-code-launcher.openInTerminal')?.[1];
  if (!registeredHandler) throw new Error('Command not registered');
  return registeredHandler();
}

describe('activate', () => {
  it('registers the openInTerminal command', () => {
    activate(makeContext());
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'claude-code-launcher.openInTerminal',
      expect.any(Function)
    );
  });
});

describe('openInTerminal command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activate(makeContext());
  });

  it('shows error when no workspace is open', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    await triggerCommand();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'No workspace folder open'
    );
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('calls launchInTerminal with workspace path and configured terminal', async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: '/Users/alice/myapp' } }
    ];
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue('iTerm2')
    });
    mockLaunch.mockResolvedValue(undefined);

    await triggerCommand();

    expect(mockLaunch).toHaveBeenCalledWith('/Users/alice/myapp', 'iTerm2');
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('shows error when launchInTerminal rejects', async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: '/some/path' } }
    ];
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue('Terminal')
    });
    mockLaunch.mockRejectedValue(new Error('Terminal is not installed'));

    await triggerCommand();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Terminal is not installed'
    );
  });

  it('is silent on success (no notification shown)', async () => {
    (vscode.workspace as any).workspaceFolders = [
      { uri: { fsPath: '/some/path' } }
    ];
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue('Terminal')
    });
    mockLaunch.mockResolvedValue(undefined);

    await triggerCommand();

    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --testPathPattern=extension
```

Expected: FAIL — `extension.ts` doesn't exist.

- [ ] **Step 3: Create src/extension.ts**

```ts
import * as vscode from 'vscode';
import { launchInTerminal, TerminalApp } from './terminal';

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand(
    'claude-code-launcher.openInTerminal',
    async () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const config = vscode.workspace.getConfiguration('claudeCodeLauncher');
      const terminal = (config.get('terminal') ?? 'Terminal') as TerminalApp;
      const projectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

      try {
        await launchInTerminal(projectPath, terminal);
      } catch (err) {
        vscode.window.showErrorMessage((err as Error).message);
      }
    }
  );

  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
```

- [ ] **Step 4: Run all tests — verify they pass**

```bash
npm test
```

Expected: PASS (all test suites).

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts src/test/extension.test.ts
git commit -m "feat: implement extension command handler"
```

---

## Task 8: Build Verification

**Files:**
- No new files

- [ ] **Step 1: Compile TypeScript**

```bash
npm run compile
```

Expected: `out/` directory created with `extension.js` and `terminal.js`. Zero errors.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 3: Package the extension**

```bash
npm run package
```

Expected: `claude-code-launcher-0.0.1.vsix` created.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: verify build and package"
```

---

## Summary

| Task | What it builds |
|------|---------------|
| 1 | Project scaffolding (package.json, tsconfig, jest config, vscode mock) |
| 2 | Path escaping utilities + tests |
| 3 | App existence check + tests |
| 4 | Terminal.app launcher + tests |
| 5 | iTerm2 launcher + tests |
| 6 | Ghostty launcher + tests |
| 7 | extension.ts command handler + tests |
| 8 | Build & package verification |
