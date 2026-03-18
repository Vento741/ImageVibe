interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  windowIsMaximized: () => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
