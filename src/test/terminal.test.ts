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
