export interface Lesson {
  id: string;
  timestamp: number;
  files: string[];
  concept: string;
  summary: string;
  explanation: string;
  whyItMatters: string;
  reflectionQuestion?: string;
}

export interface LogEntry extends Lesson {
  filename: string;
  changeType: 'created' | 'modified' | 'deleted';
  diff: string;
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

export function formatLessonForClipboard(entry: Lesson): string {
  const lines = [`${entry.concept}`, '', entry.explanation, '', `💡 ${entry.whyItMatters}`];
  if (entry.reflectionQuestion) {
    lines.push('', `🤔 ${entry.reflectionQuestion}`);
  }
  return lines.join('\n');
}

export function normalizeStoredEntry(raw: Partial<LogEntry> & Partial<Lesson>): LogEntry {
  const timestamp =
    typeof raw.timestamp === 'number'
      ? raw.timestamp
      : typeof raw.timestamp === 'string'
        ? Date.parse(raw.timestamp) || Date.now()
        : Date.now();
  const files = raw.files?.length ? raw.files : raw.filename ? [raw.filename] : ['unknown'];
  const filename = raw.filename ?? files[0];
  return {
    id: raw.id ?? `${timestamp}`,
    timestamp,
    files,
    concept: raw.concept ?? 'Lesson',
    summary: raw.summary ?? raw.explanation?.slice(0, 120) ?? '',
    explanation: raw.explanation ?? '',
    whyItMatters: raw.whyItMatters ?? 'This change helps you understand how your project evolves.',
    reflectionQuestion: raw.reflectionQuestion,
    filename,
    changeType: raw.changeType ?? 'modified',
    diff: raw.diff ?? '',
    source: raw.source ?? 'local-fallback',
    warnings: raw.warnings,
  };
}
