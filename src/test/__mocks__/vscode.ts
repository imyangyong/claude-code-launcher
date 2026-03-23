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
