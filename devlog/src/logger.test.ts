import { describe, expect, it } from 'vitest';
import { logger } from './logger';
import type { LogEntry } from './types';

function createEntry(index: number): LogEntry {
  return {
    id: `${index}`,
    timestamp: new Date().toISOString(),
    filename: `file-${index}.ts`,
    changeType: 'modified',
    diff: 'diff',
    explanation: 'explanation',
    concept: 'concept',
    source: 'local-fallback',
  };
}

describe('logger retention', () => {
  it('caps stored entries by maxEntries', () => {
    logger.clear();
    logger.setMaxEntries(20);
    logger.addEntry(createEntry(1));
    logger.addEntry(createEntry(2));
    logger.addEntry(createEntry(3));
    logger.addEntry(createEntry(4));
    logger.setMaxEntries(3);

    const entries = logger.getAll();
    expect(entries).toHaveLength(3);
    expect(entries[0].id).toBe('4');
    expect(entries[2].id).toBe('2');
  });
});
