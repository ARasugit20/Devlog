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
});
