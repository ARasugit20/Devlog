import { EventEmitter } from 'events';
import type { SidebarStatus } from './types';

type StatusEvents = {
  statusChanged: [SidebarStatus];
};

const DEFAULT_STATUS: SidebarStatus = {
  watcher: 'stopped',
  translator: 'idle',
  docsSync: 'disabled',
};

class StatusStore extends EventEmitter {
  private status: SidebarStatus = { ...DEFAULT_STATUS };

  get(): SidebarStatus {
    return { ...this.status };
  }

  update(patch: Partial<SidebarStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('statusChanged', this.get());
  }

  reset(): void {
    this.status = { ...DEFAULT_STATUS };
    this.emit('statusChanged', this.get());
  }

  on<K extends keyof StatusEvents>(
    event: K,
    listener: (...args: StatusEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }
}

export const statusStore = new StatusStore();
