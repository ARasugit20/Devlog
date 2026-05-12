import * as vscode from 'vscode';

const GEMINI_API_KEY_SECRET = 'devlog.geminiApiKey';

export async function getGeminiApiKey(context: vscode.ExtensionContext): Promise<string> {
  const fromSecret = await context.secrets.get(GEMINI_API_KEY_SECRET);
  if (fromSecret?.trim()) {
    return fromSecret.trim();
  }

  return vscode.workspace.getConfiguration('devlog').get<string>('geminiApiKey', '').trim();
}

export async function setGeminiApiKey(
  context: vscode.ExtensionContext,
  apiKey: string
): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await context.secrets.delete(GEMINI_API_KEY_SECRET);
    return;
  }

  await context.secrets.store(GEMINI_API_KEY_SECRET, trimmed);

  const configuration = vscode.workspace.getConfiguration('devlog');
  if (configuration.get<string>('geminiApiKey')) {
    await configuration.update('geminiApiKey', '', vscode.ConfigurationTarget.Global);
  }
}
