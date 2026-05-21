import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { OAuth2Client } from 'google-auth-library';
import { google, docs_v1 } from 'googleapis';
import { statusStore } from './status';
import type { LogEntry, OAuthConnectionResult } from './types';

let docsClient: docs_v1.Docs | null = null;
let activeDocId = '';
let syncEnabled = false;
let activeAuthMode: 'oauth' | 'adc' | null = null;
let oauthClientConfig: { clientId: string; clientSecret: string; redirectUri: string } | null = null;

export function resetDocSyncStateForTests(): void {
  docsClient = null;
  activeDocId = '';
  syncEnabled = false;
  activeAuthMode = null;
  oauthClientConfig = null;
}

export function setDocSyncClientForTests(client: docs_v1.Docs | null): void {
  docsClient = client;
}

export function setDocSyncStateForTests(state: {
  activeDocId?: string;
  syncEnabled?: boolean;
  activeAuthMode?: 'oauth' | 'adc' | null;
}): void {
  activeDocId = state.activeDocId ?? activeDocId;
  syncEnabled = state.syncEnabled ?? syncEnabled;
  activeAuthMode = state.activeAuthMode ?? activeAuthMode;
}

function getOAuthCredentialsPath(): string | null {
  return (
    vscode.workspace.getConfiguration('devlog').get<string>('googleOAuthCredentialsPath', '').trim() ||
    null
  );
}

