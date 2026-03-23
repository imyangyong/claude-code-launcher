import * as vscode from 'vscode';

jest.mock('../terminal', () => ({
  launchInTerminal: jest.fn()
}));
import { launchInTerminal } from '../terminal';
const mockLaunch = launchInTerminal as jest.Mock;

let activate: (ctx: any) => void;

beforeAll(async () => {
  ({ activate } = await import('../extension'));
});

function makeContext() {
  return { subscriptions: [] as any[] };
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
