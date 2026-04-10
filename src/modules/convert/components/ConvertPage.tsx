import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftRight,
  ImageIcon,
  Upload,
  FolderDown,
  Trash2,
  Download,
  X,
  Check,
  Loader2,
  Search,
} from 'lucide-react';
import { ipc } from '@shared/lib/ipc';
import { localFileUrl, getModelShortName } from '@shared/lib/utils';
import { GlassPanel } from '@shared/components/ui/GlassPanel';
import { useToastStore } from '@shared/stores/toastStore';
import type { DBImage } from '@shared/types/database';

function toast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  useToastStore.getState().addToast({ message, type });
}

type TargetFormat = 'png' | 'jpeg' | 'webp';

interface ConvertItem {
  /** Unique id for the item in local state */
  id: string;
  /** Source file path on disk */
  filePath: string;
  /** Display file name */
  fileName: string;
  /** Detected current format */
  currentFormat: string;
  /** File size in bytes (0 if unknown) */
  fileSize: number;
  /** Gallery image DB id (null if external file) */
  imageId: number | null;
  /** Thumbnail URL for <img> */
  thumbnailUrl: string;
  /** Original prompt (gallery images only) */
  prompt?: string;
  /** Model id (gallery images only) */
  modelId?: string;
  /** Per-item conversion status */
  status: 'pending' | 'converting' | 'done' | 'error';
  /** Result path after conversion */
  resultPath?: string;
  /** Error message */
  error?: string;
}

