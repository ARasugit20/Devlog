import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileChange } from './types';

const generateContent = vi.fn();
const getGenerativeModel = vi.fn(() => ({ generateContent }));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel })),
}));

vi.mock('./outputChannel', () => ({
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

describe('translator helpers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const translator = await import('./translator');
    translator.resetTranslatorStateForTests();
  });

  it('parses valid Gemini JSON into a lesson', async () => {
    const { parseGeminiLesson } = await import('./translator');
    const lesson = parseGeminiLesson(
      JSON.stringify({
        concept: 'Variable',
        summary: 'You changed a value.',
        explanation: 'A variable stores data.',
        whyItMatters: 'Variables remember state.',
      })
    );
    expect(lesson?.concept).toBe('Variable');
    expect(lesson?.summary).toBeTruthy();
  });

  it('returns null for malformed Gemini JSON', async () => {
    const { parseGeminiLesson } = await import('./translator');
    expect(parseGeminiLesson('not-json')).toBeNull();
  });

  it('returns null when JSON is missing required fields', async () => {
    const { parseGeminiLesson } = await import('./translator');
    expect(parseGeminiLesson('{"explanation":"only"}')).toBeNull();
  });

  it('identifies quota-style errors', async () => {
    const { isQuotaError } = await import('./translator');
    expect(isQuotaError('429 too many requests')).toBe(true);
    expect(isQuotaError('bad json')).toBe(false);
  });

  it('counts added and removed diff lines', async () => {
    const { countChangedLines } = await import('./translator');
    expect(countChangedLines('+ add\n- remove\ncontext')).toEqual({ added: 1, removed: 1 });
  });

  it('summarizes one or many filenames', async () => {
    const { summarizeBatchFilenames } = await import('./translator');
    expect(summarizeBatchFilenames([change({ filename: 'one.ts' })])).toBe('one.ts');
    expect(summarizeBatchFilenames([change(), change({ filename: 'two.ts' })])).toBe('2 files');
  });
});

describe('translator runtime behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const translator = await import('./translator');
    translator.resetTranslatorStateForTests();
  });

  it('returns null for an empty batch', async () => {
    const { translateBatch } = await import('./translator');
    await expect(translateBatch([])).resolves.toBeNull();
  });

  it('returns null when no API key is configured', async () => {
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('', false);

    const entry = await translateBatch([change()]);

    expect(entry).toBeNull();
    expect(getGenerativeModel).not.toHaveBeenCalled();
  });

  it('uses demo mode without calling Gemini', async () => {
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('', true);

    const entry = await translateBatch([change()]);

    expect(entry?.source).toBe('demo');
    expect(entry?.summary).toBeTruthy();
    expect(entry?.whyItMatters).toBeTruthy();
    expect(getGenerativeModel).not.toHaveBeenCalled();
  });

  it('parses successful Gemini response into a structured lesson', async () => {
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
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('key', false);

    const entry = await translateBatch([change()]);

    expect(entry?.source).toBe('gemini');
    expect(entry?.concept).toBe('Variable');
    expect(entry?.whyItMatters).toBeTruthy();
    expect(getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          temperature: 0.4,
          responseMimeType: 'application/json',
        }),
      })
    );
  });

  it('omits file paths when configured', async () => {
    generateContent.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            concept: 'Privacy',
            summary: 'ok',
            explanation: 'ok',
            whyItMatters: 'ok',
          }),
      },
    });
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('key', false, { includeFilePaths: false });

    await translateBatch([change()]);

    const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).not.toContain('src/app.ts');
  });

  it('redacts secrets before sending prompt', async () => {
    generateContent.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            concept: 'Secret',
            summary: 'ok',
            explanation: 'ok',
            whyItMatters: 'ok',
          }),
      },
    });
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('key', false, { redactSecrets: true });

    await translateBatch([
      change({ diff: '+ const apiKey = "sk-abcdefghijklmnopqrstuvwxyz12345";' }),
    ]);

    const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).toContain('[REDACTED]');
    expect(prompt).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345');
  });

  it('retries transient Gemini failures', async () => {
    generateContent
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              concept: 'Retry',
              summary: 'ok',
              explanation: 'retry worked',
              whyItMatters: 'ok',
            }),
        },
      });
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('key', false);

    const entry = await translateBatch([change()]);

    expect(entry?.concept).toBe('Retry');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('surfaces quota errors as local paused entries', async () => {
    generateContent.mockRejectedValueOnce(new Error('429 quota exceeded'));
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('key', false);

    const entry = await translateBatch([change()]);

    expect(entry?.source).toBe('local-fallback');
    expect(entry?.concept).toBe('Rate limited');
  });
});
