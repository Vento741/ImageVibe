/** Log types shared between main process and renderer */

export type LogCategory = 'api' | 'database' | 'queue' | 'ipc' | 'generation' | 'general';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  category: LogCategory;
  level: LogLevel;
  message: string;
  data?: unknown;
}
