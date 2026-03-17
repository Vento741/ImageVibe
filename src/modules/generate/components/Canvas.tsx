import { motion, AnimatePresence } from 'framer-motion';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import { formatCostDisplay } from '@/shared/lib/utils';

export function Canvas() {
  const currentResult = useGenerateStore((s) => s.currentResult);
  const isGenerating = useGenerateStore((s) => s.isGenerating);

  return (
    <GlassPanel className="h-full flex flex-col items-center justify-center relative overflow-hidden" padding="none">
      <AnimatePresence mode="wait">
        {isGenerating ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-12 h-12 border-2 border-aurora-blue/30 border-t-aurora-blue rounded-full animate-spin" />
            <span className="text-sm text-text-secondary">Генерация...</span>
          </motion.div>
        ) : currentResult ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full h-full flex items-center justify-center p-4"
          >
            <img
              src={`data:image/png;base64,${currentResult.imageBase64}`}
              alt={currentResult.prompt}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
            {/* Result info overlay */}
            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
              <div className="glass-panel px-3 py-1.5 text-xs text-text-secondary">
                {currentResult.width}×{currentResult.height} • {currentResult.generationTimeMs}мс
                {currentResult.costUsd > 0 && ` • ${formatCostDisplay(currentResult.costUsd)}`}
              </div>
              <div className="glass-panel px-3 py-1.5 text-xs text-text-secondary">
                {currentResult.modelId.split('/')[1]}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 text-text-tertiary"
          >
            <span className="text-5xl">🎨</span>
            <span className="text-sm">Введите промпт и нажмите Ctrl+Enter</span>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassPanel>
  );
}
