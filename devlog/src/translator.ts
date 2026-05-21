import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import { redactSecrets } from './privacy';
import { statusStore } from './status';
import type { ChangeType, FileChange, LogEntry, TranslatorOptions } from './types';

const BATCH_SYSTEM_PROMPT =
  'You are DevLog, a coding teacher. These files all changed together as part of one coding session. Explain in 3-4 sentences what was built or changed overall, like a teacher explaining one complete thought to a beginner. No jargon. Give one concept name for the overall change (e.g. React Hook, API call, For loop). Return JSON only, no markdown, no backticks: { explanation: string, concept: string }';

interface GeminiResponse {
  explanation: string;
  concept: string;
}

let client: GoogleGenerativeAI | null = null;
let demoModeEnabled = false;
let quotaPausedUntil = 0;
let options: TranslatorOptions = {
  includeFilePaths: true,
  maxPromptChars: 12000,
  redactSecrets: true,
};

export function resetTranslatorStateForTests(): void {
  client = null;
  demoModeEnabled = false;
  quotaPausedUntil = 0;
  options = {
    includeFilePaths: true,
    maxPromptChars: 12000,
    redactSecrets: true,
  };
}

export function initTranslator(
  apiKey: string,
  demoMode = false,
  nextOptions: Partial<TranslatorOptions> = {}
): void {
  const trimmedKey = apiKey.trim();
  demoModeEnabled = demoMode;
  options = { ...options, ...nextOptions };
  client = trimmedKey ? new GoogleGenerativeAI(trimmedKey) : null;
  if (!client && !demoModeEnabled) {
    statusStore.update({ translator: 'paused', message: 'Gemini key is not configured.' });
  } else {
    statusStore.update({ translator: 'idle', message: undefined });
  }
}

function buildEntry(
  filename: string,
  diff: string,
  changeType: ChangeType,
  explanation: string,
  concept: string
): LogEntry {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    filename,
    changeType,
    diff,
    explanation,
    concept,
    source: demoModeEnabled ? 'demo' : 'gemini',
  };
}

export function parseGeminiJson(text: string): GeminiResponse {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Gemini response did not contain JSON.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<GeminiResponse>;
  if (!parsed.explanation || !parsed.concept) {
    throw new Error('Gemini JSON missing explanation or concept.');
  }

  return { explanation: parsed.explanation, concept: parsed.concept };
}

export function isQuotaError(message: string): boolean {
  return /429|quota exceeded|rate limit|too many requests/i.test(message);
}

function pauseForQuotaError(message: string): number {
  const retryMatch = message.match(/retry in ([\d.]+)s/i);
  const seconds = retryMatch ? Math.max(1, Math.ceil(Number(retryMatch[1]))) : 60;
  quotaPausedUntil = Date.now() + seconds * 1000;
  return seconds;
}

export function formatTranslationError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown translation error.';
  if (isQuotaError(message)) {
    const seconds = pauseForQuotaError(message);
    return `Gemini free-tier quota was exceeded. DevLog will pause translations for about ${seconds} seconds, then try again.`;
  }

  return 'DevLog could not translate this change right now. Try again after a short wait.';
}

function toLocalFallbackEntry(
  filename: string,
  diff: string,
  changeType: ChangeType,
  explanation: string,
  concept = 'Local fallback',
  warnings: string[] = []
): LogEntry {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    filename,
    changeType,
    diff,
    explanation,
    concept,
    source: 'local-fallback',
    warnings,
  };
}

export function countChangedLines(diff: string): { added: number; removed: number } {
  return diff.split('\n').reduce(
    (counts, line) => {
      if (line.startsWith('+ ')) {
        counts.added += 1;
      }
      if (line.startsWith('- ')) {
        counts.removed += 1;
      }
      return counts;
    },
    { added: 0, removed: 0 }
  );
}

function demoExplanationForBatch(
  changes: FileChange[],
  filename: string,
  diff: string,
  changeType: ChangeType
): LogEntry {
  const totals = changes.reduce(
    (counts, change) => {
      const changedLines = countChangedLines(change.diff);
      counts.added += changedLines.added;
      counts.removed += changedLines.removed;
      return counts;
    },
    { added: 0, removed: 0 }
  );
  const fileList = changes.map((change) => change.filename).slice(0, 3).join(', ');
  const extraFiles = changes.length > 3 ? ` and ${changes.length - 3} more` : '';
  const explanation = `Demo mode: DevLog grouped ${changes.length} file change(s) together because they happened within the same short coding moment. The batch touched ${fileList}${extraFiles}, with about ${totals.added} added line(s) and ${totals.removed} removed line(s). Think of this as one complete coding-session change instead of a pile of separate edits. In the real version, Gemini would read these diffs and explain the overall idea in beginner-friendly language.`;

  return {
    ...buildEntry(filename, diff, changeType, explanation, 'Batched change'),
    source: 'demo',
    files: changes.map((change) => change.filename),
  };
}

