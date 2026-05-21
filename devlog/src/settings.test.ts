import { beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { getDefaultExcludeGlobs, getWorkspacePaths } from './settings';

const { __setWorkspaceFolders } = vscode as unknown as {
  __setWorkspaceFolders: (paths: string[]) => void;
};

describe('settings helpers', () => {
  beforeEach(() => {
    __setWorkspaceFolders([]);
  });

  it('returns a defensive copy of default excludes', () => {
    const first = getDefaultExcludeGlobs();
    first.length = 0;

    expect(getDefaultExcludeGlobs()).toContain('**/node_modules/**');
  });

  it('includes generated and binary defaults', () => {
    const globs = getDefaultExcludeGlobs();

    expect(globs).toContain('**/.git/**');
    expect(globs).toContain('**/dist/**');
    expect(globs).toContain('**/*.png');
  });

  it('maps VS Code workspace folders into fs paths', () => {
    __setWorkspaceFolders(['/repo/one', '/repo/two']);

    expect(getWorkspacePaths()).toEqual(['/repo/one', '/repo/two']);
  });
});
