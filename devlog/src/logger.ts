import { EventEmitter } from 'events';
import type { LogEntry } from './types';

type LoggerEvents = {
  newEntry: [LogEntry];
  clearLog: [];
};

class DevLogLogger extends EventEmitter {
  private entries: LogEntry[] = [];

  addEntry(entry: LogEntry): void {
    this.entries.unshift(entry);
    this.emit('newEntry', entry);
  }

  getAll(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.emit('clearLog');
  }

  on<K extends keyof LoggerEvents>(
    event: K,
    listener: (...args: LoggerEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }
}

export const logger = new DevLogLogger();