export function summarizeBatchFilenames(changes: FileChange[]): string {
  if (changes.length === 1) {
    return changes[0].filename;
  }

  return `${changes.length} files`;
}

export function summarizeBatchChangeType(changes: FileChange[]): ChangeType {
  const firstType = changes[0]?.changeType;
  if (firstType && changes.every((change) => change.changeType === firstType)) {
    return firstType;
  }

  return 'modified';
}

export function summarizeBatchDiff(changes: FileChange[]): string {
  return changes
    .map(
      (change) =>
        `File: ${change.filename}\nChange type: ${change.changeType}\nDiff:\n${change.diff}`
    )
    .join('\n\n---\n\n');
}

export function buildBatchUserMessage(changes: FileChange[]): string {
  const entries = changes.map((change) => {
    const filenamePrefix = options.includeFilePaths ? `File: ${change.filename}\n` : '';
    return `${filenamePrefix}Change type: ${change.changeType}\nDiff:\n${redactSecrets(
      change.diff,
      options.redactSecrets
    )}`;
  });
  const message = entries.join('\n\n');
  if (message.length <= options.maxPromptChars) {
    return message;
  }
  return `${message.slice(0, options.maxPromptChars)}\n\n... prompt truncated for safety ...`;
}

async function callGemini(systemInstruction: string, prompt: string): Promise<GeminiResponse> {
  if (!client) {
    throw new Error('Gemini client is not initialized.');
  }
  const model = client.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
  });
  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
  });
  return parseGeminiJson(result.response.text());
}

async function callGeminiWithRetry(
  systemInstruction: string,
  prompt: string
): Promise<GeminiResponse> {
  const attempts = [0, 800, 1600];
  let lastError: unknown = null;
  for (const waitMs of attempts) {
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    try {
      return await callGemini(systemInstruction, prompt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : '';
      if (isQuotaError(message)) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gemini request failed.');
}

function buildPausedEntry(filename: string, diff: string, changeType: ChangeType): LogEntry {
  const seconds = Math.max(1, Math.ceil((quotaPausedUntil - Date.now()) / 1000));
  return toLocalFallbackEntry(
    filename,
    diff,
    changeType,
    `Gemini translation is paused due to rate limits. DevLog will retry automatically in about ${seconds} seconds.`,
    'Rate limited',
    ['queued-local-fallback']
  );
}

function appendSkippedWarnings(changes: FileChange[], entry: LogEntry): LogEntry {
  const warnings = changes
    .filter((change) => change.skipped && change.skipReason)
    .map((change) => `${change.filename}: ${change.skipReason}`);
  if (warnings.length === 0) {
    return entry;
  }
  return {
    ...entry,
    warnings,
  };
}

export { appendSkippedWarnings };

export async function translateBatch(changes: FileChange[]): Promise<LogEntry | null> {
  if (changes.length === 0) {
    return null;
  }

  const filename = summarizeBatchFilenames(changes);
  const changeType = summarizeBatchChangeType(changes);
  const diff = summarizeBatchDiff(changes);

  if (demoModeEnabled) {
    statusStore.update({ translator: 'idle', message: 'Demo mode is active.' });
    return appendSkippedWarnings(changes, demoExplanationForBatch(changes, filename, diff, changeType));
  }

  if (!client) {
    return toLocalFallbackEntry(
      filename,
      diff,
      changeType,
      'Run DevLog: Set Gemini API Key to enable explanations.',
      'Not configured'
    );
  }

  if (Date.now() < quotaPausedUntil) {
    statusStore.update({ translator: 'paused', message: 'Gemini rate limit pause in effect.' });
    return buildPausedEntry(filename, diff, changeType);
  }

  statusStore.update({ translator: 'working', message: undefined });
  try {
    const { explanation, concept } = await callGeminiWithRetry(
      BATCH_SYSTEM_PROMPT,
      buildBatchUserMessage(changes)
    );
    statusStore.update({ translator: 'idle', message: undefined });
    return appendSkippedWarnings(changes, {
      ...buildEntry(filename, diff, changeType, explanation, concept),
      files: changes.map((change) => change.filename),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (isQuotaError(message)) {
      pauseForQuotaError(message);
      statusStore.update({ translator: 'paused', message: 'Gemini rate limit reached.' });
      return buildPausedEntry(filename, diff, changeType);
    }
    statusStore.update({ translator: 'error', message: 'Gemini translation failed. Using fallback.' });
    return appendSkippedWarnings(
      changes,
      toLocalFallbackEntry(filename, diff, changeType, formatTranslationError(error), 'Translation error')
    );
  }
}

