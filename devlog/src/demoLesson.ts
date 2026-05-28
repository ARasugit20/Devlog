import { randomUUID } from 'crypto';
import type { LogEntry } from './types';

export function createWelcomeDemoLesson(): LogEntry {
  const timestamp = Date.now();
  return {
    id: randomUUID(),
    timestamp,
    files: ['example/count.py'],
    filename: 'example/count.py',
    changeType: 'modified',
    diff: '-count = 0\n+count = 1',
    concept: 'Variable reassignment',
    summary: 'You updated a variable’s value after it was first created.',
    explanation:
      'In Python, variables can be reassigned to a new value at any time. Here you changed `count` from 0 to 1, which is a common pattern when tracking how many times something has happened.',
    whyItMatters:
      'Understanding reassignment helps you avoid bugs where you accidentally overwrite a value you still needed.',
    reflectionQuestion: 'What would happen if you tried to use the old value after reassignment?',
    source: 'demo',
  };
}
