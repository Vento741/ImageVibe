import { motion } from 'framer-motion';
import { AlertTriangle, RotateCw, X } from 'lucide-react';
import { getModelShortName } from '@/shared/lib/utils';
import type { CanvasCard } from '../store';

interface FailedCardProps {
  card: CanvasCard;
  onRemove: (id: string) => void;
  onRetry: (card: CanvasCard) => void;
}

export function FailedCard({ card, onRemove, onRetry }: FailedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="relative aspect-square rounded-xl overflow-hidden bg-status-error/5 border border-status-error/20 group"
    >
      <div className="h-full flex flex-col items-center justify-center gap-3 p-4">
        <AlertTriangle size={24} className="text-status-error/70" />
        <p className="text-xs text-status-error/80 text-center line-clamp-3 max-w-[85%]">
          {card.error || 'Ошибка генерации'}
        </p>
        <p className="text-[10px] text-text-tertiary line-clamp-1 max-w-[80%] text-center">
          {card.prompt}
        </p>
        <span className="text-[10px] text-text-tertiary/60">
          {getModelShortName(card.modelId)}
        </span>

        {/* Retry button */}
        <button
          onClick={() => onRetry(card)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-error/10 hover:bg-status-error/20 text-status-error text-xs transition-colors cursor-pointer"
        >
          <RotateCw size={12} />
          Повторить
        </button>
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(card.id)}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-black/40 hover:bg-black/60 text-text-tertiary hover:text-white cursor-pointer"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
