import { mkdtemp, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { DiffEngine } from './diffEngine';
import type { DevLogConfig } from './types';

const createdDirs: string[] = [];

function baseConfig(overrides: Partial<DevLogConfig> = {}): DevLogConfig {
  return {
    geminiApiKey: '',
    demoMode: false,
    docsSyncEnabled: false,
    googleDocId: '',
    workspacePaths: [],
    includeFilePaths: true,
    maxFileSizeKb: 512,
    maxDiffChars: 2000,
    maxPromptChars: 4000,
    maxLessons: 100,
    excludeGlobs: ['**/.git/**'],
    redactSecrets: true,
    ...overrides,
  };
}

afterEach(async () => {
  const { rm } = await import('fs/promises');
  await Promise.all(
    createdDirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined))
  );
  createdDirs.length = 0;
});

describe('DiffEngine', () => {
  it('uses baseline so first modification is a minimal diff', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'devlog-diff-'));
    createdDirs.push(dir);
    const file = path.join(dir, 'sample.ts');
    await writeFile(file, 'const a = 1;\n');

    const engine = new DiffEngine(baseConfig({ workspacePaths: [dir] }));
    await engine.seedWorkspaceBaseline([dir]);
    await writeFile(file, 'const a = 2;\n');
    const change = await engine.buildChange(dir, file, 'modified');

    expect(change).not.toBeNull();
    expect(change?.diff).toContain('-const a = 1;');
    expect(change?.diff).toContain('+const a = 2;');
  });

  it('skips binary-like files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'devlog-diff-'));
    createdDirs.push(dir);
    const file = path.join(dir, 'bin.dat');
    await writeFile(file, Buffer.from([0, 1, 2, 3, 4]));

    const engine = new DiffEngine(baseConfig({ workspacePaths: [dir] }));
    const change = await engine.buildChange(dir, file, 'modified');

    expect(change?.skipped).toBe(true);
    expect(change?.skipReason).toContain('binary');
  });

  it('respects max file size', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'devlog-diff-'));
    createdDirs.push(dir);
    const file = path.join(dir, 'large.txt');
    await writeFile(file, 'x'.repeat(6000));

    const engine = new DiffEngine(baseConfig({ workspacePaths: [dir], maxFileSizeKb: 1 }));
    const change = await engine.buildChange(dir, file, 'modified');

    expect(change?.skipped).toBe(true);
    expect(change?.skipReason).toBe('file too large');
  });

  it('respects exclude globs', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'devlog-diff-'));
    createdDirs.push(dir);
    const hiddenDir = path.join(dir, 'dist');
    await mkdir(hiddenDir);
    const file = path.join(hiddenDir, 'bundle.js');
    await writeFile(file, 'console.log(1)');

    const engine = new DiffEngine(
      baseConfig({ workspacePaths: [dir], excludeGlobs: ['**/dist/**'] })
    );
    const change = await engine.buildChange(dir, file, 'modified');

    expect(change).toBeNull();
  });

  it('creates a patch for a new file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'devlog-diff-'));
    createdDirs.push(dir);
    const file = path.join(dir, 'new.ts');
    await writeFile(file, 'export const value = 1;\n');

    const engine = new DiffEngine(baseConfig({ workspacePaths: [dir] }));
    const change = await engine.buildChange(dir, file, 'created');

    expect(change?.diff).toContain('+export const value = 1;');
    expect(change?.changeType).toBe('created');
  });

  it('creates a deletion patch and clears baseline', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'devlog-diff-'));
    createdDirs.push(dir);
    const file = path.join(dir, 'delete-me.ts');
    await writeFile(file, 'const removed = true;\n');

    const engine = new DiffEngine(baseConfig({ workspacePaths: [dir] }));
    await engine.seedWorkspaceBaseline([dir]);
    const change = await engine.buildChange(dir, file, 'deleted');

    expect(change?.diff).toContain('-const removed = true;');
    expect(change?.changeType).toBe('deleted');
  });

  it('truncates very large diffs', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'devlog-diff-'));
    createdDirs.push(dir);
    const file = path.join(dir, 'long.txt');
    await writeFile(file, 'a\n');

    const engine = new DiffEngine(baseConfig({ workspacePaths: [dir], maxDiffChars: 120 }));
    await engine.seedWorkspaceBaseline([dir]);
    await writeFile(file, `${'b\n'.repeat(200)}`);
    const change = await engine.buildChange(dir, file, 'modified');

    expect(change?.skipped).toBe(true);
    expect(change?.skipReason).toBe('diff truncated to max length');
    expect(change?.diff).toContain('diff truncated');
  });

  it('skips binary files by extension', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'devlog-diff-'));
    createdDirs.push(dir);
    const file = path.join(dir, 'image.png');
    await writeFile(file, Buffer.from('not really an image'));

    const engine = new DiffEngine(baseConfig({ workspacePaths: [dir] }));
    const change = await engine.buildChange(dir, file, 'modified');

    expect(change?.skipped).toBe(true);
    expect(change?.skipReason).toBe('binary file type');
  });

  it('clear removes seeded baseline', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'devlog-diff-'));
    createdDirs.push(dir);
    const file = path.join(dir, 'clear.ts');
    await writeFile(file, 'const before = true;\n');

    const engine = new DiffEngine(baseConfig({ workspacePaths: [dir] }));
    await engine.seedWorkspaceBaseline([dir]);
    engine.clear();
    await writeFile(file, 'const after = true;\n');
    const change = await engine.buildChange(dir, file, 'modified');

    expect(change?.diff).toContain('+const after = true;');
    expect(change?.diff).not.toContain('-const before = true;');
  });
});
