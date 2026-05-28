import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileChange } from '../src/types';

const generateContent = vi.fn();
const getGenerativeModel = vi.fn(() => ({ generateContent }));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel })),
}));

vi.mock('../src/outputChannel', () => ({
  logDevLog: vi.fn(),
}));

function change(overrides: Partial<FileChange> = {}): FileChange {
  return {
    filename: 'src/app.ts',
    absolutePath: '/repo/src/app.ts',
    changeType: 'modified',
    diff: '+ const value = 1;\n- const value = 0;',
    skipped: false,
    ...overrides,
  };
}

describe('translator structured lessons', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const translator = await import('../src/translator');
    translator.resetTranslatorStateForTests();
  });

  it('parses valid Gemini JSON into a Lesson', async () => {
    const { parseGeminiLesson } = await import('../src/translator');
    const lesson = parseGeminiLesson(
      JSON.stringify({
        concept: 'Variable',
        summary: 'You changed a value.',
        explanation: 'A variable stores data you can reuse later.',
        whyItMatters: 'Variables are how programs remember things.',
      })
    );

    expect(lesson).not.toBeNull();
    expect(lesson?.concept).toBe('Variable');
    expect(lesson?.summary).toBeTruthy();
    expect(lesson?.explanation).toBeTruthy();
    expect(lesson?.whyItMatters).toBeTruthy();
  });

  it('returns null when model returns the string null', async () => {
    const { parseGeminiLesson } = await import('../src/translator');
    expect(parseGeminiLesson('null')).toBeNull();
  });

  it('returns null for malformed JSON', async () => {
    const { parseGeminiLesson } = await import('../src/translator');
    expect(parseGeminiLesson('not-json')).toBeNull();
  });

  it('returns a typed LogEntry when Gemini returns valid JSON', async () => {
    generateContent.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            concept: 'Variable',
            summary: 'You changed a value.',
            explanation: 'A variable stores data you can reuse later.',
            whyItMatters: 'Variables are how programs remember things.',
          }),
      },
    });
    const { initTranslator, translateBatch } = await import('../src/translator');
    initTranslator('key', false);

    const entry = await translateBatch([change()]);

    expect(entry?.concept).toBe('Variable');
    expect(entry?.summary).toBeTruthy();
    expect(entry?.whyItMatters).toBeTruthy();
    expect(entry?.source).toBe('gemini');
  });

  it('returns null when model returns null string', async () => {
    generateContent.mockResolvedValueOnce({
      response: { text: () => 'null' },
    });
    const { initTranslator, translateBatch } = await import('../src/translator');
    initTranslator('key', false);

    const entry = await translateBatch([change()]);

    expect(entry).toBeNull();
  });

  it('returns null for malformed model JSON', async () => {
    generateContent.mockResolvedValue({
      response: { text: () => 'not-json' },
    });
    const { initTranslator, translateBatch } = await import('../src/translator');
    initTranslator('key', false);

    const entry = await translateBatch([change()]);

    expect(entry).toBeNull();
  });

  it('returns a mock Lesson in demoMode without calling Gemini', async () => {
    const { initTranslator, translateBatch } = await import('../src/translator');
    initTranslator('', true);

    const entry = await translateBatch([change()]);

    expect(entry?.source).toBe('demo');
    expect(entry?.summary).toBeTruthy();
    expect(entry?.whyItMatters).toBeTruthy();
    expect(getGenerativeModel).not.toHaveBeenCalled();
  });
});
