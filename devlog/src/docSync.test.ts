import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from './types';

const docsGet = vi.fn();
const docsBatchUpdate = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    docs: vi.fn(() => ({
      documents: {
        get: docsGet,
        batchUpdate: docsBatchUpdate,
      },
    })),
    auth: {
      GoogleAuth: vi.fn(),
    },
  },
}));

function entry(): LogEntry {
  return {
    id: '1',
    timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    files: ['src/app.ts'],
    filename: 'src/app.ts',
    changeType: 'modified',
    diff: 'diff',
    summary: 'A value was stored.',
    explanation: 'The code now stores a value.',
    whyItMatters: 'Variables let your program remember data.',
    concept: 'Variable',
    source: 'demo',
  };
}

describe('docSync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetDocSyncStateForTests } = await import('./docSync');
    resetDocSyncStateForTests();
  });

  it('formats lessons for document insertion', async () => {
    const { formatEntry } = await import('./docSync');

    const text = formatEntry(entry());

    expect(text).toContain('Variable');
    expect(text).toContain('The code now stores a value.');
    expect(text).toContain('Why it matters');
  });

  it('appendToDoc no-ops when sync is disabled', async () => {
    const { appendToDoc } = await import('./docSync');

    await appendToDoc(entry());

    expect(docsBatchUpdate).not.toHaveBeenCalled();
  });

  it('appendToDoc writes to configured document when client exists', async () => {
    docsGet.mockResolvedValueOnce({ data: { body: { content: [{ endIndex: 9 }] } } });
    docsBatchUpdate.mockResolvedValueOnce({});
    const { appendToDoc, setDocSyncClientForTests, setDocSyncStateForTests } = await import(
      './docSync'
    );
    setDocSyncClientForTests({
      documents: { get: docsGet, batchUpdate: docsBatchUpdate },
    } as never);
    setDocSyncStateForTests({ syncEnabled: true, activeDocId: 'doc-1', activeAuthMode: 'oauth' });

    await appendToDoc(entry());

    expect(docsBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        requestBody: expect.objectContaining({ requests: expect.any(Array) }),
      })
    );
  });

  it('testDocSyncConnection reports disabled state', async () => {
    const { testDocSyncConnection } = await import('./docSync');

    const result = await testDocSyncConnection();

    expect(result.connected).toBe(false);
    expect(result.detail).toContain('disabled');
  });

  it('testDocSyncConnection reports configured client success', async () => {
    docsGet.mockResolvedValueOnce({ data: {} });
    const { setDocSyncClientForTests, setDocSyncStateForTests, testDocSyncConnection } =
      await import('./docSync');
    setDocSyncClientForTests({
      documents: { get: docsGet, batchUpdate: docsBatchUpdate },
    } as never);
    setDocSyncStateForTests({ syncEnabled: true, activeDocId: 'doc-1', activeAuthMode: 'oauth' });

    const result = await testDocSyncConnection();

    expect(result.connected).toBe(true);
    expect(result.detail).toContain('OAuth');
  });
});
