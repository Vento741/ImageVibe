import type { IpcChannels, IpcEvents } from '../types/ipc';

/**
 * Type-safe IPC invoke wrapper.
 * Usage: const config = await ipc.invoke('config:get');
 */
function invoke<K extends keyof IpcChannels>(
  channel: K,
  ...args: IpcChannels[K]['args']
): Promise<IpcChannels[K]['result']> {
  return window.electronAPI.invoke(channel, ...args) as Promise<IpcChannels[K]['result']>;
}

/**
 * Listen for events from main process.
 * Returns cleanup function.
 */
function on<K extends keyof IpcEvents>(
  channel: K,
  callback: (data: IpcEvents[K]) => void
): () => void {
  return window.electronAPI.on(channel, (data: unknown) => {
    callback(data as IpcEvents[K]);
  });
}

/**
 * Listen for a single event from main process.
 */
function once<K extends keyof IpcEvents>(
  channel: K,
  callback: (data: IpcEvents[K]) => void
): void {
  window.electronAPI.once(channel, (data: unknown) => {
    callback(data as IpcEvents[K]);
  });
}

export const ipc = { invoke, on, once };
