import * as vscode from 'vscode';
import { createSidebar } from './sidebar';
import { initDocSync } from './docSync';
import { getGeminiApiKey, setGeminiApiKey } from './secrets';
import { startWatcher, stopWatcher } from './watcher';
import { initTranslator } from './translator';
import type { DevLogConfig } from './types';

async function readConfig(context: vscode.ExtensionContext): Promise<DevLogConfig> {
  const configuration = vscode.workspace.getConfiguration('devlog');
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  return {
    geminiApiKey: await getGeminiApiKey(context),
    googleDocId: configuration.get<string>('googleDocId', '').trim(),
    workspacePath: workspaceFolder?.uri.fsPath ?? '',
  };
}

function showStartupWarnings(config: DevLogConfig): void {
  if (!config.geminiApiKey) {
    void vscode.window.showWarningMessage(
      'DevLog: Run "DevLog: Set Gemini API Key" to enable AI lesson translations.'
    );
  }
  if (!config.googleDocId) {
    void vscode.window.showWarningMessage(
      'DevLog: Set devlog.googleDocId to sync lessons to Google Docs.'
    );
  }
  if (!config.workspacePath) {
    void vscode.window.showWarningMessage(
      'DevLog: Open a workspace folder to start watching file changes.'
    );
  }
}

async function activateDevLog(context: vscode.ExtensionContext): Promise<void> {
  const config = await readConfig(context);
  showStartupWarnings(config);
  initTranslator(config.geminiApiKey);
  initDocSync(config.googleDocId);

  if (config.workspacePath) {
    startWatcher(config.workspacePath);
  }
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
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('devlog.googleDocId')) {
        void activateDevLog(context);
      }
    })
  );
}

export function deactivate(): void {
  stopWatcher();
}
