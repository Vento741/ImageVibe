import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Info, Copy, Check, X, GripVertical, ZoomIn, ZoomOut, Maximize, FolderOpen, Trash2, Pencil } from 'lucide-react';
import { useGalleryStore } from '../store';
import { useGenerateStore } from '@/modules/generate/store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay, getModelShortName, formatDate, localFileUrl, clamp } from '@/shared/lib/utils';
import { useToastStore } from '@/shared/stores/toastStore';

/** Format milliseconds as human-readable time */
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}мс`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}с`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  return `${min}м ${remainSec.toFixed(0)}с`;
}

/** PNG metadata keys already covered by the Parameters section */
const HIDDEN_META_KEYS = new Set([
  'prompt', 'original_prompt', 'translated_prompt', 'negative_prompt',
  'model', 'seed', 'aspect_ratio', 'image_size', 'created_at',
]);
import type { DBImage } from '@/shared/types/database';
import { AddToCollectionMenu } from '@/modules/collections/components/AddToCollectionMenu';

export function ImageViewer() {
  const selectedImageId = useGalleryStore((s) => s.selectedImageId);
  const images = useGalleryStore((s) => s.images);
  const setSelectedImageId = useGalleryStore((s) => s.setSelectedImageId);
  const toggleFavorite = useGalleryStore((s) => s.toggleFavorite);
  const removeImage = useGalleryStore((s) => s.removeImage);
  const addToast = useToastStore((s) => s.addToast);
  const [image, setImage] = useState<DBImage | null>(null);
  const [metadata, setMetadata] = useState<Record<string, string> | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);
  const [copied, setCopied] = useState(false);
  const [panelWidth, setPanelWidth] = useState(360);
  const [ruPrompt, setRuPrompt] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 0, y: 0 });

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Panel resize
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Load full image data
  useEffect(() => {
    if (!selectedImageId) {
      setImage(null);
      setMetadata(null);
      setRuPrompt(null);
      return;
    }
    // Reset zoom/pan on image change
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setContextMenu(null);

    ipc.invoke('gallery:get', selectedImageId).then((img) => {
      setImage(img);
      setRuPrompt(null);
      if (img?.file_path) {
        ipc.invoke('file:read-metadata', img.file_path).then(setMetadata).catch(() => {});
      }
      // Use cached RU translation or translate on the fly
      if (img?.prompt_ru) {
        setRuPrompt(img.prompt_ru);
      } else if (img?.prompt && !/[а-яёА-ЯЁ]/.test(img.prompt.slice(0, 50))) {
        setIsTranslating(true);
        ipc.invoke('generate:translate-to-ru', img.prompt)
          .then((ru) => {
            setRuPrompt(ru);
            if (img.id && ru) {
              ipc.invoke('gallery:set-prompt-ru', img.id, ru).catch(() => {});
            }
          })
          .catch(() => {})
          .finally(() => setIsTranslating(false));
      }
    }).catch(() => {});
  }, [selectedImageId]);

  // Navigate between images
  const currentIndex = images.findIndex((img) => img.id === selectedImageId);

  const goNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      setSelectedImageId(images[currentIndex + 1].id);
    }
  }, [currentIndex, images, setSelectedImageId]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setSelectedImageId(images[currentIndex - 1].id);
    }
  }, [currentIndex, images, setSelectedImageId]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!selectedImageId) return;

    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          if (contextMenu) { setContextMenu(null); return; }
          setSelectedImageId(null);
          break;
        case 'ArrowRight':
          goNext();
          break;
        case 'ArrowLeft':
          goPrev();
          break;
        case 'i':
        case 'I':
          setShowMetadata((v) => !v);
          break;
        case 'f':
        case 'F':
          if (image) {
            ipc.invoke('gallery:toggle-favorite', image.id).then((isFav) => {
              toggleFavorite(image.id);
              setImage((prev) => prev ? { ...prev, is_favorite: isFav ? 1 : 0 } : prev);
            });
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedImageId, goNext, goPrev, image, setSelectedImageId, toggleFavorite, contextMenu]);

  // LMB pan
  const handleImageMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffset.current = { ...pan };
      setContextMenu(null);
    }
  }, [pan]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      return Math.min(Math.max(z * delta, 0.1), 10);
    });
  }, []);

  // RMB context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Mouse move/up for pan
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

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler, true);
    return () => window.removeEventListener('click', handler, true);
  }, [contextMenu]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Panel resize drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setPanelWidth(clamp(startWidth.current + delta, 280, 700));
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [panelWidth]);

  const handleCopyPrompt = useCallback(() => {
    if (!image) return;
    navigator.clipboard.writeText(image.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [image]);

  const handleCopyImage = useCallback(async () => {
    if (!image) return;
    try {
      const response = await fetch(localFileUrl(image.file_path));
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      addToast({ message: 'Изображение скопировано', type: 'success' });
    } catch {
      addToast({ message: 'Не удалось скопировать', type: 'error' });
    }
  }, [image, addToast]);

  const handleDelete = useCallback(async () => {
    if (!image) return;
    try {
      await ipc.invoke('gallery:delete', image.id);
      removeImage(image.id);
      setSelectedImageId(null);
      addToast({ message: 'Изображение удалено', type: 'success' });
    } catch {
      addToast({ message: 'Не удалось удалить', type: 'error' });
    }
  }, [image, removeImage, setSelectedImageId, addToast]);

  const handleOpenFolder = useCallback(async () => {
    if (!image) return;
    try {
      await ipc.invoke('file:open-folder', image.file_path.replace(/[/\\][^/\\]+$/, ''));
    } catch {
      addToast({ message: 'Не удалось открыть папку', type: 'error' });
    }
  }, [image, addToast]);

  const handleEditImg2Img = useCallback(() => {
    if (!image) return;
    // Read the image file and convert to base64 data URL
    const src = localFileUrl(image.file_path);
    const store = useGenerateStore.getState();
    // Set the file path as source (SourceImage handles both data: and local-file:)
    store.setSourceImageData(src);
    store.setMode('img2img');
    store.setUiMode('advanced');
    store.setPrompt(image.prompt);
    store.setSelectedModelId(image.model_id);
    setSelectedImageId(null);
    addToast({ message: 'Изображение загружено — измените промпт и нажмите Генерировать', type: 'info' });
  }, [image, setSelectedImageId, addToast]);

  if (!selectedImageId || !image) return null;

  const params = (() => {
    try { return JSON.parse(image.params); } catch { return {}; }
  })();

  const zoomPercent = Math.round(zoom * 100);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex"
        onClick={() => { setSelectedImageId(null); setContextMenu(null); }}
      >
        {/* Image area */}
        <div className="flex-1 flex flex-col relative" onClick={(e) => e.stopPropagation()}>
          {/* Toolbar — top */}
          <div className="absolute top-12 left-4 right-4 flex items-center justify-between z-10">
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedImageId(null)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm cursor-pointer"
                title="Закрыть (Esc)"
              >
                <X size={16} className="inline -mt-0.5" /> Закрыть
              </button>
              <button
                onClick={() => {
                  ipc.invoke('gallery:toggle-favorite', image.id).then((isFav) => {
                    toggleFavorite(image.id);
                    setImage((prev) => prev ? { ...prev, is_favorite: isFav ? 1 : 0 } : prev);
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm cursor-pointer"
              >
                {image.is_favorite ? <><Star size={16} fill="currentColor" className="inline -mt-0.5" /> Избранное</> : <><Star size={16} className="inline -mt-0.5" /> В избранное</>}
              </button>
              <AddToCollectionMenu imageId={image.id} />
              <button
                onClick={() => setShowMetadata(!showMetadata)}
                className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer ${
                  showMetadata ? 'bg-aurora-blue/30 text-aurora-blue' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <Info size={16} className="inline -mt-0.5" /> Инфо
              </button>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom((z) => Math.max(z * 0.8, 0.1))} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"><ZoomOut size={14} /></button>
              <button onClick={resetView} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] cursor-pointer tabular-nums min-w-[48px] text-center">{zoomPercent}%</button>
              <button onClick={() => setZoom((z) => Math.min(z * 1.25, 10))} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"><ZoomIn size={14} /></button>
              <button onClick={resetView} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"><Maximize size={14} /></button>
            </div>
          </div>

          {/* Navigation arrows */}
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer z-10"
            >
              ←
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer z-10"
            >
              →
            </button>
          )}

          {/* Image viewport — zoom + LMB pan */}
          <div
            className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onMouseDown={handleImageMouseDown}
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
                key={image.id}
                src={localFileUrl(image.file_path)}
                alt={image.prompt}
                className="max-w-[80%] max-h-[85%] object-contain rounded-lg shadow-2xl select-none pointer-events-none"
                draggable={false}
              />
            </div>
          </div>

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass-panel px-3 py-1 text-xs text-text-secondary z-10">
            {currentIndex + 1} / {images.length}
          </div>
        </div>

        {/* Context menu via portal */}
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
                <CtxItem icon={<Pencil size={14} />} label="Изменить через промпт" onClick={() => { setContextMenu(null); handleEditImg2Img(); }} />
                <div className="mx-2 my-1 border-t border-glass-border" />
                <CtxItem icon={<Copy size={14} />} label="Копировать изображение" onClick={() => { setContextMenu(null); handleCopyImage(); }} />
                <CtxItem icon={<Copy size={14} />} label="Копировать промпт" onClick={() => { setContextMenu(null); handleCopyPrompt(); }} />
                <CtxItem icon={<Star size={14} />} label={image.is_favorite ? 'Убрать из избранного' : 'В избранное'} onClick={() => {
                  setContextMenu(null);
                  ipc.invoke('gallery:toggle-favorite', image.id).then((isFav) => {
                    toggleFavorite(image.id);
                    setImage((prev) => prev ? { ...prev, is_favorite: isFav ? 1 : 0 } : prev);
                  });
                }} />
                <CtxItem icon={<FolderOpen size={14} />} label="Открыть папку" onClick={() => { setContextMenu(null); handleOpenFolder(); }} />
                <div className="mx-2 my-1 border-t border-glass-border" />
                <CtxItem icon={<ZoomIn size={14} />} label="Увеличить" onClick={() => { setContextMenu(null); setZoom((z) => Math.min(z * 1.25, 10)); }} />
                <CtxItem icon={<ZoomOut size={14} />} label="Уменьшить" onClick={() => { setContextMenu(null); setZoom((z) => Math.max(z * 0.8, 0.1)); }} />
                <CtxItem icon={<Maximize size={14} />} label="Сбросить вид (100%)" onClick={() => { setContextMenu(null); resetView(); }} />
                <div className="mx-2 my-1 border-t border-glass-border" />
                <CtxItem icon={<Trash2 size={14} />} label="Удалить" danger onClick={() => { setContextMenu(null); handleDelete(); }} />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

        {/* Metadata panel */}
        <AnimatePresence>
          {showMetadata && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: panelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="h-full bg-bg-secondary/95 border-l border-glass-border overflow-hidden flex"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Resize handle */}
              <div
                onMouseDown={handleResizeStart}
                className="w-2 shrink-0 cursor-col-resize hover:bg-aurora-blue/20 active:bg-aurora-blue/40 transition-colors flex items-center justify-center group"
              >
                <GripVertical size={12} className="text-text-tertiary/40 group-hover:text-text-tertiary" />
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-y-auto min-w-0">
                <div className="p-4 flex flex-col gap-4">
                  <h3 className="text-sm font-medium text-text-primary">Информация</h3>

                  {/* Prompt — RU translation first, then original EN */}
                  {(ruPrompt || isTranslating) && (
                    <div>
                      <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Промпт (RU)</div>
                      {isTranslating ? (
                        <div className="flex items-center gap-2 text-xs text-text-tertiary">
                          <div className="w-3 h-3 border border-aurora-blue/30 border-t-aurora-blue rounded-full animate-spin" />
                          Перевод...
                        </div>
                      ) : (
                        <p className="text-xs text-text-secondary leading-relaxed break-words">{ruPrompt}</p>
                      )}
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                      {ruPrompt ? 'Промпт (EN)' : 'Промпт'}
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed break-words">{image.prompt}</p>
                  </div>

                  {/* Negative prompt */}
                  {image.negative_prompt && (
                    <div>
                      <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Негативный</div>
                      <p className="text-xs text-text-secondary leading-relaxed break-words">{image.negative_prompt}</p>
                    </div>
                  )}

                  {/* Parameters */}
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Параметры</div>
                    <div className="flex flex-col gap-1 text-xs">
                      <MetadataRow label="Модель" value={getModelShortName(image.model_id)} />
                      <MetadataRow label="Режим" value={image.mode} />
                      <MetadataRow label="Размер" value={`${image.width}×${image.height}`} />
                      {params.aspectRatio && <MetadataRow label="Пропорции" value={params.aspectRatio} />}
                      {params.seed && <MetadataRow label="Seed" value={String(params.seed)} />}
                      {image.cost_usd ? <MetadataRow label="Стоимость" value={formatCostDisplay(image.cost_usd)} /> : null}
                      {image.generation_time_ms ? <MetadataRow label="Время" value={formatTime(image.generation_time_ms)} /> : null}
                      <MetadataRow label="Файл" value={image.file_path.split(/[/\\]/).pop() ?? ''} />
                      <MetadataRow label="Дата" value={formatDate(image.created_at)} />
                    </div>
                  </div>

                  {/* PNG metadata — only fields NOT already shown above */}
                  {metadata && (() => {
                    const extraEntries = Object.entries(metadata).filter(([key]) => !HIDDEN_META_KEYS.has(key));
                    if (extraEntries.length === 0) return null;
                    return (
                      <div>
                        <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">PNG метаданные</div>
                        <div className="flex flex-col gap-1 text-xs">
                          {extraEntries.map(([key, value]) => (
                            <MetadataRow key={key} label={key} value={value} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-glass-border">
                    <motion.button
                      onClick={handleCopyPrompt}
                      whileTap={{ scale: 0.97 }}
                      className={`w-full py-2.5 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        copied
                          ? 'bg-status-success/20 text-status-success border border-status-success/30'
                          : 'bg-glass-hover text-text-secondary hover:bg-glass-active border border-transparent'
                      }`}
                    >
                      <AnimatePresence mode="wait">
                        {copied ? (
                          <motion.span
                            key="copied"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="flex items-center gap-1.5"
                          >
                            <Check size={14} />
                            Скопировано!
                          </motion.span>
                        ) : (
                          <motion.span
                            key="copy"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="flex items-center gap-1.5"
                          >
                            <Copy size={14} />
                            Копировать промпт
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-tertiary shrink-0">{label}</span>
      <span className="text-text-secondary text-right break-all">{value}</span>
    </div>
  );
}

function CtxItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors cursor-pointer text-left ${
        danger
          ? 'text-status-error hover:bg-status-error/10'
          : 'text-text-secondary hover:text-text-primary hover:bg-glass-hover'
      }`}
    >
      <span className={`shrink-0 ${danger ? 'text-status-error/70' : 'text-text-tertiary'}`}>{icon}</span>
      {label}
    </button>
  );
}
