import { beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import {
  DEFAULT_EXCLUDE_PATTERNS,
  getDefaultExcludeGlobs,
  getWorkspacePaths,
  isExcluded,
  loadExcludePatterns,
} from './settings';

const { __setWorkspaceFolders } = vscode as unknown as {
  __setWorkspaceFolders: (paths: string[]) => void;
};

describe('settings helpers', () => {
  beforeEach(() => {
    __setWorkspaceFolders([]);
  });

  it('returns default exclude patterns', () => {
    const patterns = loadExcludePatterns();
    expect(patterns).toContain('**/__pycache__/**');
    expect(patterns).toContain('**/*.pyc');
  });

  it('matches python artifact paths', () => {
    expect(isExcluded('src/__pycache__/foo.pyc', DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
    expect(isExcluded('src/main.py', DEFAULT_EXCLUDE_PATTERNS)).toBe(false);
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
