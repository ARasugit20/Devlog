import { EventEmitter } from 'events';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevLogConfig, LogEntry } from './types';

const watchers: Array<EventEmitter & { close: ReturnType<typeof vi.fn> }> = [];
const translateBatch = vi.fn();
const appendToDoc = vi.fn();

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => {
      const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
      watchers.push(watcher);
      return watcher;
    }),
  },
}));

vi.mock('./translator', () => ({
  translateBatch,
}));

vi.mock('./docSync', () => ({
  appendToDoc,
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

function entry(): LogEntry {
  return {
    id: '1',
    timestamp: 'now',
    filename: 'file.ts',
    changeType: 'modified',
    diff: 'diff',
    explanation: 'x',
    concept: 'x',
    source: 'demo',
  };
}

describe('watcher batching', () => {
  let dir = '';

  beforeEach(async () => {
    vi.useFakeTimers();
    watchers.length = 0;
    translateBatch.mockResolvedValue(entry());
    appendToDoc.mockResolvedValue(undefined);
    dir = await mkdtemp(path.join(tmpdir(), 'devlog-watch-'));
    const { resetWatcherStateForTests } = await import('./watcher');
    resetWatcherStateForTests();
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { resetWatcherStateForTests } = await import('./watcher');
    resetWatcherStateForTests();
    const { rm } = await import('fs/promises');
    await rm(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('does not start watchers for an empty workspace list', async () => {
    const { startWatcher, waitForPendingChangeBuildsForTests } = await import('./watcher');
    await startWatcher({ ...config(dir), workspacePaths: [] });

    expect(watchers).toHaveLength(0);
  });

  it('debounces two rapid file changes into one translateBatch call', async () => {
    const { startWatcher, waitForPendingChangeBuildsForTests } = await import('./watcher');
    const fileA = path.join(dir, 'a.ts');
    const fileB = path.join(dir, 'b.ts');
    await writeFile(fileA, 'const a = 1;\n');
    await writeFile(fileB, 'const b = 1;\n');
    await startWatcher(config(dir));

    await writeFile(fileA, 'const a = 2;\n');
    await writeFile(fileB, 'const b = 2;\n');
    watchers[0].emit('change', fileA);
    watchers[0].emit('change', fileB);
    await waitForPendingChangeBuildsForTests();
    await vi.advanceTimersByTimeAsync(2100);

    expect(translateBatch).toHaveBeenCalledTimes(1);
    expect(translateBatch.mock.calls[0][0]).toHaveLength(2);
  });

  it('upserts repeated changes for the same file', async () => {
    const { startWatcher, waitForPendingChangeBuildsForTests } = await import('./watcher');
    const file = path.join(dir, 'same.ts');
    await writeFile(file, 'const value = 1;\n');
    await startWatcher(config(dir));

    await writeFile(file, 'const value = 2;\n');
    watchers[0].emit('change', file);
    await writeFile(file, 'const value = 3;\n');
    watchers[0].emit('change', file);
    await waitForPendingChangeBuildsForTests();
    await vi.advanceTimersByTimeAsync(2100);

    expect(translateBatch.mock.calls[0][0]).toHaveLength(1);
    expect(translateBatch.mock.calls[0][0][0].diff).toContain('const value = 3;');
  });

  it('pauseWatcher keeps buffered changes until resumeWatcher', async () => {
    const {
      getBufferedChangeCountForTests,
      pauseWatcher,
      resumeWatcher,
      startWatcher,
      waitForPendingChangeBuildsForTests,
    } = await import('./watcher');
    const file = path.join(dir, 'paused.ts');
    await writeFile(file, 'const value = 1;\n');
    await startWatcher(config(dir));

    await writeFile(file, 'const value = 2;\n');
    watchers[0].emit('change', file);
    await waitForPendingChangeBuildsForTests();
    pauseWatcher();
    await vi.advanceTimersByTimeAsync(2100);

    expect(getBufferedChangeCountForTests()).toBe(1);
    expect(translateBatch).not.toHaveBeenCalled();

    resumeWatcher();
    await vi.runAllTimersAsync();
    expect(translateBatch).toHaveBeenCalledTimes(1);
  });

  it('flush helper does nothing for an empty batch', async () => {
    const { flushBufferedChangesForTests } = await import('./watcher');
    await flushBufferedChangesForTests();

    expect(translateBatch).not.toHaveBeenCalled();
  });
});
