import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueueStore } from '../store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay, getModelShortName } from '@/shared/lib/utils';

const STATUS_ICONS: Record<string, string> = {
  pending: '⏸',
  running: '⏳',
  completed: '✅',
  failed: '❌',
  cancelled: '🚫',
};

export function QueuePanel() {
  const items = useQueueStore((s) => s.items);
  const isExpanded = useQueueStore((s) => s.isExpanded);
  const toggleExpanded = useQueueStore((s) => s.toggleExpanded);
  const setItems = useQueueStore((s) => s.setItems);
  const updateItem = useQueueStore((s) => s.updateItem);

  // Load queue on mount
  useEffect(() => {
    ipc.invoke('queue:list').then(setItems).catch(() => {});
  }, [setItems]);

  // Listen for queue progress updates
  useEffect(() => {
    return ipc.on('queue:progress', (data) => {
      updateItem(data.id, {
        status: data.status,
        result_image_id: data.resultImageId ?? null,
        error_message: data.error ?? null,
      });
    });
  }, [updateItem]);

  const completedCount = items.filter((i) => i.status === 'completed').length;
  const totalCount = items.length;
  const totalEstimatedCost = items.reduce((sum, i) => sum + (i.estimated_cost ?? 0), 0);
  const totalActualCost = items.reduce((sum, i) => sum + (i.actual_cost ?? 0), 0);

  if (totalCount === 0) return null;

  const handleCancel = async (id: number) => {
    await ipc.invoke('queue:cancel', id);
    updateItem(id, { status: 'cancelled' });
  };

  const handleClear = async () => {
    await ipc.invoke('queue:clear');
    setItems([]);
  };

  return (
    <div className="glass-panel overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={toggleExpanded}
        className="w-full px-3 py-2 flex items-center justify-between text-xs cursor-pointer hover:bg-glass-hover transition-colors"
      >
        <span className="text-text-secondary">
          Очередь ({completedCount}/{totalCount})
        </span>
        <div className="flex items-center gap-2">
          {totalActualCost > 0 && (
            <span className="text-text-tertiary">
              {formatCostDisplay(totalActualCost)}
            </span>
          )}
          {totalEstimatedCost > 0 && totalActualCost === 0 && (
            <span className="text-text-tertiary">
              ~{formatCostDisplay(totalEstimatedCost)}
            </span>
          )}
          <span className="text-text-tertiary">{isExpanded ? '▼' : '▲'}</span>
        </div>
      </button>

      {/* Items list */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-glass-border"
          >
            <div className="max-h-40 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="px-3 py-1.5 flex items-center gap-2 text-xs border-b border-glass-border/50 last:border-0"
                >
                  <span>{STATUS_ICONS[item.status] ?? '⏸'}</span>
                  <span className="flex-1 truncate text-text-secondary">
                    {item.prompt.slice(0, 50)}
                  </span>
                  <span className="text-text-tertiary shrink-0">
                    {getModelShortName(item.model_id)}
                  </span>
                  {item.estimated_cost && (
                    <span className="text-text-tertiary shrink-0">
                      ~{formatCostDisplay(item.estimated_cost)}
                    </span>
                  )}
                  {item.status === 'pending' && (
                    <button
                      onClick={() => handleCancel(item.id)}
                      className="text-status-error hover:text-status-error/80 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-glass-border flex justify-end">
              <button
                onClick={handleClear}
                className="text-[10px] text-text-tertiary hover:text-status-error transition-colors cursor-pointer"
              >
                Очистить
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
