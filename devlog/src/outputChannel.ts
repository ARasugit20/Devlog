import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('DevLog');
  }
  return channel;
}

export function logDevLog(message: string): void {
  getOutputChannel().appendLine(message);
}
