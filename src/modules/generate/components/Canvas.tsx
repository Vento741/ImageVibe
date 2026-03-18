import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Paintbrush, Copy, MessageSquare, Star, RotateCw, FolderOpen, ArrowLeft, ZoomIn, ZoomOut, Maximize, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import type { CanvasCard } from '../store';
import type { AspectRatio, ImageSize } from '@/shared/types/models';
import { formatCostDisplay, getModelShortName, generateId } from '@/shared/lib/utils';

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}мс`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}с`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  return `${min}м ${remainSec.toFixed(0)}с`;
}
import { ipc } from '@/shared/lib/ipc';
import { useToastStore } from '@/shared/stores/toastStore';
import { Tooltip } from '@/shared/components/ui/Tooltip';
import { GeneratingCard } from './GeneratingCard';
import { CompletedCard } from './CompletedCard';
import { FailedCard } from './FailedCard';

export function Canvas() {
  const canvasCards = useGenerateStore((s) => s.canvasCards);
  const removeCanvasCard = useGenerateStore((s) => s.removeCanvasCard);
  const addCanvasCard = useGenerateStore((s) => s.addCanvasCard);
  const addToast = useToastStore((s) => s.addToast);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Queue listeners are registered in App.tsx (global) so they work even when Canvas is unmounted

  const handleRemoveCard = useCallback((id: string) => {
    removeCanvasCard(id);
    if (selectedCardId === id) {
      setSelectedCardId(null);
    }
  }, [removeCanvasCard, selectedCardId]);

  const handleRetry = useCallback((card: CanvasCard) => {
    // Remove failed card
    removeCanvasCard(card.id);

    // Create a new card with the same params
    const clientId = generateId();
    addCanvasCard({
      id: clientId,
      status: 'generating',
      prompt: card.prompt,
      modelId: card.modelId,
      aspectRatio: card.aspectRatio,
      imageSize: card.imageSize,
      startedAt: Date.now(),
    });

    // Re-submit to queue
    ipc.invoke('queue:submit', {
      prompt: card.prompt,
      modelId: card.modelId,
      mode: 'text2img',
      aspectRatio: card.aspectRatio as AspectRatio,
      imageSize: card.imageSize as ImageSize,
      clientId,
    }).then((res) => {
      useGenerateStore.getState().updateCanvasCard(clientId, { queueItemId: res.queueItemId });
    }).catch(() => {
      useGenerateStore.getState().updateCanvasCard(clientId, {
        status: 'failed',
        error: 'Ошибка повторной отправки',
      });
    });
  }, [removeCanvasCard, addCanvasCard]);

  // Zoom/pan state for expanded view
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 0, y: 0 });
  const viewerRef = useRef<HTMLDivElement>(null);

  // Reset zoom/pan when selecting a different card
  const prevSelectedId = useRef<string | null>(null);
  if (selectedCardId !== prevSelectedId.current) {
    prevSelectedId.current = selectedCardId;
    if (selectedCardId) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      return Math.min(Math.max(z * delta, 0.1), 10);
    });
  }, []);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // LMB for pan
    if (e.button === 0) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffset.current = { ...pan };
      // Close context menu on LMB click
      setContextMenu(null);
    }
  }, [pan]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      setPan({
        x: panOffset.current.x + (e.clientX - panStart.current.x),
        y: panOffset.current.y + (e.clientY - panStart.current.y),
      });
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isPanning.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Close context menu on Escape or click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    const clickHandler = () => setContextMenu(null);
    window.addEventListener('keydown', handler);
    window.addEventListener('click', clickHandler, true);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('click', clickHandler, true);
    };
  }, [contextMenu]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Selected card for expanded view
  const selectedCard = selectedCardId ? canvasCards.find((c) => c.id === selectedCardId) : null;
  const selectedResult = selectedCard?.result;

  // Empty state
  if (canvasCards.length === 0) {
    return (
      <GlassPanel className="h-full flex flex-col items-center justify-center" padding="none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 text-text-tertiary"
        >
          <Paintbrush size={48} className="text-text-tertiary" />
          <span className="text-sm">Введите промпт и нажмите Ctrl+Enter</span>
        </motion.div>
      </GlassPanel>
    );
  }

  // Expanded single-image view with zoom/pan
  if (selectedResult && selectedCard) {
    const zoomPercent = Math.round(zoom * 100);

    return (
      <GlassPanel className="h-full flex flex-col relative overflow-hidden" padding="none">
        {/* Top bar — back + zoom controls */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
          <button
            onClick={() => setSelectedCardId(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-panel text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            Назад
          </button>

          <div className="flex items-center gap-1">
            <ExpandedAction icon={<ZoomOut size={14} />} label="Уменьшить" onClick={() => setZoom((z) => Math.max(z * 0.8, 0.1))} />
            <button
              onClick={resetView}
              className="glass-panel px-2 py-1.5 text-[11px] text-text-secondary hover:text-text-primary cursor-pointer tabular-nums min-w-[52px] text-center transition-colors"
            >
              {zoomPercent}%
            </button>
            <ExpandedAction icon={<ZoomIn size={14} />} label="Увеличить" onClick={() => setZoom((z) => Math.min(z * 1.25, 10))} />
            <ExpandedAction icon={<Maximize size={14} />} label="Сбросить (100%)" onClick={resetView} />
          </div>
        </div>

        {/* Image viewport — zoom + LMB pan */}
        <div
          ref={viewerRef}
          className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        >
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isPanning.current ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            <img
              src={`data:image/png;base64,${selectedResult.imageBase64}`}
              alt={selectedResult.prompt}
              className="max-w-[90%] max-h-[85%] object-contain rounded-lg shadow-2xl select-none pointer-events-none"
              draggable={false}
            />
          </div>
        </div>

        {/* Custom context menu (RMB) — rendered via portal to avoid transform offset */}
        {createPortal(
          <AnimatePresence>
            {contextMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.1 }}
                className="fixed z-[9999] py-1.5 rounded-xl bg-bg-elevated/95 border border-glass-border backdrop-blur-xl shadow-2xl min-w-[200px]"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
            >
              <ContextMenuItem
                icon={<Pencil size={14} />}
                label="Изменить через промпт"
                onClick={() => {
                  setContextMenu(null);
                  const store = useGenerateStore.getState();
                  // Set source image as base64 data URL
                  store.setSourceImageData(`data:image/png;base64,${selectedResult.imageBase64}`);
                  store.setMode('img2img');
                  store.setUiMode('advanced');
                  store.setPrompt(selectedResult.prompt);
                  if (selectedResult.translatedPrompt) {
                    store.setTranslatedPrompt(selectedResult.translatedPrompt);
                  }
                  store.setSelectedModelId(selectedResult.modelId);
                  setSelectedCardId(null);
                  addToast({ message: 'Изображение загружено — измените промпт и нажмите Генерировать', type: 'info' });
                }}
              />
              <div className="mx-2 my-1 border-t border-glass-border" />
              <ContextMenuItem
                icon={<Copy size={14} />}
                label="Копировать изображение"
                onClick={async () => {
                  setContextMenu(null);
                  try {
                    const blob = await fetch(`data:image/png;base64,${selectedResult.imageBase64}`).then(r => r.blob());
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    addToast({ message: 'Изображение скопировано', type: 'success' });
                  } catch {
                    addToast({ message: 'Не удалось скопировать', type: 'error' });
                  }
                }}
              />
              <ContextMenuItem
                icon={<MessageSquare size={14} />}
                label="Копировать промпт"
                onClick={() => {
                  setContextMenu(null);
                  navigator.clipboard.writeText(selectedResult.prompt);
                  addToast({ message: 'Промпт скопирован', type: 'success' });
                }}
              />
              <ContextMenuItem
                icon={<Star size={14} />}
                label="В избранное"
                onClick={async () => {
                  setContextMenu(null);
                  if (!selectedResult.imageId) return;
                  try {
                    const isFav = await ipc.invoke('gallery:toggle-favorite', selectedResult.imageId);
                    addToast({ message: isFav ? 'Добавлено в избранное' : 'Убрано из избранного', type: 'success' });
                  } catch { /* ignore */ }
                }}
              />
              <ContextMenuItem
                icon={<RotateCw size={14} />}
                label="Повторить генерацию"
                onClick={() => {
                  setContextMenu(null);
                  const store = useGenerateStore.getState();
                  store.setPrompt(selectedResult.prompt);
                  if (selectedResult.translatedPrompt) {
                    store.setTranslatedPrompt(selectedResult.translatedPrompt);
                  }
                  store.setSelectedModelId(selectedResult.modelId);
                  store.randomizeSeed();
                  addToast({ message: 'Параметры загружены — нажмите Генерировать', type: 'info' });
                }}
              />
              <ContextMenuItem
                icon={<FolderOpen size={14} />}
                label="Открыть папку"
                onClick={async () => {
                  setContextMenu(null);
                  if (!selectedResult.filePath) return;
                  try {
                    await ipc.invoke('file:open-folder', selectedResult.filePath.replace(/[/\\][^/\\]+$/, ''));
                  } catch {
                    addToast({ message: 'Не удалось открыть папку', type: 'error' });
                  }
                }}
              />
              <div className="mx-2 my-1 border-t border-glass-border" />
              <ContextMenuItem
                icon={<ZoomIn size={14} />}
                label="Увеличить"
                onClick={() => { setContextMenu(null); setZoom((z) => Math.min(z * 1.25, 10)); }}
              />
              <ContextMenuItem
                icon={<ZoomOut size={14} />}
                label="Уменьшить"
                onClick={() => { setContextMenu(null); setZoom((z) => Math.max(z * 0.8, 0.1)); }}
              />
              <ContextMenuItem
                icon={<Maximize size={14} />}
                label="Сбросить вид (100%)"
                onClick={() => { setContextMenu(null); resetView(); }}
              />
            </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

        {/* Bottom bar — info + actions */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center gap-2 z-20">
          <div className="glass-panel px-3 py-1.5 text-xs text-text-secondary shrink-0">
            {selectedResult.width}×{selectedResult.height} • {formatTime(selectedResult.generationTimeMs)}
            {selectedResult.costUsd > 0 && ` • ${formatCostDisplay(selectedResult.costUsd)}`}
          </div>

          <div className="flex gap-1">
            <ExpandedAction icon={<Copy size={14} />} label="Копировать" onClick={async () => {
              try {
                const blob = await fetch(`data:image/png;base64,${selectedResult.imageBase64}`).then(r => r.blob());
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                addToast({ message: 'Изображение скопировано', type: 'success' });
              } catch {
                addToast({ message: 'Не удалось скопировать', type: 'error' });
              }
            }} />
            <ExpandedAction icon={<MessageSquare size={14} />} label="Промпт" onClick={() => {
              navigator.clipboard.writeText(selectedResult.prompt);
              addToast({ message: 'Промпт скопирован', type: 'success' });
            }} />
            <ExpandedAction icon={<Star size={14} />} label="Избранное" onClick={async () => {
              if (!selectedResult.imageId) return;
              try {
                const isFav = await ipc.invoke('gallery:toggle-favorite', selectedResult.imageId);
                addToast({ message: isFav ? 'Добавлено в избранное' : 'Убрано из избранного', type: 'success' });
              } catch { /* ignore */ }
            }} />
            <ExpandedAction icon={<RotateCw size={14} />} label="Повторить" onClick={() => {
              useGenerateStore.getState().setPrompt(selectedResult.prompt);
              if (selectedResult.translatedPrompt) {
                useGenerateStore.getState().setTranslatedPrompt(selectedResult.translatedPrompt);
              }
              useGenerateStore.getState().setSelectedModelId(selectedResult.modelId);
              useGenerateStore.getState().randomizeSeed();
              addToast({ message: 'Параметры загружены — нажмите Генерировать', type: 'info' });
            }} />
            <ExpandedAction icon={<FolderOpen size={14} />} label="Папка" onClick={async () => {
              if (!selectedResult.filePath) return;
              try {
                await ipc.invoke('file:open-folder', selectedResult.filePath.replace(/[/\\][^/\\]+$/, ''));
              } catch {
                addToast({ message: 'Не удалось открыть папку', type: 'error' });
              }
            }} />
          </div>

          <div className="glass-panel px-3 py-1.5 text-xs text-text-secondary shrink-0">
            {getModelShortName(selectedResult.modelId)}
          </div>
        </div>
      </GlassPanel>
    );
  }

  // Grid view — scrollable
  const generatingCount = canvasCards.filter((c) => c.status === 'generating').length;

  return (
    <GlassPanel className="h-full flex flex-col overflow-hidden" padding="none">
      {/* Header with count */}
      {generatingCount > 0 && (
        <div className="px-4 pt-3 pb-0">
          <div className="text-[11px] text-text-tertiary">
            В очереди: {generatingCount} • Всего: {canvasCards.length}
          </div>
        </div>
      )}
      {/* Scrollable grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          <AnimatePresence>
            {canvasCards.map((card) => {
              if (card.status === 'generating') {
                return (
                  <GeneratingCard
                    key={card.id}
                    card={card}
                    onRemove={handleRemoveCard}
                  />
                );
              }
              if (card.status === 'failed') {
                return (
                  <FailedCard
                    key={card.id}
                    card={card}
                    onRemove={handleRemoveCard}
                    onRetry={handleRetry}
                  />
                );
              }
              return (
                <CompletedCard
                  key={card.id}
                  card={card}
                  onRemove={handleRemoveCard}
                  isSelected={selectedCardId === card.id}
                  onSelect={setSelectedCardId}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </GlassPanel>
  );
}

function ExpandedAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <Tooltip text={label}>
      <motion.button
        onClick={onClick}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="glass-panel px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary cursor-pointer flex items-center gap-1 transition-colors"
      >
        {icon}
      </motion.button>
    </Tooltip>
  );
}

function ContextMenuItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-glass-hover transition-colors cursor-pointer text-left"
    >
      <span className="text-text-tertiary shrink-0">{icon}</span>
      {label}
    </button>
  );
}
