import { EventEmitter } from 'events';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevLogConfig, LogEntry } from '../src/types';

const watchers: Array<EventEmitter & { close: ReturnType<typeof vi.fn> }> = [];
const translateBatch = vi.fn();
const appendToDoc = vi.fn();
const logDevLog = vi.fn();

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => {
      const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
      watchers.push(watcher);
      return watcher;
    }),
  },
}));

vi.mock('../src/translator', () => ({
  translateBatch,
}));

vi.mock('../src/docSync', () => ({
  appendToDoc,
}));

vi.mock('../src/outputChannel', () => ({
  logDevLog,
}));

function config(workspacePath: string): DevLogConfig {
  return {
    geminiApiKey: '',
    demoMode: true,
    docsSyncEnabled: false,
    googleDocId: '',
    workspacePaths: [workspacePath],
    includeFilePaths: true,
    maxFileSizeKb: 512,
    maxDiffChars: 4000,
    maxPromptChars: 4000,
    maxLessons: 100,
    excludeGlobs: [],
    redactSecrets: true,
  };
}

function lessonEntry(): LogEntry {
  return {
    id: '1',
    timestamp: Date.now(),
    files: ['file.ts'],
    filename: 'file.ts',
    changeType: 'modified',
    diff: 'diff',
    concept: 'Variable',
    summary: 'A variable changed.',
    explanation: 'You changed a value.',
    whyItMatters: 'It helps you track state.',
    source: 'demo',
  };
}

describe('watcher artifact filtering', () => {
  let dir = '';

  beforeEach(async () => {
    vi.useFakeTimers();
    watchers.length = 0;
    translateBatch.mockResolvedValue(lessonEntry());
    appendToDoc.mockResolvedValue(undefined);
    logDevLog.mockClear();
    dir = await mkdtemp(path.join(tmpdir(), 'devlog-watch-filter-'));
    const { resetWatcherStateForTests } = await import('../src/watcher');
    resetWatcherStateForTests();
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { resetWatcherStateForTests } = await import('../src/watcher');
    resetWatcherStateForTests();
    const { rm } = await import('fs/promises');
    await rm(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('drops a batch of only .pyc files with no lesson emitted', async () => {
    const { startWatcher, waitForPendingChangeBuildsForTests } = await import('../src/watcher');
    const pyc = path.join(dir, '__pycache__', 'main.cpython-311.pyc');
    await mkdir(path.dirname(pyc), { recursive: true });
    await writeFile(pyc, Buffer.from([0, 1, 2]));
    await startWatcher(config(dir));

    watchers[0].emit('change', pyc);
    await waitForPendingChangeBuildsForTests();
    await vi.advanceTimersByTimeAsync(2100);

    expect(translateBatch).not.toHaveBeenCalled();
  });

  it('removes .pyc from a mixed batch and keeps source files', async () => {
    const { startWatcher, waitForPendingChangeBuildsForTests } = await import('../src/watcher');
    const py = path.join(dir, 'main.py');
    const pyc = path.join(dir, '__pycache__', 'main.cpython-311.pyc');
    await writeFile(py, 'count = 0\n');
    await mkdir(path.dirname(pyc), { recursive: true });
    await writeFile(pyc, Buffer.from([0, 1, 2]));
    await startWatcher(config(dir));

    await writeFile(py, 'count = 1\n');
    watchers[0].emit('change', py);
    watchers[0].emit('change', pyc);
    await waitForPendingChangeBuildsForTests();
    await vi.advanceTimersByTimeAsync(2100);

    expect(translateBatch).toHaveBeenCalledTimes(1);
    const batch = translateBatch.mock.calls[0][0] as Array<{ filename: string }>;
    expect(batch).toHaveLength(1);
    expect(batch[0].filename).toBe('main.py');
  });

  it('partitions artifact-only batches with nothing included', async () => {
    const { partitionBatchForTests } = await import('../src/watcher');
    const result = partitionBatchForTests([
      {
        filename: 'src/__pycache__/foo.pyc',
        absolutePath: '/repo/src/__pycache__/foo.pyc',
        changeType: 'modified',
        diff: 'diff',
        skipped: false,
      },
    ]);

    expect(result.included).toHaveLength(0);
    expect(result.excludedCount).toBe(1);
  });

  it('passes through a batch of only .ts files unchanged', async () => {
    const { startWatcher, waitForPendingChangeBuildsForTests } = await import('../src/watcher');
    const a = path.join(dir, 'a.ts');
    const b = path.join(dir, 'b.ts');
    await writeFile(a, 'const a = 1;\n');
    await writeFile(b, 'const b = 1;\n');
    await startWatcher(config(dir));

    await writeFile(a, 'const a = 2;\n');
    await writeFile(b, 'const b = 2;\n');
    watchers[0].emit('change', a);
    watchers[0].emit('change', b);
    await waitForPendingChangeBuildsForTests();
    await vi.advanceTimersByTimeAsync(2100);

    expect(translateBatch).toHaveBeenCalledTimes(1);
    expect(translateBatch.mock.calls[0][0]).toHaveLength(2);
  });
});