function detectFormat(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'JPEG';
  if (ext === 'png') return 'PNG';
  if (ext === 'webp') return 'WebP';
  return ext.toUpperCase() || '?';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '---';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

let nextId = 0;
function uid(): string {
  return `conv_${Date.now()}_${++nextId}`;
}

export function ConvertPage() {
  const [items, setItems] = useState<ConvertItem[]>([]);
  const [targetFormat, setTargetFormat] = useState<TargetFormat>('png');
  const [quality, setQuality] = useState(85);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isBatchConverting, setIsBatchConverting] = useState(false);

  const showQuality = targetFormat === 'jpeg' || targetFormat === 'webp';

  // ---- Add from gallery ----
  const handleAddFromGallery = useCallback((images: DBImage[]) => {
    const newItems: ConvertItem[] = images
      .filter((img) => !items.some((it) => it.imageId === img.id))
      .map((img) => ({
        id: uid(),
        filePath: img.file_path,
        fileName: img.file_path.replace(/^.*[\\/]/, ''),
        currentFormat: detectFormat(img.file_path),
        fileSize: img.file_size,
        imageId: img.id,
        thumbnailUrl: localFileUrl(img.file_path),
        prompt: img.prompt,
        modelId: img.model_id,
        status: 'pending' as const,
      }));
    setItems((prev) => [...prev, ...newItems]);
    setIsGalleryOpen(false);
  }, [items]);

  // ---- Add external file ----
  const handleAddExternal = useCallback(async () => {
    const filePath = await ipc.invoke('file:select-image');
    if (!filePath) return;
    if (items.some((it) => it.filePath === filePath)) {
      toast('Этот файл уже добавлен', 'warning');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        filePath,
        fileName: filePath.replace(/^.*[\\/]/, ''),
        currentFormat: detectFormat(filePath),
        fileSize: 0,
        imageId: null,
        thumbnailUrl: localFileUrl(filePath),
        status: 'pending',
      },
    ]);
  }, [items]);

  // ---- Remove item ----
  const handleRemove = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  // ---- Clear all ----
  const handleClearAll = useCallback(() => {
    setItems([]);
  }, []);

  // ---- Convert single ----
  const handleConvertSingle = useCallback(async (item: ConvertItem) => {
    setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, status: 'converting' } : it));
    try {
      let resultPath: string;
      if (item.imageId !== null) {
        // Gallery image: use file:export
        resultPath = await ipc.invoke('file:export', item.imageId, {
          format: targetFormat,
          quality: showQuality ? quality : undefined,
        });
      } else {
        // External file: use file:convert
        resultPath = await ipc.invoke('file:convert', item.filePath, targetFormat, showQuality ? quality : undefined);
      }
      if (resultPath) {
        setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, status: 'done', resultPath } : it));
        toast('Конвертация завершена', 'success');
      } else {
        // User cancelled save dialog
        setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, status: 'pending' } : it));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, status: 'error', error: msg } : it));
      toast(`Ошибка: ${msg}`, 'error');
    }
  }, [targetFormat, quality, showQuality]);

  // ---- Convert all (batch) ----
  const handleConvertAll = useCallback(async () => {
    const pendingItems = items.filter((it) => it.status === 'pending' || it.status === 'error');
    if (pendingItems.length === 0) {
      toast('Нет изображений для конвертации', 'warning');
      return;
    }

    // Select destination folder
    const destFolder = await ipc.invoke('file:select-folder');
    if (!destFolder) return;

    setIsBatchConverting(true);

    // Mark all as converting
    setItems((prev) => prev.map((it) =>
      (it.status === 'pending' || it.status === 'error') ? { ...it, status: 'converting' } : it,
    ));

    // Collect source paths for batch
    const sourcePaths = pendingItems.map((it) => it.filePath);

    try {
      const results = await ipc.invoke(
        'file:convert-batch',
        sourcePaths,
        destFolder,
        targetFormat,
        showQuality ? quality : undefined,
      );

      // Map results back to items
      let converted = 0;
      setItems((prev) => prev.map((it) => {
        const idx = pendingItems.findIndex((p) => p.id === it.id);
        if (idx === -1) return it;
        const resultPath = results[idx];
        if (resultPath) {
          converted++;
          return { ...it, status: 'done', resultPath };
        }
        return { ...it, status: 'error', error: 'Файл пропущен' };
      }));

      toast(`Конвертировано ${converted} из ${pendingItems.length} файлов`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setItems((prev) => prev.map((it) =>
        it.status === 'converting' ? { ...it, status: 'error', error: msg } : it,
      ));
      toast(`Ошибка пакетной конвертации: ${msg}`, 'error');
    } finally {
      setIsBatchConverting(false);
    }
  }, [items, targetFormat, quality, showQuality]);

  const pendingCount = useMemo(() => items.filter((it) => it.status === 'pending' || it.status === 'error').length, [items]);
  const doneCount = useMemo(() => items.filter((it) => it.status === 'done').length, [items]);

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={20} className="text-aurora-blue" />
          <h2 className="text-lg font-medium text-text-primary">Конвертация</h2>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span>{items.length} файл(ов)</span>
            {doneCount > 0 && <span className="text-status-success">{doneCount} готово</span>}
          </div>
        )}
      </div>

      {/* Source buttons */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        <GlassPanel hover padding="md" className="cursor-pointer" >
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setIsGalleryOpen(true)}
            className="w-full flex flex-col items-center gap-2 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-aurora-blue/10 flex items-center justify-center">
              <ImageIcon size={20} className="text-aurora-blue" />
            </div>
            <span className="text-sm font-medium text-text-primary">Из галереи</span>
            <span className="text-xs text-text-tertiary">Выбрать сгенерированные изображения</span>
          </motion.button>
        </GlassPanel>

        <GlassPanel hover padding="md" className="cursor-pointer">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={handleAddExternal}
            className="w-full flex flex-col items-center gap-2 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-aurora-purple/10 flex items-center justify-center">
              <Upload size={20} className="text-aurora-purple" />
            </div>
            <span className="text-sm font-medium text-text-primary">Загрузить файл</span>
            <span className="text-xs text-text-tertiary">Выбрать изображение с диска</span>
          </motion.button>
        </GlassPanel>
      </div>

      {/* Settings */}
      <GlassPanel padding="md" className="shrink-0">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Target format */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary whitespace-nowrap">Формат:</span>
            <div className="flex gap-1">
              {(['png', 'jpeg', 'webp'] as TargetFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setTargetFormat(fmt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    targetFormat === fmt
                      ? 'bg-aurora-blue/20 text-aurora-blue'
                      : 'bg-glass-hover text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Quality slider */}
          <AnimatePresence>
            {showQuality && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="flex items-center gap-2 overflow-hidden"
              >
                <span className="text-xs text-text-tertiary whitespace-nowrap">Качество:</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-24 accent-aurora-blue"
                />
                <span className="text-xs text-text-primary w-8 text-right">{quality}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Spacer + actions */}
          <div className="flex-1" />
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                Очистить
              </button>
              <button
                onClick={handleConvertAll}
                disabled={pendingCount === 0 || isBatchConverting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-aurora-blue/20 text-aurora-blue hover:bg-aurora-blue/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isBatchConverting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <FolderDown size={12} />
                )}
                Конвертировать все ({pendingCount})
              </button>
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Image list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-3">
            <ArrowLeftRight size={40} className="opacity-30" />
            <span className="text-sm">Добавьте изображения для конвертации</span>
            <span className="text-xs">Выберите из галереи или загрузите файлы с диска</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
                >
                  <GlassPanel padding="sm" className="flex items-center gap-3">
                    {/* Thumbnail */}
                    <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-bg-primary">
                      <img
                        src={item.thumbnailUrl}
                        alt={item.fileName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{item.fileName}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-text-tertiary">{item.currentFormat}</span>
                        {item.fileSize > 0 && (
                          <span className="text-xs text-text-tertiary">{formatBytes(item.fileSize)}</span>
                        )}
                        {item.modelId && (
                          <span className="text-xs text-text-tertiary">{getModelShortName(item.modelId)}</span>
                        )}
                      </div>
                      {item.prompt && (
                        <p className="text-[10px] text-text-tertiary truncate mt-0.5 max-w-md">
                          {item.prompt}
                        </p>
                      )}
                    </div>

                    {/* Status */}
                    <div className="shrink-0 flex items-center gap-2">
                      {item.status === 'converting' && (
                        <Loader2 size={16} className="text-aurora-blue animate-spin" />
                      )}
                      {item.status === 'done' && (
                        <div className="flex items-center gap-1 text-status-success">
                          <Check size={14} />
                          <span className="text-xs">Готово</span>
                        </div>
                      )}
                      {item.status === 'error' && (
                        <span className="text-xs text-status-error truncate max-w-[120px]" title={item.error}>
                          {item.error}
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <button
                          onClick={() => handleConvertSingle(item)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-aurora-blue hover:bg-aurora-blue/10 transition-colors cursor-pointer"
                          title="Конвертировать"
                        >
                          <Download size={12} />
                          Сохранить
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(item.id)}
                        className="p-1 rounded-lg text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors cursor-pointer"
                        title="Удалить"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </GlassPanel>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Gallery picker modal */}
      <AnimatePresence>
        {isGalleryOpen && (
          <GalleryPickerModal
            onSelect={handleAddFromGallery}
            onClose={() => setIsGalleryOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Gallery Picker Modal
// ─────────────────────────────────────────────────────────

interface GalleryPickerModalProps {
  onSelect: (images: DBImage[]) => void;
  onClose: () => void;
}

function GalleryPickerModal({ onSelect, onClose }: GalleryPickerModalProps) {
  const [images, setImages] = useState<DBImage[]>([]);
  const [selectedMap, setSelectedMap] = useState<Map<number, DBImage>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  // Load images
  const loadImages = useCallback(async (newOffset: number, searchQuery: string) => {
    setIsLoading(true);
    try {
      const result = await ipc.invoke('gallery:list', {
        offset: newOffset,
        limit: PAGE_SIZE,
        search: searchQuery || undefined,
      });
      setImages(result.images);
      setTotal(result.total);
      setOffset(newOffset);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadImages(0, '');
  }, [loadImages]);

  const handleSearch = useCallback((q: string) => {
    setSearch(q);
    loadImages(0, q);
  }, [loadImages]);

  const toggleSelect = useCallback((img: DBImage) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(img.id)) next.delete(img.id);
      else next.set(img.id, img);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onSelect(Array.from(selectedMap.values()));
  }, [selectedMap, onSelect]);

  const hasMore = offset + PAGE_SIZE < total;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-[720px] max-h-[80vh] flex flex-col rounded-2xl overflow-hidden border border-glass-border bg-bg-primary/95 backdrop-blur-xl shadow-2xl"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-glass-border">
          <h3 className="text-base font-medium text-text-primary">Выбрать из галереи</h3>
          <div className="flex items-center gap-3">
            {selectedMap.size > 0 && (
              <span className="text-xs text-aurora-blue">Выбрано: {selectedMap.size}</span>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-glass-hover transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-glass-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Поиск по промпту..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-glass-hover text-text-primary text-sm placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-aurora-blue/30"
            />
          </div>
        </div>

        {/* Images grid */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-aurora-blue animate-spin" />
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-2">
              <ImageIcon size={32} className="opacity-30" />
              <span className="text-sm">Нет изображений</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {images.map((img) => {
                  const isSelected = selectedMap.has(img.id);
                  return (
                    <motion.div
                      key={img.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleSelect(img)}
                      className={`relative rounded-lg overflow-hidden cursor-pointer ring-2 transition-all ${
                        isSelected
                          ? 'ring-aurora-blue shadow-lg shadow-aurora-blue/20'
                          : 'ring-transparent hover:ring-glass-border'
                      }`}
                    >
                      <img
                        src={localFileUrl(img.file_path)}
                        alt={img.prompt}
                        className="w-full aspect-square object-cover"
                        loading="lazy"
                      />
                      {/* Selection indicator */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-aurora-blue flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                      {/* Info overlay */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                        <p className="text-[9px] text-white/80 line-clamp-1">{img.prompt}</p>
                        <span className="text-[8px] text-white/50">{getModelShortName(img.model_id)}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-glass-border">
                <span className="text-xs text-text-tertiary">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} из {total}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={offset === 0}
                    onClick={() => loadImages(Math.max(0, offset - PAGE_SIZE), search)}
                    className="px-3 py-1 rounded-lg text-xs text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Назад
                  </button>
                  <button
                    disabled={!hasMore}
                    onClick={() => loadImages(offset + PAGE_SIZE, search)}
                    className="px-3 py-1 rounded-lg text-xs text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Далее
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-glass-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedMap.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-aurora-blue/20 text-aurora-blue hover:bg-aurora-blue/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={14} />
            Добавить ({selectedMap.size})
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
