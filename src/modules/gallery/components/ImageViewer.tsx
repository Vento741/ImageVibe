import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGalleryStore } from '../store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay } from '@/shared/lib/utils';
import type { DBImage } from '@/shared/types/database';

export function ImageViewer() {
  const selectedImageId = useGalleryStore((s) => s.selectedImageId);
  const images = useGalleryStore((s) => s.images);
  const setSelectedImageId = useGalleryStore((s) => s.setSelectedImageId);
  const toggleFavorite = useGalleryStore((s) => s.toggleFavorite);
  const [image, setImage] = useState<DBImage | null>(null);
  const [metadata, setMetadata] = useState<Record<string, string> | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);

  // Load full image data
  useEffect(() => {
    if (!selectedImageId) {
      setImage(null);
      setMetadata(null);
      return;
    }
    ipc.invoke('gallery:get', selectedImageId).then((img) => {
      setImage(img);
      if (img?.file_path) {
        ipc.invoke('file:read-metadata', img.file_path).then(setMetadata).catch(() => {});
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
            ipc.invoke('gallery:toggle-favorite', image.id).then(() => {
              toggleFavorite(image.id);
            });
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedImageId, goNext, goPrev, image, setSelectedImageId, toggleFavorite]);

  if (!selectedImageId || !image) return null;

  const params = (() => {
    try { return JSON.parse(image.params); } catch { return {}; }
  })();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex"
        onClick={() => setSelectedImageId(null)}
      >
        {/* Image area */}
        <div className="flex-1 flex items-center justify-center relative" onClick={(e) => e.stopPropagation()}>
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

          {/* Close button */}
          <button
            onClick={() => setSelectedImageId(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer z-10"
          >
            ✕
          </button>

          {/* Toolbar */}
          <div className="absolute top-4 left-4 flex gap-2 z-10">
            <button
              onClick={() => {
                ipc.invoke('gallery:toggle-favorite', image.id).then(() => toggleFavorite(image.id));
              }}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm cursor-pointer"
            >
              {image.is_favorite ? '⭐ Избранное' : '☆ В избранное'}
            </button>
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer ${
                showMetadata ? 'bg-aurora-blue/30 text-aurora-blue' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              ℹ️ Инфо
            </button>
          </div>

          {/* Image */}
          <motion.img
            key={image.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            src={`file://${image.file_path}`}
            alt={image.prompt}
            className="max-w-[80%] max-h-[85%] object-contain rounded-lg shadow-2xl"
          />

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass-panel px-3 py-1 text-xs text-text-secondary">
            {currentIndex + 1} / {images.length}
          </div>
        </div>

        {/* Metadata panel */}
        <AnimatePresence>
          {showMetadata && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="h-full bg-bg-secondary/95 border-l border-glass-border overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 flex flex-col gap-4">
                <h3 className="text-sm font-medium text-text-primary">Информация</h3>

                {/* Prompt */}
                <div>
                  <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Промпт</div>
                  <p className="text-xs text-text-secondary leading-relaxed">{image.prompt}</p>
                </div>

                {/* Translated prompt */}
                {image.translated_prompt && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">EN промпт</div>
                    <p className="text-xs text-text-secondary leading-relaxed">{image.translated_prompt}</p>
                  </div>
                )}

                {/* Negative prompt */}
                {image.negative_prompt && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Негативный</div>
                    <p className="text-xs text-text-secondary leading-relaxed">{image.negative_prompt}</p>
                  </div>
                )}

                {/* Parameters */}
                <div>
                  <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Параметры</div>
                  <div className="flex flex-col gap-1 text-xs">
                    <MetadataRow label="Модель" value={image.model_id.split('/')[1]} />
                    <MetadataRow label="Режим" value={image.mode} />
                    <MetadataRow label="Размер" value={`${image.width}×${image.height}`} />
                    {params.aspectRatio && <MetadataRow label="Пропорции" value={params.aspectRatio} />}
                    {params.seed && <MetadataRow label="Seed" value={String(params.seed)} />}
                    {image.cost_usd ? <MetadataRow label="Стоимость" value={formatCostDisplay(image.cost_usd)} /> : null}
                    {image.generation_time_ms ? <MetadataRow label="Время" value={`${image.generation_time_ms}мс`} /> : null}
                    <MetadataRow label="Файл" value={image.file_path.split(/[/\\]/).pop() ?? ''} />
                    <MetadataRow label="Дата" value={new Date(image.created_at).toLocaleString('ru-RU')} />
                  </div>
                </div>

                {/* PNG metadata */}
                {metadata && Object.keys(metadata).length > 0 && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">PNG метаданные</div>
                    <div className="flex flex-col gap-1 text-xs">
                      {Object.entries(metadata).map(([key, value]) => (
                        <MetadataRow key={key} label={key} value={value} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-2 border-t border-glass-border">
                  <button
                    onClick={() => {
                      // Copy prompt to clipboard
                      navigator.clipboard.writeText(image.prompt);
                    }}
                    className="w-full py-2 rounded-lg bg-glass-hover text-text-secondary text-xs hover:bg-glass-active transition-colors cursor-pointer"
                  >
                    📋 Копировать промпт
                  </button>
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
    <div className="flex justify-between">
      <span className="text-text-tertiary">{label}</span>
      <span className="text-text-secondary text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
