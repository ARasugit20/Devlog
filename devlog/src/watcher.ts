import chokidar, { FSWatcher } from 'chokidar';
import * as path from 'path';
import { DiffEngine } from './diffEngine';
import { logDevLog } from './outputChannel';
import { isExcluded, loadExcludePatterns } from './settings';
import { statusStore } from './status';
import { translateBatch } from './translator';
import { logger } from './logger';
import { appendToDoc } from './docSync';
import type { ChangeType, DevLogConfig, FileChange } from './types';

const DEBOUNCE_MS = 2000;
const MAX_BUFFER_SIZE = 200;

let watchers: FSWatcher[] = [];
let activeConfig: DevLogConfig | null = null;
let diffEngine: DiffEngine | null = null;
let watcherPaused = false;
const debounceBuffer: FileChange[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let flushChain = Promise.resolve();
let scheduleChain = Promise.resolve();

export function hasBufferedChangesForTests(): boolean {
  return debounceBuffer.length > 0;
}

export function getBufferedChangeCountForTests(): number {
  return debounceBuffer.length;
}

export async function flushBufferedChangesForTests(): Promise<void> {
  await scheduleChain;
  flushBufferedChanges();
  await flushChain;
}

export async function waitForPendingChangeBuildsForTests(): Promise<void> {
  await scheduleChain;
}

export function resetWatcherStateForTests(): void {
  stopWatcher();
}

export function partitionBatchForTests(
  batch: FileChange[]
): { included: FileChange[]; excludedCount: number } {
  return partitionBatch(batch);
}

function partitionBatch(batch: FileChange[]): { included: FileChange[]; excludedCount: number } {
  const patterns = loadExcludePatterns();
  const included: FileChange[] = [];
  let excludedCount = 0;

  for (const change of batch) {
    if (isExcluded(change.filename, patterns)) {
      excludedCount += 1;
    } else {
      included.push(change);
    }
  }

  return { included, excludedCount };
}

function upsertBufferedChange(change: FileChange): void {
  const existingIndex = debounceBuffer.findIndex((item) => item.absolutePath === change.absolutePath);

  if (existingIndex >= 0) {
    debounceBuffer[existingIndex] = change;
    return;
  }

  debounceBuffer.push(change);
}

function flushBufferedChanges(): void {
  if (debounceBuffer.length === 0) {
    return;
  }

  const batch = debounceBuffer.splice(0, debounceBuffer.length);
  const { included, excludedCount } = partitionBatch(batch);

  if (included.length === 0) {
    logDevLog(`[DevLog] Skipped artifact-only batch (${excludedCount} files filtered)`);
    return;
  }

  if (excludedCount > 0) {
    logDevLog(`[DevLog] Filtered ${excludedCount} artifact path(s) from batch`);
  }

  flushChain = flushChain
    .then(async () => {
      if (watcherPaused) {
        statusStore.update({ watcher: 'paused', message: 'Watcher paused. Changes are buffered.' });
        debounceBuffer.unshift(...included);
        return;
      }
      const entry = await translateBatch(included);
      if (!entry) {
        return;
      }

      logger.addEntry(entry);
      await appendToDoc(entry);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Unexpected watcher error.';
      statusStore.update({ watcher: 'watching', translator: 'error', message });
    });
}

async function scheduleBufferedChange(
  rootPath: string,
  filePath: string,
  changeType: ChangeType
): Promise<void> {
  if (!diffEngine) {
    return;
  }

  const relativePath = path.relative(rootPath, filePath) || path.basename(filePath);
  const patterns = loadExcludePatterns();
  if (isExcluded(relativePath.replace(/\\/g, '/'), patterns)) {
    return;
  }

  const change = await diffEngine.buildChange(rootPath, filePath, changeType);
  if (!change) {
    return;
  }
  upsertBufferedChange(change);
  if (debounceBuffer.length > MAX_BUFFER_SIZE) {
    debounceBuffer.splice(0, debounceBuffer.length - MAX_BUFFER_SIZE);
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushBufferedChanges();
  }, DEBOUNCE_MS);
}

function queueBufferedChange(rootPath: string, filePath: string, changeType: ChangeType): void {
  scheduleChain = scheduleChain
    .then(() => scheduleBufferedChange(rootPath, filePath, changeType))
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Unexpected file change error.';
      statusStore.update({ watcher: 'watching', translator: 'error', message });
    });
}

function clearDebounceState(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  debounceBuffer.length = 0;
  flushChain = Promise.resolve();
  scheduleChain = Promise.resolve();
}

export async function startWatcher(config: DevLogConfig): Promise<void> {
  if (!config.workspacePaths.length) {
    statusStore.update({ watcher: 'stopped', message: 'Open a workspace folder to start watching.' });
    return;
  }
  stopWatcher();
  activeConfig = config;
  diffEngine = new DiffEngine(config);
  await diffEngine.seedWorkspaceBaseline(config.workspacePaths);

  watchers = config.workspacePaths.map((workspacePath) => {
    const nextWatcher = chokidar.watch(workspacePath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
    });

    nextWatcher.on('add', (filePath) => {
      queueBufferedChange(workspacePath, filePath, 'created');
    });
    nextWatcher.on('change', (filePath) => {
      queueBufferedChange(workspacePath, filePath, 'modified');
    });
    nextWatcher.on('unlink', (filePath) => {
      queueBufferedChange(workspacePath, filePath, 'deleted');
    });
    nextWatcher.on('error', (error) => {
      const message = error instanceof Error ? error.message : 'Unknown watcher error.';
      statusStore.update({ watcher: 'watching', message });
    });
    return nextWatcher;
  });

  watcherPaused = false;
  statusStore.update({ watcher: 'watching', message: 'Watching workspace changes.' });
}

export function stopWatcher(): void {
  for (const watcher of watchers) {
    void watcher.close();
  }
  watchers = [];

  activeConfig = null;
  diffEngine?.clear();
  diffEngine = null;
  watcherPaused = false;
  clearDebounceState();
  statusStore.update({ watcher: 'stopped', message: 'Watcher stopped.' });
}

export function pauseWatcher(): void {
  watcherPaused = true;
  statusStore.update({ watcher: 'paused', message: 'Watcher paused. Click resume to continue.' });
}

export function resumeWatcher(): void {
  watcherPaused = false;
  if (activeConfig?.workspacePaths.length) {
    statusStore.update({ watcher: 'watching', message: 'Watching workspace changes.' });
  }
  if (debounceBuffer.length > 0) {
    flushBufferedChanges();
  }
}
