import * as vscode from 'vscode';
import { createSidebar } from './sidebar';
import { completeGoogleOAuth, getGoogleOAuthConnectUrl, initDocSync, testDocSyncConnection } from './docSync';
import { logger } from './logger';
import { wireLessonPersistence, restoreLessons } from './storage';
import { getGeminiApiKey, setGeminiApiKey } from './secrets';
import { getDefaultExcludeGlobs, getWorkspacePaths } from './settings';
import { startWatcher, stopWatcher, pauseWatcher, resumeWatcher } from './watcher';
import { statusStore } from './status';
import { initTranslator } from './translator';
import type { DevLogConfig, SidebarStatus } from './types';

async function readConfig(context: vscode.ExtensionContext): Promise<DevLogConfig> {
  const configuration = vscode.workspace.getConfiguration('devlog');
  const workspacePaths = getWorkspacePaths();

  return {
    geminiApiKey: await getGeminiApiKey(context),
    demoMode: configuration.get<boolean>('demoMode', false),
    docsSyncEnabled: configuration.get<boolean>('docsSyncEnabled', false),
    googleDocId: configuration.get<string>('googleDocId', '').trim(),
    workspacePaths,
    includeFilePaths: configuration.get<boolean>('includeFilePaths', true),
    maxFileSizeKb: Math.max(16, configuration.get<number>('maxFileSizeKb', 512)),
    maxDiffChars: Math.max(800, configuration.get<number>('maxDiffChars', 12000)),
    maxPromptChars: Math.max(1200, configuration.get<number>('maxPromptChars', 12000)),
    maxLessons: Math.max(20, configuration.get<number>('maxLessons', 250)),
    excludeGlobs: configuration.get<string[]>('excludeGlobs', getDefaultExcludeGlobs()),
    redactSecrets: configuration.get<boolean>('redactSecrets', true),
  };
}

function showStartupWarnings(config: DevLogConfig): void {
  if (!config.geminiApiKey && !config.demoMode) {
    void vscode.window.showWarningMessage(
      'DevLog: Run "DevLog: Set Gemini API Key" to enable AI lessons, or turn on devlog.demoMode to preview without Gemini.'
    );
  }
  if (!config.workspacePaths.length) {
    void vscode.window.showWarningMessage(
      'DevLog: Open a workspace folder to start watching file changes.'
    );
  }
}

async function activateDevLog(context: vscode.ExtensionContext): Promise<void> {
  const config = await readConfig(context);
  showStartupWarnings(config);
  loggerConfigFromSettings(config);
  initTranslator(config.geminiApiKey, config.demoMode, {
    includeFilePaths: config.includeFilePaths,
    maxPromptChars: config.maxPromptChars,
    redactSecrets: config.redactSecrets,
  });
  await initDocSync(config.googleDocId, config.docsSyncEnabled);
  await restoreLessons(context, config.maxLessons);

  if (config.workspacePaths.length) {
    await startWatcher(config);
  }
}

function loggerConfigFromSettings(config: DevLogConfig): void {
  logger.setMaxEntries(config.maxLessons);
}

async function promptForGeminiApiKey(context: vscode.ExtensionContext): Promise<void> {
  const apiKey = await vscode.window.showInputBox({
    title: 'DevLog Gemini API Key',
    prompt: 'Paste a Google Gemini API key. DevLog stores it in VS Code Secret Storage.',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'AIza...',
    validateInput: (value) => (value.trim() ? undefined : 'API key cannot be empty.'),
  });

  if (apiKey === undefined) {
    return;
  }

  await setGeminiApiKey(context, apiKey);
  await activateDevLog(context);
  void vscode.window.showInformationMessage('DevLog saved your Gemini API key.');
}

export function activate(context: vscode.ExtensionContext): void {
  createSidebar(context);
  wireLessonPersistence(context);
  void activateDevLog(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('devlog.start', () => {
      void activateDevLog(context).then(() => {
        void vscode.window.showInformationMessage('DevLog is watching for file changes.');
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devlog.setApiKey', () => {
      void promptForGeminiApiKey(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devlog.pause', () => {
      pauseWatcher();
      void vscode.window.showInformationMessage('DevLog watcher paused.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devlog.resume', () => {
      resumeWatcher();
      void vscode.window.showInformationMessage('DevLog watcher resumed.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devlog.restart', () => {
      void activateDevLog(context).then(() => {
        void vscode.window.showInformationMessage('DevLog restarted with current settings.');
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devlog.privacyInfo', () => {
      void vscode.window.showInformationMessage(
        'DevLog can send diffs to Gemini for explanations. Use devlog.redactSecrets, devlog.includeFilePaths, max size/length limits, and demo mode to control data sharing.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devlog.testDocSync', () => {
      void testDocSyncConnection().then((result) => {
        if (result.connected) {
          void vscode.window.showInformationMessage(result.detail);
          return;
        }
        void vscode.window.showWarningMessage(result.detail);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devlog.connectGoogleDocs', () => {
      void (async () => {
        const authUrl = await getGoogleOAuthConnectUrl();
        if (!authUrl) {
          void vscode.window.showWarningMessage(
            'Set devlog.googleOAuthCredentialsPath to your Google OAuth desktop credentials JSON first.'
          );
          return;
        }

        await vscode.env.openExternal(vscode.Uri.parse(authUrl));
        const code = await vscode.window.showInputBox({
          title: 'DevLog Google OAuth',
          prompt: 'Paste the Google authorization code from the browser flow.',
          ignoreFocusOut: true,
        });
        if (!code) {
          return;
        }

        const result = await completeGoogleOAuth(code);
        if (result.connected) {
          void vscode.window.showInformationMessage(result.detail);
        } else {
          void vscode.window.showWarningMessage(result.detail);
        }
      })();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('devlog') ||
        event.affectsConfiguration('devlog.geminiApiKey') ||
        event.affectsConfiguration('devlog.googleDocId') ||
        event.affectsConfiguration('devlog.demoMode') ||
        event.affectsConfiguration('devlog.docsSyncEnabled')
      ) {
        void activateDevLog(context);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void activateDevLog(context);
    })
  );

  const statusListener = (status: SidebarStatus) => {
    if (status.message && status.translator === 'error') {
      void vscode.window.setStatusBarMessage(`DevLog: ${status.message}`, 5000);
    }
  };
  statusStore.on('statusChanged', statusListener);
  context.subscriptions.push({
    dispose: () => statusStore.off('statusChanged', statusListener),
  });
}

export function deactivate(): void {
  stopWatcher();
}
