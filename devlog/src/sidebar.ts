import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import type { LogEntry } from './types';

let currentView: vscode.WebviewView | undefined;

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const webviewDir = vscode.Uri.joinPath(extensionUri, 'webview');
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'panel.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'panel.js'));
  const templatePath = path.join(webviewDir.fsPath, 'panel.html');
  const template = fs.readFileSync(templatePath, 'utf8');

  return template
    .split('{{styleUri}}').join(styleUri.toString())
    .split('{{scriptUri}}').join(scriptUri.toString())
    .split('{{cspSource}}').join(webview.cspSource);
}

function postEntry(webview: vscode.Webview, entry: LogEntry): void {
  void webview.postMessage({ type: 'newEntry', entry });
}

function bindWebview(webviewView: vscode.WebviewView, extensionUri: vscode.Uri): void {
  webviewView.webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview')],
  };
  webviewView.webview.html = getWebviewHtml(webviewView.webview, extensionUri);

  webviewView.webview.onDidReceiveMessage((message: { command?: string }) => {
    if (message.command === 'clearLog') {
      logger.clear();
    }
  });

  for (const entry of logger.getAll()) {
    postEntry(webviewView.webview, entry);
  }
}

class DevLogViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    currentView = webviewView;
    bindWebview(webviewView, this.extensionUri);

    webviewView.onDidDispose(() => {
      if (currentView === webviewView) {
        currentView = undefined;
      }
    });
  }
}

export function createSidebar(context: vscode.ExtensionContext): void {
  const provider = new DevLogViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('devlog-panel', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  logger.on('newEntry', onNewEntry);
  logger.on('clearLog', onClearLog);

  context.subscriptions.push(
    { dispose: () => logger.off('newEntry', onNewEntry) }
  );

  context.subscriptions.push(
    { dispose: () => logger.off('clearLog', onClearLog) }
  );
}

function onNewEntry(entry: LogEntry): void {
  if (currentView) {
    postEntry(currentView.webview, entry);
  }
}

function onClearLog(): void {
  if (currentView) {
    void currentView.webview.postMessage({ type: 'clearLog' });
  }
}
