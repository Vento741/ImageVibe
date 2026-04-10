import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Copy, MessageSquare, Star, RotateCw, FolderOpen, X } from 'lucide-react';
import { useGenerateStore } from '../store';
import { formatCostDisplay, getModelShortName } from '@/shared/lib/utils';

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
import { ExportButton } from '@/shared/components/ui/ExportButton';
import type { CanvasCard } from '../store';

interface CompletedCardProps {
  card: CanvasCard;
  onRemove: (id: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function CompletedCard({ card, onRemove, isSelected, onSelect }: CompletedCardProps) {
  const addToast = useToastStore((s) => s.addToast);
  const result = card.result!;

  const handleCopyImage = useCallback(async () => {
    try {
      const blob = await fetch(`data:image/png;base64,${result.imageBase64}`).then(r => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      addToast({ message: 'Изображение скопировано', type: 'success' });
    } catch {
      addToast({ message: 'Не удалось скопировать', type: 'error' });
    }
  }, [result.imageBase64, addToast]);

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(result.prompt);
    addToast({ message: 'Промпт скопирован', type: 'success' });
  }, [result.prompt, addToast]);

  const handleToggleFavorite = useCallback(async () => {
    if (!result.imageId) return;
    try {
      const isFav = await ipc.invoke('gallery:toggle-favorite', result.imageId);
      addToast({ message: isFav ? 'Добавлено в избранное' : 'Убрано из избранного', type: 'success' });
    } catch {
      // ignore
    }
  }, [result.imageId, addToast]);

  const handleRepeat = useCallback(() => {
    useGenerateStore.getState().setPrompt(result.prompt);
    if (result.translatedPrompt) {
      useGenerateStore.getState().setTranslatedPrompt(result.translatedPrompt);
    }
    useGenerateStore.getState().setSelectedModelId(result.modelId);
    useGenerateStore.getState().randomizeSeed();
    addToast({ message: 'Параметры загружены — нажмите Генерировать', type: 'info' });
  }, [result, addToast]);

  const handleOpenFolder = useCallback(async () => {
    if (!result.filePath) return;
    try {
      await ipc.invoke('file:open-folder', result.filePath.replace(/[/\\][^/\\]+$/, ''));
    } catch {
      addToast({ message: 'Не удалось открыть папку', type: 'error' });
    }
  }, [result.filePath, addToast]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`relative rounded-xl overflow-hidden group cursor-pointer transition-shadow ${
        isSelected ? 'ring-2 ring-aurora-blue shadow-lg shadow-aurora-blue/20' : 'hover:ring-1 hover:ring-white/20'
      }`}
      onClick={() => onSelect(card.id)}
    >
      {/* Image */}
      <img
        src={`data:image/png;base64,${result.imageBase64}`}
        alt={result.prompt}
        className="w-full aspect-square object-cover"
      />

      {/* Hover overlay with actions */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Top-right: remove */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(card.id); }}
          className="absolute top-2 right-2 p-1 rounded-md bg-black/40 hover:bg-black/60 text-text-tertiary hover:text-white cursor-pointer transition-colors"
        >
          <X size={14} />
        </button>

        {/* Bottom: info + actions */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          {/* Prompt */}
          <p className="text-[11px] text-white/80 line-clamp-1 mb-2">{result.prompt}</p>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <SmallAction icon={<Copy size={12} />} label="Копировать" onClick={handleCopyImage} />
            <SmallAction icon={<MessageSquare size={12} />} label="Промпт" onClick={handleCopyPrompt} />
            <SmallAction icon={<Star size={12} />} label="Избранное" onClick={handleToggleFavorite} />
            <SmallAction icon={<RotateCw size={12} />} label="Повторить" onClick={handleRepeat} />
            <SmallAction icon={<FolderOpen size={12} />} label="Папка" onClick={handleOpenFolder} />
            {result.imageId && (
              <Tooltip text="Экспорт">
                <ExportButton
                  imageId={result.imageId}
                  size="sm"
                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                />
              </Tooltip>
            )}

            <span className="ml-auto text-[10px] text-white/50">
              {getModelShortName(result.modelId)}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-white/40">
            <span>{result.width}×{result.height}</span>
            <span>{formatTime(result.generationTimeMs)}</span>
            {result.costUsd > 0 && <span>{formatCostDisplay(result.costUsd)}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SmallAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Tooltip text={label}>
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/70 hover:text-white cursor-pointer transition-colors"
      >
        {icon}
      </button>
    </Tooltip>
  );
}
