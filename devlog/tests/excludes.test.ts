import { describe, expect, it } from 'vitest';
import { DEFAULT_EXCLUDE_PATTERNS, isExcluded } from '../src/settings';

describe('isExcluded', () => {
  const patterns = DEFAULT_EXCLUDE_PATTERNS;

  it('excludes __pycache__ bytecode', () => {
    expect(isExcluded('src/__pycache__/foo.pyc', patterns)).toBe(true);
  });

  it('allows normal source files', () => {
    expect(isExcluded('src/main.py', patterns)).toBe(false);
  });

  it('excludes node_modules', () => {
    expect(isExcluded('node_modules/lodash/index.js', patterns)).toBe(true);
  });

  it('allows TypeScript sources', () => {
    expect(isExcluded('src/utils.ts', patterns)).toBe(false);
  });

  it('excludes virtualenv paths', () => {
    expect(isExcluded('.venv/lib/python3.11/site.py', patterns)).toBe(true);
  });
});
