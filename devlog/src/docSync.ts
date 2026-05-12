import { google, docs_v1 } from 'googleapis';
import type { LogEntry } from './types';

let docsClient: docs_v1.Docs | null = null;
let activeDocId = '';

export function initDocSync(docId: string): void {
  activeDocId = docId.trim();
  if (!activeDocId) {
    console.warn('[DevLog] No Google Doc ID configured. Doc sync is disabled.');
    docsClient = null;
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/documents'],
    });
    docsClient = google.docs({ version: 'v1', auth });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown auth error.';
    console.warn(`[DevLog] Google Docs auth failed: ${message}`);
    docsClient = null;
  }
}

function formatEntry(entry: LogEntry): string {
  return `\n[${entry.timestamp}] ${entry.filename} — ${entry.concept}\n${entry.explanation}\n---`;
}

async function getDocumentEndIndex(docId: string): Promise<number> {
  if (!docsClient) {
    return 1;
  }
  const document = await docsClient.documents.get({ documentId: docId });
  const content = document.data.body?.content;
  if (!content || content.length === 0) {
    return 1;
  }
  const lastElement = content[content.length - 1];
  return lastElement.endIndex ?? 1;
}

export async function appendToDoc(entry: LogEntry): Promise<void> {
  if (!activeDocId) {
    console.warn('[DevLog] Skipping Google Doc sync because devlog.googleDocId is not set.');
    return;
  }
  if (!docsClient) {
    console.warn('[DevLog] Google Docs client is unavailable. Skipping doc sync.');
    return;
  }

  try {
    const endIndex = await getDocumentEndIndex(activeDocId);
    const insertIndex = Math.max(1, endIndex - 1);
    await docsClient.documents.batchUpdate({
      documentId: activeDocId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: insertIndex },
              text: formatEntry(entry),
            },
          },
        ],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error.';
    console.warn(`[DevLog] Failed to append entry to Google Doc: ${message}`);
  }
}
