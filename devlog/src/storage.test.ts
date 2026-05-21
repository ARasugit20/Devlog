import { describe, expect, it, vi } from 'vitest';
import { logger } from './logger';
import { restoreLessons, wireLessonPersistence } from './storage';
import type { LogEntry } from './types';

function entry(id: string): LogEntry {
  return {
    id,
    timestamp: 'now',
    filename: `${id}.ts`,
    changeType: 'modified',
    diff: 'diff',
    explanation: 'explanation',
    concept: 'concept',
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