async function initOAuthClientConfig(): Promise<void> {
  const credentialsPath = getOAuthCredentialsPath();
  if (!credentialsPath) {
    oauthClientConfig = null;
    return;
  }

  try {
    const content = await vscode.workspace.fs.readFile(vscode.Uri.file(credentialsPath));
    const parsed = JSON.parse(Buffer.from(content).toString('utf8')) as {
      installed?: { client_id: string; client_secret: string; redirect_uris?: string[] };
    };
    const installed = parsed.installed;
    if (!installed?.client_id || !installed.client_secret) {
      throw new Error('OAuth credentials file is missing installed.client_id or installed.client_secret.');
    }
    oauthClientConfig = {
      clientId: installed.client_id,
      clientSecret: installed.client_secret,
      redirectUri: installed.redirect_uris?.[0] ?? 'http://localhost',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OAuth credential error.';
    statusStore.update({
      docsSync: 'error',
      message: `Google OAuth credentials could not be loaded: ${message}`,
    });
    oauthClientConfig = null;
  }
}

async function getOAuthTokenPath(): Promise<string> {
  const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const tokenDir = vscode.Uri.joinPath(vscode.Uri.file(rootPath), '.devlog');
  await vscode.workspace.fs.createDirectory(tokenDir);
  await fs.writeFile(vscode.Uri.joinPath(tokenDir, '.gitignore').fsPath, '*\n', 'utf8');
  return vscode.Uri.joinPath(tokenDir, 'google-oauth-token.json').fsPath;
}

function createOAuthClient(): OAuth2Client | null {
  if (!oauthClientConfig) {
    return null;
  }
  return new OAuth2Client(
    oauthClientConfig.clientId,
    oauthClientConfig.clientSecret,
    oauthClientConfig.redirectUri
  );
}

async function initDocsClientWithOAuthToken(): Promise<boolean> {
  const client = createOAuthClient();
  if (!client) {
    return false;
  }

  try {
    const tokenPath = await getOAuthTokenPath();
    const tokenPayload = await fs.readFile(tokenPath, 'utf8');
    client.setCredentials(JSON.parse(tokenPayload) as Record<string, unknown>);
    docsClient = google.docs({ version: 'v1', auth: client });
    activeAuthMode = 'oauth';
    statusStore.update({ docsSync: 'idle', message: 'Google Docs sync connected with OAuth token.' });
    return true;
  } catch {
    docsClient = null;
    activeAuthMode = null;
    statusStore.update({
      docsSync: 'error',
      message:
        'OAuth credentials found, but no token is connected yet. Run "DevLog: Connect Google Docs (OAuth)".',
    });
    return false;
  }
}

export async function initDocSync(docId: string, enabled: boolean): Promise<void> {
  activeDocId = docId.trim();
  syncEnabled = enabled;
  await initOAuthClientConfig();

  if (!syncEnabled) {
    docsClient = null;
    activeAuthMode = null;
    statusStore.update({ docsSync: 'disabled', message: 'Google Docs sync is disabled.' });
    return;
  }

  if (!activeDocId) {
    docsClient = null;
    activeAuthMode = null;
    statusStore.update({
      docsSync: 'disabled',
      message: 'Google Docs sync enabled, but no doc ID configured.',
    });
    return;
  }

  try {
    if (oauthClientConfig) {
      const connected = await initDocsClientWithOAuthToken();
      if (connected) {
        return;
      }
    }

    const adcAuth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/documents'],
    });
    docsClient = google.docs({ version: 'v1', auth: adcAuth });
    activeAuthMode = 'adc';
    statusStore.update({
      docsSync: 'idle',
      message:
        'Google Docs sync connected with Application Default Credentials. Configure OAuth for end-user use.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown auth error.';
    docsClient = null;
    activeAuthMode = null;
    statusStore.update({ docsSync: 'error', message: `Google Docs auth failed: ${message}` });
  }
}

export function formatEntry(entry: LogEntry): string {
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
  if (!syncEnabled || !activeDocId) {
    return;
  }
  if (!docsClient) {
    statusStore.update({ docsSync: 'error', message: 'Google Docs client is unavailable.' });
    return;
  }

  try {
    statusStore.update({ docsSync: 'syncing', message: 'Syncing lesson to Google Docs...' });
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
    statusStore.update({ docsSync: 'idle', message: 'Google Docs sync is healthy.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error.';
    statusStore.update({ docsSync: 'error', message: `Failed to append to Google Doc: ${message}` });
  }
}

export async function testDocSyncConnection(): Promise<OAuthConnectionResult> {
  if (!syncEnabled) {
    return { connected: false, detail: 'Google Docs sync is disabled in settings.' };
  }
  if (!activeDocId) {
    return { connected: false, detail: 'Set devlog.googleDocId first.' };
  }
  if (!docsClient) {
    return { connected: false, detail: 'Google Docs client is not connected.' };
  }

  try {
    await docsClient.documents.get({ documentId: activeDocId });
    const authMode = activeAuthMode === 'oauth' ? 'OAuth' : 'ADC';
    return { connected: true, detail: `Google Docs connection succeeded using ${authMode}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown connection error.';
    return { connected: false, detail: `Google Docs connection failed: ${message}` };
  }
}

export async function getGoogleOAuthConnectUrl(): Promise<string | null> {
  const client = createOAuthClient();
  if (!client) {
    return null;
  }
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/documents'],
    prompt: 'consent',
  });
}

export async function completeGoogleOAuth(authCode: string): Promise<OAuthConnectionResult> {
  const client = createOAuthClient();
  if (!client) {
    return { connected: false, detail: 'Google OAuth credentials are not configured.' };
  }
  if (!authCode.trim()) {
    return { connected: false, detail: 'Authorization code cannot be empty.' };
  }

  try {
    const { tokens } = await client.getToken(authCode.trim());
    client.setCredentials(tokens);
    const tokenPath = await getOAuthTokenPath();
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
    docsClient = google.docs({ version: 'v1', auth: client });
    activeAuthMode = 'oauth';
    statusStore.update({ docsSync: 'idle', message: 'Google Docs OAuth connected successfully.' });
    return { connected: true, detail: 'Google OAuth connected. Docs sync is ready.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OAuth error.';
    statusStore.update({ docsSync: 'error', message: `Google OAuth failed: ${message}` });
    return { connected: false, detail: `OAuth connection failed: ${message}` };
  }
}
