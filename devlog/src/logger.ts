import { EventEmitter } from 'events';
import type { LogEntry } from './types';

type LoggerEvents = {
  newEntry: [LogEntry];
  clearLog: [];
};

class DevLogLogger extends EventEmitter {
  private entries: LogEntry[] = [];
  private maxEntries = 200;

  addEntry(entry: LogEntry): void {
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
    this.emit('newEntry', entry);
  }

  getAll(): LogEntry[] {
    return [...this.entries];
  }

  setAll(entries: LogEntry[]): void {
    this.entries = [...entries].slice(0, this.maxEntries);
    this.emit('clearLog');
    for (const entry of this.entries) {
      this.emit('newEntry', entry);
    }
  }

  setMaxEntries(limit: number): void {
    this.maxEntries = Math.max(1, limit);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
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
