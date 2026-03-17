import type { IpcChannels, IpcEvents } from '../types/ipc';

const api = window.electronAPI;

function invoke<K extends keyof IpcChannels>(
  channel: K,
  ...args: IpcChannels[K]['args']
): Promise<IpcChannels[K]['result']> {
  if (!api) {
    console.warn(`[IPC] electronAPI not available, skipping: ${channel}`);
    return Promise.resolve(undefined as IpcChannels[K]['result']);
  }
  return api.invoke(channel, ...args) as Promise<IpcChannels[K]['result']>;
}

function on<K extends keyof IpcEvents>(
  channel: K,
  callback: (data: IpcEvents[K]) => void
): () => void {
  if (!api) return () => {};
  return api.on(channel, (data: unknown) => {
    callback(data as IpcEvents[K]);
  });
}

function once<K extends keyof IpcEvents>(
  channel: K,
  callback: (data: IpcEvents[K]) => void
): void {
  if (!api) return;
  api.once(channel, (data: unknown) => {
    callback(data as IpcEvents[K]);
  });
}

export const ipc = { invoke, on, once };
