import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import { logDevLog } from './outputChannel';
import { redactSecrets } from './privacy';
import { statusStore } from './status';
import type { ChangeType, FileChange, Lesson, LogEntry, TranslatorOptions } from './types';

const BATCH_SYSTEM_PROMPT = `You are DevLog, a patient coding tutor explaining changes to a complete beginner.
These files changed together in one short coding session. Read the diffs and return ONE JSON object only—no markdown fences, no extra text.

Required JSON shape:
{
  "concept": "short noun phrase",
  "summary": "one sentence max",
  "explanation": "2-4 sentences, plain English, no jargon",
  "whyItMatters": "one sentence on real-world relevance",
  "reflectionQuestion": "optional one short Socratic question"
}

Rules:
- If the changes are only build artifacts, caches, lock-file churn, minified bundles, or auto-generated code with nothing a beginner can learn, return exactly: null
- Never explain .pyc, __pycache__, node_modules, or dist-only churn as if it were meaningful source code
- Sound like a TA at the shoulder, not a commit message`;

interface GeminiLessonPayload {
  concept: string;
  summary: string;
  explanation: string;
  whyItMatters: string;
  reflectionQuestion?: string;
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

export function parseGeminiLesson(text: string): Lesson | null {
  const trimmed = text.trim();
  if (trimmed === 'null' || trimmed === '"null"') {
    return null;
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<GeminiLessonPayload>;
  if (
    !parsed.concept ||
    !parsed.summary ||
    !parsed.explanation ||
    !parsed.whyItMatters
  ) {
    return null;
  }

  return {
    id: randomUUID(),
    timestamp: Date.now(),
    files: [],
    concept: parsed.concept,
    summary: parsed.summary,
    explanation: parsed.explanation,
    whyItMatters: parsed.whyItMatters,
    reflectionQuestion: parsed.reflectionQuestion,
  };
}

/** @deprecated Use parseGeminiLesson for structured lessons. */
export function parseGeminiJson(text: string): { explanation: string; concept: string } {
  const lesson = parseGeminiLesson(text);
  if (!lesson) {
    throw new Error('Gemini response did not contain a lesson.');
  }
  return { explanation: lesson.explanation, concept: lesson.concept };
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

function buildLogEntry(
  lesson: Lesson,
  filename: string,
  diff: string,
  changeType: ChangeType,
  files: string[],
  source: LogEntry['source'],
  warnings: string[] = []
): LogEntry {
  return {
    ...lesson,
    files: files.length ? files : lesson.files,
    filename,
    changeType,
    diff,
    source,
    warnings: warnings.length ? warnings : undefined,
  };
}

function toLocalFallbackEntry(
  filename: string,
  diff: string,
  changeType: ChangeType,
  files: string[],
  explanation: string,
  concept = 'Local fallback',
  summary = 'DevLog could not finish this lesson.',
  whyItMatters = 'You can retry after a moment or check your API key.',
  warnings: string[] = []
): LogEntry {
  const lesson: Lesson = {
    id: randomUUID(),
    timestamp: Date.now(),
    files,
    concept,
    summary,
    explanation,
    whyItMatters,
  };
  return buildLogEntry(lesson, filename, diff, changeType, files, 'local-fallback', warnings);
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

function demoLessonForBatch(
  changes: FileChange[],
  filename: string,
  diff: string,
  changeType: ChangeType
): LogEntry {
  const files = changes.map((change) => change.filename);
  const fileList = files.slice(0, 3).join(', ');
  const extraFiles = files.length > 3 ? ` and ${files.length - 3} more` : '';
  const totals = changes.reduce(
    (counts, change) => {
      const changedLines = countChangedLines(change.diff);
      counts.added += changedLines.added;
      counts.removed += changedLines.removed;
      return counts;
    },
    { added: 0, removed: 0 }
  );

  const lesson: Lesson = {
    id: randomUUID(),
    timestamp: Date.now(),
    files,
    concept: 'Batched change',
    summary: `DevLog grouped ${changes.length} file change(s) from your coding session.`,
    explanation: `These edits happened close together and touched ${fileList}${extraFiles}. About ${totals.added} line(s) were added and ${totals.removed} removed. In demo mode, DevLog shows you what a real lesson looks like without calling Gemini.`,
    whyItMatters:
      'Seeing one combined lesson helps you understand the big picture instead of getting lost in every tiny file twitch.',
    reflectionQuestion: 'Can you describe in your own words what you were trying to accomplish in this batch?',
  };

  return buildLogEntry(lesson, filename, diff, changeType, files, 'demo');
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

async function callGemini(prompt: string): Promise<Lesson | null> {
  if (!client) {
    throw new Error('Gemini client is not initialized.');
  }
  const model = client.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: BATCH_SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
  });
  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
  });
  const text = result.response.text();
  const lesson = parseGeminiLesson(text);
  if (!lesson) {
    logDevLog('[DevLog] No lesson generated (artifact or unparseable)');
  }
  return lesson;
}

async function callGeminiWithRetry(prompt: string): Promise<Lesson | null> {
  const attempts = [0, 800, 1600];
  let lastError: unknown = null;
  for (const waitMs of attempts) {
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    try {
      return await callGemini(prompt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : '';
      if (isQuotaError(message)) {
        throw error;
      }
      logDevLog('[DevLog] No lesson generated (artifact or unparseable)');
    }
  }
  if (lastError instanceof Error) {
    logDevLog(`[DevLog] Translation warning: ${lastError.message}`);
  }
  return null;
}

function buildPausedEntry(
  filename: string,
  diff: string,
  changeType: ChangeType,
  files: string[]
): LogEntry {
  const seconds = Math.max(1, Math.ceil((quotaPausedUntil - Date.now()) / 1000));
  return toLocalFallbackEntry(
    filename,
    diff,
    changeType,
    files,
    `Gemini translation is paused due to rate limits. DevLog will retry automatically in about ${seconds} seconds.`,
    'Rate limited',
    'Gemini is resting briefly so you do not burn through quota.',
    'Rate limits protect your free tier; wait a moment and keep coding.',
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
  const files = changes.map((change) => change.filename);

  if (demoModeEnabled) {
    statusStore.update({ translator: 'idle', message: 'Demo mode is active.' });
    return appendSkippedWarnings(changes, demoLessonForBatch(changes, filename, diff, changeType));
  }

  if (!client) {
    return null;
  }

  if (Date.now() < quotaPausedUntil) {
    statusStore.update({ translator: 'paused', message: 'Gemini rate limit pause in effect.' });
    return buildPausedEntry(filename, diff, changeType, files);
  }

  statusStore.update({ translator: 'working', message: undefined });
  try {
    const lesson = await callGeminiWithRetry(buildBatchUserMessage(changes));
    statusStore.update({ translator: 'idle', message: undefined });
    if (!lesson) {
      return null;
    }
    lesson.files = files;
    return appendSkippedWarnings(
      changes,
      buildLogEntry(lesson, filename, diff, changeType, files, 'gemini')
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (isQuotaError(message)) {
      pauseForQuotaError(message);
      statusStore.update({ translator: 'paused', message: 'Gemini rate limit reached.' });
      return buildPausedEntry(filename, diff, changeType, files);
    }
    statusStore.update({ translator: 'error', message: 'Gemini translation failed.' });
    return null;
  }
}
