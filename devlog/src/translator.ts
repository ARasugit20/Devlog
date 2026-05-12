import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChangeType, FileChange, LogEntry } from './types';

const SYSTEM_PROMPT =
  'You are DevLog, a coding teacher. A file just changed. Explain what happened in 2-3 sentences a complete beginner would understand. No jargon. Give one concept name this change demonstrates (e.g. React Hook, API call, For loop). Return JSON only, no markdown, no backticks: { explanation: string, concept: string }';

const BATCH_SYSTEM_PROMPT =
  'You are DevLog, a coding teacher. These files all changed together as part of one agent action. Explain in 3-4 sentences what was built or changed overall, like a teacher explaining one complete thought to a beginner. No jargon. Give one concept name for the overall change (e.g. React Hook, API call, For loop). Return JSON only, no markdown, no backticks: { explanation: string, concept: string }';

interface GeminiResponse {
  explanation: string;
  concept: string;
}

let client: GoogleGenerativeAI | null = null;
let quotaPausedUntil = 0;

export function initTranslator(apiKey: string): void {
  const trimmedKey = apiKey.trim();
  client = trimmedKey ? new GoogleGenerativeAI(trimmedKey) : null;
}

function buildEntry(
  filename: string,
  diff: string,
  changeType: ChangeType,
  explanation: string,
  concept: string
): LogEntry {
  return {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    filename,
    changeType,
    diff,
    explanation,
    concept,
  };
}

function parseGeminiJson(text: string): GeminiResponse {
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

function isQuotaError(message: string): boolean {
  return /429|quota exceeded|rate limit|too many requests/i.test(message);
}

function pauseForQuotaError(message: string): number {
  const retryMatch = message.match(/retry in ([\d.]+)s/i);
  const seconds = retryMatch ? Math.max(1, Math.ceil(Number(retryMatch[1]))) : 60;
  quotaPausedUntil = Date.now() + seconds * 1000;
  return seconds;
}

function quotaPauseEntry(
  filename: string,
  diff: string,
  changeType: ChangeType,
  seconds: number
): LogEntry {
  return buildEntry(
    filename,
    diff,
    changeType,
    `Gemini free-tier quota was exceeded. DevLog will pause translations for about ${seconds} seconds, then try again.`,
    'Rate limit'
  );
}

function formatTranslationError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown translation error.';
  if (isQuotaError(message)) {
    const seconds = pauseForQuotaError(message);
    return `Gemini free-tier quota was exceeded. DevLog will pause translations for about ${seconds} seconds, then try again.`;
  }

  return 'DevLog could not translate this change right now. Try again after a short wait.';
}

function summarizeBatchFilenames(changes: FileChange[]): string {
  if (changes.length === 1) {
    return changes[0].filename;
  }

  return `${changes.length} files`;
}

function summarizeBatchChangeType(changes: FileChange[]): ChangeType {
  const firstType = changes[0]?.changeType;
  if (firstType && changes.every((change) => change.changeType === firstType)) {
    return firstType;
  }

  return 'modified';
}

function summarizeBatchDiff(changes: FileChange[]): string {
  return changes
    .map(
      (change) =>
        `File: ${change.filename}\nChange type: ${change.changeType}\nDiff:\n${change.diff}`
    )
    .join('\n\n---\n\n');
}

function buildBatchUserMessage(changes: FileChange[]): string {
  return changes
    .map(
      (change) =>
        `File: ${change.filename}\nChange type: ${change.changeType}\nDiff:\n${change.diff}`
    )
    .join('\n\n');
}

export async function translateBatch(changes: FileChange[]): Promise<LogEntry | null> {
  if (changes.length === 0) {
    return null;
  }

  const filename = summarizeBatchFilenames(changes);
  const changeType = summarizeBatchChangeType(changes);
  const diff = summarizeBatchDiff(changes);

  if (!client) {
    return buildEntry(
      filename,
      diff,
      changeType,
      'Run DevLog: Set Gemini API Key to enable explanations.',
      'Not configured'
    );
  }

  if (Date.now() < quotaPausedUntil) {
    return null;
  }

  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${BATCH_SYSTEM_PROMPT}\n\n${buildBatchUserMessage(changes)}` }],
        },
      ],
    });
    const text = result.response.text();
    const { explanation, concept } = parseGeminiJson(text);
    return buildEntry(filename, diff, changeType, explanation, concept);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (isQuotaError(message)) {
      const seconds = pauseForQuotaError(message);
      return quotaPauseEntry(filename, diff, changeType, seconds);
    }

    return buildEntry(
      filename,
      diff,
      changeType,
      formatTranslationError(error),
      'Translation error'
    );
  }
}

export async function translate(
  filename: string,
  diff: string,
  changeType: ChangeType
): Promise<LogEntry | null> {
  if (!client) {
    return buildEntry(
      filename,
      diff,
      changeType,
      'Run DevLog: Set Gemini API Key to enable explanations.',
      'Not configured'
    );
  }

  if (Date.now() < quotaPausedUntil) {
    return null;
  }

  const userMessage = `File: ${filename}\nChange type: ${changeType}\nDiff:\n${diff}`;
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }] }],
    });
    const text = result.response.text();
    const { explanation, concept } = parseGeminiJson(text);
    return buildEntry(filename, diff, changeType, explanation, concept);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (isQuotaError(message)) {
      const seconds = pauseForQuotaError(message);
      return quotaPauseEntry(filename, diff, changeType, seconds);
    }

    return buildEntry(
      filename,
      diff,
      changeType,
      formatTranslationError(error),
      'Translation error'
    );
  }
}
