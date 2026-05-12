import * as fs from 'fs';
import * as path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import type { ChangeType, FileChange } from './types';
import { translateBatch } from './translator';
import { logger } from './logger';
import { appendToDoc } from './docSync';

const IGNORED = /(^|[/\\])(node_modules|\.git|\.next|out|dist|coverage|\.turbo|\.vercel)([/\\]|$)/;
const DEBOUNCE_MS = 2000;

let watcher: FSWatcher | null = null;
const previousContent = new Map<string, string>();
const debounceBuffer: FileChange[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let flushChain = Promise.resolve();

function shouldIgnore(filePath: string): boolean {
  return IGNORED.test(filePath);
}

function toRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath) || path.basename(filePath);
}

function generateDiff(before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const lines: string[] = [];
  const maxLength = Math.max(beforeLines.length, afterLines.length);

  for (let index = 0; index < maxLength; index += 1) {
    const oldLine = beforeLines[index];
    const newLine = afterLines[index];
    if (oldLine === newLine) {
      continue;
    }
    if (oldLine !== undefined) {
      lines.push(`- ${oldLine}`);
    }
    if (newLine !== undefined) {
      lines.push(`+ ${newLine}`);
    }
  }

  return lines.join('\n') || '(no textual changes)';
}

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function buildChange(
  root: string,
  filePath: string,
  changeType: ChangeType
): FileChange {
  const relativePath = toRelativePath(root, filePath);
  const before = previousContent.get(filePath) ?? '';
  const after = changeType === 'deleted' ? '' : readFileSafe(filePath);
  const diff = generateDiff(before, after);

  if (changeType === 'deleted') {
    previousContent.delete(filePath);
  } else {
    previousContent.set(filePath, after);
  }

  return {
    filename: relativePath,
    diff,
    changeType,
  };
}

function upsertBufferedChange(change: FileChange): void {
  const existingIndex = debounceBuffer.findIndex(
    (bufferedChange) => bufferedChange.filename === change.filename
  );

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
  flushChain = flushChain.then(async () => {
    const entry = await translateBatch(batch);
    if (!entry) {
      return;
    }

    logger.addEntry(entry);
    await appendToDoc(entry);
  });
}

function scheduleBufferedChange(root: string, filePath: string, changeType: ChangeType): void {
  upsertBufferedChange(buildChange(root, filePath, changeType));

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

export function startWatcher(workspacePath: string): void {
  stopWatcher();
  previousContent.clear();

  watcher = chokidar.watch(workspacePath, {
    ignoreInitial: true,
    ignored: (watchPath) => shouldIgnore(watchPath),
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    scheduleBufferedChange(workspacePath, filePath, 'created');
  });
  watcher.on('change', (filePath) => {
    scheduleBufferedChange(workspacePath, filePath, 'modified');
  });
  watcher.on('unlink', (filePath) => {
    scheduleBufferedChange(workspacePath, filePath, 'deleted');
  });
}

export function stopWatcher(): void {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }

  previousContent.clear();
  clearDebounceState();
}
