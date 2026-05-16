export interface LogEntry {
  id: string;
  timestamp: string;
  filename: string;
  changeType: 'created' | 'modified' | 'deleted';
  diff: string;
  explanation: string;
  concept: string;
  files?: string[];
  source: 'gemini' | 'demo' | 'local-fallback';
  warnings?: string[];
}

export interface DevLogConfig {
  geminiApiKey: string;
  demoMode: boolean;
  googleDocId: string;
  workspacePaths: string[];
  includeFilePaths: boolean;
  maxFileSizeKb: number;
  maxDiffChars: number;
  maxPromptChars: number;
  maxLessons: number;
  excludeGlobs: string[];
  redactSecrets: boolean;
  docsSyncEnabled: boolean;
}

export type ChangeType = LogEntry['changeType'];

export interface FileChange {
  filename: string;
  absolutePath: string;
  diff: string;
  changeType: ChangeType;
  skipped: boolean;
  skipReason?: string;
}

export interface SidebarStatus {
  watcher: 'stopped' | 'watching' | 'paused';
  translator: 'idle' | 'working' | 'paused' | 'error';
  docsSync: 'disabled' | 'idle' | 'syncing' | 'error';
  message?: string;
}

export interface TranslatorOptions {
  includeFilePaths: boolean;
  maxPromptChars: number;
  redactSecrets: boolean;
}

export interface OAuthConnectionResult {
  connected: boolean;
  detail: string;
}
