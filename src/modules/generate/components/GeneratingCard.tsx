import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader, X, AlertTriangle } from 'lucide-react';
import { getModelShortName } from '@/shared/lib/utils';
import { ipc } from '@/shared/lib/ipc';
import type { CanvasCard } from '../store';

/** Seconds after which a "slow generation" warning appears */
const SLOW_WARNING_THRESHOLD_SEC = 60;

interface GeneratingCardProps {
  card: CanvasCard;
  onRemove: (id: string) => void;
}

/** Animated placeholder shown while an image is being generated */
export function GeneratingCard({ card, onRemove }: GeneratingCardProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - card.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [card.startedAt]);

  const isSlow = elapsed >= SLOW_WARNING_THRESHOLD_SEC;

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}с`;
    return `${Math.floor(s / 60)}м ${s % 60}с`;
  };

  const handleCancel = useCallback(() => {
    if (card.queueItemId) {
      ipc.invoke('queue:cancel', card.queueItemId).catch(() => {
        // Fallback: remove from UI even if IPC fails
        onRemove(card.id);
      });
    } else {
      onRemove(card.id);
    }
  }, [card.queueItemId, card.id, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="relative aspect-square rounded-xl overflow-hidden group"
    >
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-aurora-blue/20 via-aurora-purple/20 to-aurora-blue/20 animate-gradient-shift" />

      {/* Blur "generating" effect — animated blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute w-32 h-32 rounded-full bg-aurora-blue/30 blur-3xl"
          animate={{
            x: ['-20%', '60%', '20%', '-20%'],
            y: ['-10%', '30%', '70%', '-10%'],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-40 h-40 rounded-full bg-aurora-purple/25 blur-3xl"
          animate={{
            x: ['70%', '10%', '50%', '70%'],
            y: ['60%', '10%', '40%', '60%'],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-24 h-24 rounded-full bg-white/10 blur-2xl"
          animate={{
            x: ['30%', '70%', '10%', '30%'],
            y: ['20%', '60%', '30%', '20%'],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Frosted glass overlay */}
      <div className="absolute inset-0 backdrop-blur-sm bg-glass/30" />

      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-center gap-3 p-4">
        {/* Spinner */}
        <div className="relative">
          <motion.div
            className={`w-10 h-10 rounded-full border-2 ${isSlow ? 'border-amber-400/40 border-t-amber-400' : 'border-aurora-blue/40 border-t-aurora-blue'}`}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <Loader size={16} className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isSlow ? 'text-amber-400/70' : 'text-aurora-blue/70'}`} />
        </div>

        {/* Timer */}
        <span className={`text-xs font-medium tabular-nums ${isSlow ? 'text-amber-400' : 'text-text-secondary'}`}>
          {formatElapsed(elapsed)}
        </span>

        {/* Slow generation warning */}
        <AnimatePresence>
          {isSlow && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-400/10 border border-amber-400/20"
            >
              <AlertTriangle size={11} className="text-amber-400 shrink-0" />
              <span className="text-[10px] text-amber-400/90 leading-tight">
                Дольше обычного...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt preview */}
        <p className="text-[11px] text-text-tertiary text-center line-clamp-2 max-w-[80%] leading-tight">
          {card.prompt}
        </p>

        {/* Model badge */}
        <span className="text-[10px] text-text-tertiary/70 bg-glass/50 px-2 py-0.5 rounded-full">
          {getModelShortName(card.modelId)}
        </span>

        {/* Cancel button — always visible at bottom */}
        <motion.button
          onClick={handleCancel}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-text-tertiary hover:text-text-secondary text-[11px] transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
        >
          <X size={11} />
          Отменить
        </motion.button>
      </div>

      {/* Shimmer line across the card */}
      <motion.div
        className={`absolute inset-x-0 h-px bg-gradient-to-r from-transparent ${isSlow ? 'via-amber-400/50' : 'via-aurora-blue/50'} to-transparent`}
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Close button on hover (top-right X) */}
      <button
        onClick={handleCancel}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-black/40 hover:bg-black/60 text-text-tertiary hover:text-white cursor-pointer"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
