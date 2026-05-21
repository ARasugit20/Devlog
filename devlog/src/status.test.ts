import { describe, expect, it, vi } from 'vitest';
import { statusStore } from './status';

describe('statusStore', () => {
  it('starts with default status after reset', () => {
    statusStore.reset();

    expect(statusStore.get()).toEqual({
      watcher: 'stopped',
      translator: 'idle',
      docsSync: 'disabled',
    });
  });

  it('merges partial updates', () => {
    statusStore.reset();
    statusStore.update({ watcher: 'watching', message: 'ready' });

    expect(statusStore.get()).toMatchObject({
      watcher: 'watching',
      translator: 'idle',
      docsSync: 'disabled',
      message: 'ready',
    });
  });

  it('returns a copy of status', () => {
    statusStore.reset();
    const status = statusStore.get();
    status.watcher = 'paused';

    expect(statusStore.get().watcher).toBe('stopped');
  });

  it('emits statusChanged on update', () => {
    const listener = vi.fn();
    statusStore.on('statusChanged', listener);

    statusStore.update({ translator: 'working' });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ translator: 'working' }));
    statusStore.off('statusChanged', listener);
  });

  it('reset emits default status', () => {
    const listener = vi.fn();
    statusStore.on('statusChanged', listener);

    statusStore.reset();

    expect(listener).toHaveBeenCalledWith({
      watcher: 'stopped',
      translator: 'idle',
      docsSync: 'disabled',
    });
    statusStore.off('statusChanged', listener);
  });
});
