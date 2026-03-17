import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import { formatCostDisplay, getModelShortName } from '@/shared/lib/utils';
import { VariationsGrid } from '@/modules/compare/components/VariationsGrid';

export function Canvas() {
  const currentResult = useGenerateStore((s) => s.currentResult);
  const isGenerating = useGenerateStore((s) => s.isGenerating);
  const resultHistory = useGenerateStore((s) => s.resultHistory);
  const setCurrentResult = useGenerateStore((s) => s.setCurrentResult);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');

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
            {/* Переключатель режима просмотра — только при наличии нескольких результатов */}
            {resultHistory.length > 1 && (
              <div className="absolute top-4 right-4 flex gap-1 z-20">
                <button
                  onClick={() => setViewMode('single')}
                  className={`px-2 py-1 rounded text-xs cursor-pointer ${viewMode === 'single' ? 'bg-aurora-blue/20 text-aurora-blue' : 'glass-panel text-text-tertiary'}`}
                >
                  1:1
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-2 py-1 rounded text-xs cursor-pointer ${viewMode === 'grid' ? 'bg-aurora-blue/20 text-aurora-blue' : 'glass-panel text-text-tertiary'}`}
                >
                  2×2
                </button>
              </div>
            )}

            {viewMode === 'grid' && resultHistory.length > 1 ? (
              <VariationsGrid
                results={resultHistory.slice(0, 4)}
                onSelect={(r) => setCurrentResult(r)}
              />
            ) : (
              <img
                src={`data:image/png;base64,${currentResult.imageBase64}`}
                alt={currentResult.prompt}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
            )}

            {/* Информация о результате */}
            {viewMode === 'single' && (
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                <div className="glass-panel px-3 py-1.5 text-xs text-text-secondary">
                  {currentResult.width}×{currentResult.height} • {currentResult.generationTimeMs}мс
                  {currentResult.costUsd > 0 && ` • ${formatCostDisplay(currentResult.costUsd)}`}
                </div>
                <div className="glass-panel px-3 py-1.5 text-xs text-text-secondary">
                  {getModelShortName(currentResult.modelId)}
                </div>
              </div>
            )}
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
