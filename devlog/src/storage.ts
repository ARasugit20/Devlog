import * as vscode from 'vscode';
import { logger } from './logger';
import { normalizeStoredEntry, type LogEntry } from './types';

const LESSONS_KEY = 'devlog.lessons';

export async function restoreLessons(
  context: vscode.ExtensionContext,
  maxEntries: number
): Promise<void> {
  const stored = context.workspaceState.get<Array<Partial<LogEntry>>>(LESSONS_KEY, []);
  const normalized = stored.map((entry) => normalizeStoredEntry(entry)).slice(0, maxEntries);
  logger.setMaxEntries(maxEntries);
  logger.setAll(normalized);
}

export function wireLessonPersistence(context: vscode.ExtensionContext): void {
  const persist = () => {
    void context.workspaceState.update(LESSONS_KEY, logger.getAll());
  };

  logger.on('newEntry', persist);
  logger.on('clearLog', persist);

  context.subscriptions.push(
    { dispose: () => logger.off('newEntry', persist) },
    { dispose: () => logger.off('clearLog', persist) }
  );
}
