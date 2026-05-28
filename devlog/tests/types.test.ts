import { describe, expect, it } from 'vitest';
import { formatLessonForClipboard, normalizeStoredEntry } from '../src/types';

describe('lesson helpers', () => {
  it('formats clipboard text with concept, explanation, and why it matters', () => {
    const text = formatLessonForClipboard({
      id: '1',
      timestamp: Date.now(),
      files: ['app.ts'],
      concept: 'Variable',
      summary: 'summary',
      explanation: 'You changed a value.',
      whyItMatters: 'Variables store state.',
    });

    expect(text).toContain('Variable');
    expect(text).toContain('You changed a value.');
    expect(text).toContain('💡 Variables store state.');
  });

  it('normalizes legacy stored entries', () => {
    const entry = normalizeStoredEntry({
      id: 'legacy',
      timestamp: '2026-01-01T00:00:00.000Z',
      filename: 'legacy.ts',
      explanation: 'legacy lesson',
      concept: 'Legacy',
    });

    expect(typeof entry.timestamp).toBe('number');
    expect(entry.files).toEqual(['legacy.ts']);
    expect(entry.summary).toBeTruthy();
    expect(entry.whyItMatters).toBeTruthy();
  });
});
