import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Trash2, Download, ChevronDown, ChevronRight, Search, Filter } from 'lucide-react';
import { GlassPanel } from '@shared/components/ui/GlassPanel';
import { ipc } from '@shared/lib/ipc';
import { useToastStore } from '@shared/stores/toastStore';
import type { LogCategory, LogEntry } from '@shared/types/logging';

type TabId = 'all' | LogCategory;

interface Tab {
  id: TabId;
  label: string;
}

const tabs: Tab[] = [
  { id: 'all', label: 'Все' },
  { id: 'api', label: 'API' },
  { id: 'database', label: 'База данных' },
  { id: 'queue', label: 'Очередь' },
  { id: 'ipc', label: 'IPC' },
  { id: 'generation', label: 'Генерация' },
  { id: 'general', label: 'Общие' },
];

const levelColors: Record<string, string> = {
  info: 'bg-status-info/20 text-status-info',
  warn: 'bg-status-warning/20 text-status-warning',
  error: 'bg-status-error/20 text-status-error',
  debug: 'bg-aurora-purple/20 text-aurora-purple',
};

const levelLabels: Record<string, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
};

type LevelFilter = 'all' | 'info' | 'warn' | 'error' | 'debug';

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const addToast = useToastStore((s) => s.addToast);

  const fetchLogs = useCallback(async () => {
    try {
      const category = activeTab === 'all' ? undefined : activeTab;
      const result = await ipc.invoke('logs:get', category);
      setLogs(result);
    } catch {
      // silently fail
    }
  }, [activeTab]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (levelFilter !== 'all') {
      result = result.filter((entry) => entry.level === levelFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (entry) =>
          entry.message.toLowerCase().includes(query) ||
          entry.category.toLowerCase().includes(query) ||
          (entry.data && JSON.stringify(entry.data).toLowerCase().includes(query))
      );
    }

    return result;
  }, [logs, levelFilter, searchQuery]);

  const handleClear = useCallback(async () => {
    await ipc.invoke('logs:clear');
    setLogs([]);
    setExpandedEntries(new Set());
    addToast({ message: 'Логи очищены', type: 'success' });
  }, [addToast]);

  const handleExport = useCallback(() => {
    const text = filteredLogs
      .map((entry) => {
        const line = `[${entry.timestamp}] [${entry.category.toUpperCase()}] [${entry.level.toUpperCase()}] ${entry.message}`;
        if (entry.data) {
          return `${line}\n  ${JSON.stringify(entry.data, null, 2).replace(/\n/g, '\n  ')}`;
        }
        return line;
      })
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `imagevibe-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ message: 'Логи экспортированы', type: 'success' });
  }, [filteredLogs, addToast]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const formatTime = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-lg font-medium text-text-primary">Логи</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] cursor-pointer transition-colors ${
              autoRefresh
                ? 'bg-aurora-blue/20 text-aurora-blue'
                : 'bg-glass text-text-tertiary hover:text-text-secondary'
            }`}
            title={autoRefresh ? 'Автообновление включено' : 'Автообновление выключено'}
          >
            {autoRefresh ? 'Авто: ВКЛ' : 'Авто: ВЫКЛ'}
          </button>
          <button
            onClick={fetchLogs}
            className="p-1.5 rounded-lg bg-glass text-text-tertiary hover:text-text-primary hover:bg-glass-hover cursor-pointer transition-colors"
            title="Обновить"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={handleExport}
            className="p-1.5 rounded-lg bg-glass text-text-tertiary hover:text-text-primary hover:bg-glass-hover cursor-pointer transition-colors"
            title="Экспорт"
          >
            <Download size={14} />
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 rounded-lg bg-glass text-text-tertiary hover:text-status-error hover:bg-status-error/10 cursor-pointer transition-colors"
            title="Очистить"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setExpandedEntries(new Set()); }}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === tab.id
                ? 'bg-aurora-blue/20 text-aurora-blue'
                : 'bg-glass text-text-tertiary hover:text-text-secondary hover:bg-glass-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 shrink-0">
        {/* Search */}
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по логам..."
            className="w-full bg-bg-tertiary text-text-primary text-xs rounded-lg pl-8 pr-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50"
          />
        </div>

        {/* Level filter */}
        <div className="relative">
          <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LevelFilter)}
            className="bg-bg-tertiary text-text-primary text-xs rounded-lg pl-8 pr-6 py-2 outline-none border border-glass-border cursor-pointer appearance-none"
          >
            <option value="all">Все уровни</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
        </div>
      </div>

      {/* Log entries */}
      <GlassPanel padding="none" className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto font-mono text-[11px]">
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-text-tertiary text-xs">
              {logs.length === 0 ? 'Нет записей' : 'Нет записей по фильтру'}
            </div>
          ) : (
            <div className="divide-y divide-glass-border/30">
              <AnimatePresence initial={false}>
                {filteredLogs.map((entry) => {
                  const hasData = entry.data !== undefined && entry.data !== null;
                  const entryKey = `${entry.timestamp}-${entry.category}-${entry.level}-${entry.message.slice(0, 40)}`;
                  const isExpanded = expandedEntries.has(entryKey);

                  return (
                    <motion.div
                      key={entryKey}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="hover:bg-glass-hover/30"
                    >
                      <div
                        className={`flex items-start gap-2 px-3 py-1.5 ${hasData ? 'cursor-pointer' : ''}`}
                        onClick={() => hasData && toggleExpand(entryKey)}
                      >
                        {/* Expand icon */}
                        <div className="w-3 shrink-0 pt-0.5 text-text-tertiary">
                          {hasData && (
                            isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                          )}
                        </div>

                        {/* Time */}
                        <span className="text-text-tertiary shrink-0 w-[85px]">
                          {formatTime(entry.timestamp)}
                        </span>

                        {/* Level badge */}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${levelColors[entry.level]}`}>
                          {levelLabels[entry.level]}
                        </span>

                        {/* Category badge */}
                        <span className="px-1.5 py-0.5 rounded bg-glass text-text-tertiary text-[9px] shrink-0 uppercase">
                          {entry.category}
                        </span>

                        {/* Message */}
                        <span className="text-text-secondary flex-1 break-all">
                          {entry.message}
                        </span>
                      </div>

                      {/* Expanded data */}
                      <AnimatePresence>
                        {isExpanded && hasData && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <pre className="px-3 pb-2 pl-[120px] text-[10px] text-aurora-purple whitespace-pre-wrap break-all">
                              {JSON.stringify(entry.data, null, 2)}
                            </pre>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Footer stats */}
      <div className="flex items-center justify-between text-[10px] text-text-tertiary shrink-0">
        <span>{filteredLogs.length} из {logs.length} записей</span>
        <span>Макс. 1000 записей в буфере</span>
      </div>
    </div>
  );
}
