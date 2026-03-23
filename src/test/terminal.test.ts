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
