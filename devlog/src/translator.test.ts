import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileChange } from './types';

const generateContent = vi.fn();
const getGenerativeModel = vi.fn(() => ({ generateContent }));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel })),
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

  it('parses valid Gemini JSON', async () => {
    const { parseGeminiJson } = await import('./translator');
    expect(parseGeminiJson('{"explanation":"hello","concept":"Variable"}')).toEqual({
      explanation: 'hello',
      concept: 'Variable',
    });
  });

  it('rejects malformed Gemini JSON', async () => {
    const { parseGeminiJson } = await import('./translator');
    expect(() => parseGeminiJson('not-json')).toThrow('did not contain JSON');
  });

  it('rejects JSON missing required fields', async () => {
    const { parseGeminiJson } = await import('./translator');
    expect(() => parseGeminiJson('{"explanation":"only"}')).toThrow('missing');
  });

  it('identifies quota-style errors', async () => {
    const { isQuotaError } = await import('./translator');
    expect(isQuotaError('429 too many requests')).toBe(true);
    expect(isQuotaError('quota exceeded')).toBe(true);
    expect(isQuotaError('rate limit')).toBe(true);
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

  it('summarizes mixed change types as modified', async () => {
    const { summarizeBatchChangeType } = await import('./translator');
    expect(
      summarizeBatchChangeType([
        change({ changeType: 'created' }),
        change({ changeType: 'deleted' }),
      ])
    ).toBe('modified');
  });

  it('applies skipped-file warnings to entries', async () => {
    const { appendSkippedWarnings } = await import('./translator');
    const entry = {
      id: '1',
      timestamp: 'now',
      filename: 'src/app.ts',
      changeType: 'modified' as const,
      diff: 'diff',
      explanation: 'x',
      concept: 'x',
      source: 'local-fallback' as const,
    };
    const result = appendSkippedWarnings(
      [change({ skipped: true, skipReason: 'diff truncated' })],
      entry
    );
    expect(result.warnings).toEqual(['src/app.ts: diff truncated']);
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

  it('returns local fallback when no API key is configured', async () => {
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('', false);

    const entry = await translateBatch([change()]);

    expect(entry?.source).toBe('local-fallback');
    expect(entry?.concept).toBe('Not configured');
    expect(getGenerativeModel).not.toHaveBeenCalled();
  });

  it('uses demo mode without calling Gemini', async () => {
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('', true);

    const entry = await translateBatch([change()]);

    expect(entry?.source).toBe('demo');
    expect(entry?.files).toEqual(['src/app.ts']);
    expect(getGenerativeModel).not.toHaveBeenCalled();
  });

  it('uses systemInstruction and parses successful Gemini response', async () => {
    generateContent.mockResolvedValueOnce({
      response: { text: () => '{"explanation":"Changed a variable.","concept":"Variable"}' },
    });
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('key', false);

    const entry = await translateBatch([change()]);

    expect(entry?.source).toBe('gemini');
    expect(entry?.concept).toBe('Variable');
    expect(getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ systemInstruction: expect.stringContaining('These files') })
    );
  });

  it('omits file paths when configured', async () => {
    generateContent.mockResolvedValueOnce({
      response: { text: () => '{"explanation":"ok","concept":"Privacy"}' },
    });
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('key', false, { includeFilePaths: false });

    await translateBatch([change()]);

    const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).not.toContain('src/app.ts');
  });

  it('redacts secrets before sending prompt', async () => {
    generateContent.mockResolvedValueOnce({
      response: { text: () => '{"explanation":"ok","concept":"Secret"}' },
    });
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('key', false, { redactSecrets: true });

    await translateBatch([change({ diff: '+ const apiKey = "sk-abcdefghijklmnopqrstuvwxyz12345";' })]);

    const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).toContain('[REDACTED]');
    expect(prompt).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345');
  });

  it('truncates prompts over maxPromptChars', async () => {
    generateContent.mockResolvedValueOnce({
      response: { text: () => '{"explanation":"ok","concept":"Limit"}' },
    });
    const { initTranslator, translateBatch } = await import('./translator');
    initTranslator('key', false, { maxPromptChars: 40 });

    await translateBatch([change({ diff: `+ ${'x'.repeat(200)}` })]);

    const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).toContain('prompt truncated');
  });

  it('retries transient Gemini failures', async () => {
    generateContent
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        response: { text: () => '{"explanation":"retry worked","concept":"Retry"}' },
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
