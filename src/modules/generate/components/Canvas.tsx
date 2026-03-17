import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import { formatCostDisplay, getModelShortName } from '@/shared/lib/utils';
import { ipc } from '@/shared/lib/ipc';
import { VariationsGrid } from '@/modules/compare/components/VariationsGrid';
import { useToastStore } from '@/shared/stores/toastStore';

export function Canvas() {
  const currentResult = useGenerateStore((s) => s.currentResult);
  const isGenerating = useGenerateStore((s) => s.isGenerating);
  const resultHistory = useGenerateStore((s) => s.resultHistory);
  const setCurrentResult = useGenerateStore((s) => s.setCurrentResult);
  const setPrompt = useGenerateStore((s) => s.setPrompt);
  const setTranslatedPrompt = useGenerateStore((s) => s.setTranslatedPrompt);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const addToast = useToastStore((s) => s.addToast);

  const handleCopyImage = useCallback(async () => {
    if (!currentResult) return;
    try {
      const blob = await fetch(`data:image/png;base64,${currentResult.imageBase64}`).then(r => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      addToast({ message: 'Изображение скопировано', type: 'success' });
    } catch {
      addToast({ message: 'Не удалось скопировать', type: 'error' });
    }
  }, [currentResult, addToast]);

  const handleCopyPrompt = useCallback(() => {
    if (!currentResult) return;
    navigator.clipboard.writeText(currentResult.prompt);
    addToast({ message: 'Промпт скопирован', type: 'success' });
  }, [currentResult, addToast]);

  const handleSaveAs = useCallback(async () => {
    if (!currentResult?.filePath) return;
    try {
      await ipc.invoke('file:open-folder', currentResult.filePath.replace(/[/\\][^/\\]+$/, ''));
    } catch {
      addToast({ message: 'Не удалось открыть папку', type: 'error' });
    }
  }, [currentResult, addToast]);

  const handleRepeat = useCallback(() => {
    if (!currentResult) return;
    // Re-fill prompt and trigger generation
    setPrompt(currentResult.prompt);
    if (currentResult.translatedPrompt) {
      setTranslatedPrompt(currentResult.translatedPrompt);
    }
    useGenerateStore.getState().setSelectedModelId(currentResult.modelId);
    useGenerateStore.getState().randomizeSeed();
    addToast({ message: 'Параметры загружены — нажмите Генерировать', type: 'info' });
  }, [currentResult, setPrompt, setTranslatedPrompt, addToast]);

  const handleToggleFavorite = useCallback(async () => {
    if (!currentResult?.imageId) return;
    try {
      const isFav = await ipc.invoke('gallery:toggle-favorite', currentResult.imageId);
      addToast({ message: isFav ? 'Добавлено в избранное' : 'Убрано из избранного', type: 'success' });
    } catch {
      // ignore
    }
  }, [currentResult, addToast]);

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
            {/* Top-right controls */}
            <div className="absolute top-4 right-4 flex gap-1 z-20">
              {resultHistory.length > 1 && (
                <>
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
                </>
              )}
            </div>

            {viewMode === 'grid' && resultHistory.length > 1 ? (
              <VariationsGrid
                results={resultHistory.slice(0, 4)}
                onSelect={(r) => { setCurrentResult(r); setViewMode('single'); }}
              />
            ) : (
              <img
                src={`data:image/png;base64,${currentResult.imageBase64}`}
                alt={currentResult.prompt}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
            )}

            {/* Bottom bar — info + actions */}
            {viewMode === 'single' && (
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center gap-2">
                {/* Info */}
                <div className="glass-panel px-3 py-1.5 text-xs text-text-secondary shrink-0">
                  {currentResult.width}×{currentResult.height} • {currentResult.generationTimeMs}мс
                  {currentResult.costUsd > 0 && ` • ${formatCostDisplay(currentResult.costUsd)}`}
                </div>

                {/* Action buttons */}
                <div className="flex gap-1">
                  <ActionButton icon="📋" label="Копировать" onClick={handleCopyImage} />
                  <ActionButton icon="💬" label="Промпт" onClick={handleCopyPrompt} />
                  <ActionButton icon="⭐" label="Избранное" onClick={handleToggleFavorite} />
                  <ActionButton icon="🔄" label="Повторить" onClick={handleRepeat} />
                  <ActionButton icon="📂" label="Папка" onClick={handleSaveAs} />
                </div>

                {/* Model name */}
                <div className="glass-panel px-3 py-1.5 text-xs text-text-secondary shrink-0">
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

function ActionButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="glass-panel px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary cursor-pointer flex items-center gap-1 transition-colors"
      title={label}
    >
      <span>{icon}</span>
    </motion.button>
  );
}
