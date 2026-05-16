import chokidar, { FSWatcher } from 'chokidar';
import { DiffEngine } from './diffEngine';
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

export function hasBufferedChangesForTests(): boolean {
  return debounceBuffer.length > 0;
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
  flushChain = flushChain
    .then(async () => {
      if (watcherPaused) {
        statusStore.update({ watcher: 'paused', message: 'Watcher paused. Changes are buffered.' });
        debounceBuffer.unshift(...batch);
        return;
      }
      const entry = await translateBatch(batch);
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

function clearDebounceState(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  debounceBuffer.length = 0;
  flushChain = Promise.resolve();
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
      void scheduleBufferedChange(workspacePath, filePath, 'created');
    });
    nextWatcher.on('change', (filePath) => {
      void scheduleBufferedChange(workspacePath, filePath, 'modified');
    });
    nextWatcher.on('unlink', (filePath) => {
      void scheduleBufferedChange(workspacePath, filePath, 'deleted');
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
