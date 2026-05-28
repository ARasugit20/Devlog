import { describe, expect, it, vi } from 'vitest';
import { logger } from './logger';
import { restoreLessons, wireLessonPersistence } from './storage';
import type { LogEntry } from './types';

function entry(id: string): LogEntry {
  const timestamp = Date.now();
  return {
    id,
    timestamp,
    files: [`${id}.ts`],
    filename: `${id}.ts`,
    changeType: 'modified',
    diff: 'diff',
    concept: 'concept',
    summary: 'summary',
    explanation: 'explanation',
    whyItMatters: 'why',
    source: 'demo',
  };
}

function context(stored: LogEntry[] = []) {
  const update = vi.fn();
  return {
    workspaceState: {
      get: vi.fn(() => stored),
      update,
    },
    subscriptions: [],
  };
}

describe('lesson persistence', () => {
  it('restores lessons from workspace state with retention cap', async () => {
    logger.clear();
    await restoreLessons(context([entry('1'), entry('2'), entry('3')]) as never, 2);

    expect(logger.getAll().map((item) => item.id)).toEqual(['1', '2']);
  });

  it('normalizes legacy string timestamps on restore', async () => {
    logger.clear();
    await restoreLessons(
      context([
        {
          id: 'legacy',
          timestamp: '2026-01-01T00:00:00.000Z' as unknown as number,
          files: ['legacy.ts'],
          filename: 'legacy.ts',
          changeType: 'modified',
          diff: 'diff',
          concept: 'Legacy',
          summary: '',
          explanation: 'legacy',
          whyItMatters: 'legacy',
          source: 'demo',
        },
      ]) as never,
      10
    );

    const restored = logger.getById('legacy');
    expect(typeof restored?.timestamp).toBe('number');
  });

  it('persists lessons when logger changes', () => {
    const fakeContext = context();
    wireLessonPersistence(fakeContext as never);

    logger.addEntry(entry('persisted'));

    expect(fakeContext.workspaceState.update).toHaveBeenCalledWith(
      'devlog.lessons',
      expect.arrayContaining([expect.objectContaining({ id: 'persisted' })])
    );
  });
});
