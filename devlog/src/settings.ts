import * as vscode from 'vscode';
import picomatch from 'picomatch';

export const DEFAULT_EXCLUDE_PATTERNS = [
  '**/__pycache__/**',
  '**/*.pyc',
  '**/*.pyo',
  '**/.venv/**',
  '**/.pytest_cache/**',
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/*.min.js',
  '**/*.js.map',
  '**/*.d.ts.map',
];

const DEFAULT_EXCLUDES = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/.vercel/**',
  '**/*.lock',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.webp',
  '**/*.pdf',
  ...DEFAULT_EXCLUDE_PATTERNS,
];

export function getDefaultExcludeGlobs(): string[] {
  return [...new Set(DEFAULT_EXCLUDES)];
}

export function loadExcludePatterns(): string[] {
  return vscode.workspace
    .getConfiguration('devlog')
    .get<string[]>('excludePatterns', DEFAULT_EXCLUDE_PATTERNS);
}

export function isExcluded(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const matchers = patterns
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => picomatch(pattern, { dot: true }));
  return matchers.some((matcher) => matcher(normalized));
}

export function getWorkspacePaths(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
}
