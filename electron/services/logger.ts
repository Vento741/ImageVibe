/** Centralized logger service for the main process */

import type { LogCategory, LogLevel, LogEntry } from '../../src/shared/types/logging';
export type { LogCategory, LogLevel, LogEntry };

const MAX_ENTRIES = 1000;

class Logger {
  private entries: LogEntry[] = [];

  log(category: LogCategory, level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      category,
      level,
      message,
      data,
    };

    this.entries.push(entry);

    // Circular buffer: trim from the beginning when exceeding max
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }

    // Also log to console for development
    const prefix = `[${category.toUpperCase()}]`;
    switch (level) {
      case 'error':
        console.error(prefix, message, data ?? '');
        break;
      case 'warn':
        console.warn(prefix, message, data ?? '');
        break;
      case 'debug':
        console.debug(prefix, message, data ?? '');
        break;
      default:
        console.log(prefix, message, data ?? '');
    }
  }

  getLogs(category?: LogCategory): LogEntry[] {
    if (category) {
      return this.entries.filter((e) => e.category === category);
    }
    return [...this.entries];
  }

  clearLogs(): void {
    this.entries = [];
  }
}

/** Singleton logger instance */
export const logger = new Logger();
