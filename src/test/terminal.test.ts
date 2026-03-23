import * as fs from 'fs';
import * as child_process from 'child_process';
import { escapeForAppleScript, escapeForShell, launchInTerminal, TerminalApp } from '../terminal';

jest.mock('fs');
jest.mock('child_process');
const mockExistsSync = fs.existsSync as jest.Mock;
const mockExecFile = child_process.execFile as unknown as jest.Mock;

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

  it('leaves backslashes unchanged', () => {
    expect(escapeForAppleScript('/Users/alice/back\\slash')).toBe(
      '/Users/alice/back\\slash'
    );
  });

  it('handles both backslashes and single quotes', () => {
    expect(escapeForAppleScript("/a\\b'c")).toBe("/a\\b'\\''c");
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

describe('app existence paths', () => {
  const PATHS: Record<string, string> = {
    Terminal: '/System/Applications/Utilities/Terminal.app',
    iTerm2: '/Applications/iTerm.app',
    Ghostty: '/Applications/Ghostty.app'
  };

  it.each(Object.entries(PATHS))(
    'throws "%s is not installed" when bundle is missing',
    async (app, path) => {
      mockExistsSync.mockImplementation((p: string) => p !== path);
      await expect(
        launchInTerminal('/some/path', app as TerminalApp)
      ).rejects.toThrow(`${app} is not installed`);
    }
  );
});

describe('Terminal.app launcher', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockClear();
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

describe('iTerm2 launcher', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockClear();
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
    expect(script).toContain('write text');
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

describe('Ghostty launcher', () => {
  const GHOSTTY_BIN = '/Applications/Ghostty.app/Contents/MacOS/ghostty';

  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    mockExecFile.mockClear();
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
