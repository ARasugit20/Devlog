export interface LogEntry {
  id: string;
  timestamp: string;
  filename: string;
  changeType: 'created' | 'modified' | 'deleted';
  diff: string;
  explanation: string;
  concept: string;
}

export interface DevLogConfig {
  geminiApiKey: string;
  googleDocId: string;
  workspacePath: string;
}

export type ChangeType = LogEntry['changeType'];

export interface FileChange {
  filename: string;
  diff: string;
  changeType: ChangeType;
}
