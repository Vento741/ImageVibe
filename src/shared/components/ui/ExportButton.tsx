import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Check } from 'lucide-react';
import { ipc } from '@/shared/lib/ipc';
import { useToastStore } from '@/shared/stores/toastStore';
import type { AppConfig } from '@/shared/types/config';

type ExportFormat = 'png' | 'jpeg' | 'webp';

interface ExportButtonProps {
  imageId: number;
  /** Size variant. Default 'sm' */
  size?: 'sm' | 'md';
  /** Additional class names for the trigger button */
  className?: string;
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
};

export function ExportButton({ imageId, size = 'sm', className = '' }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [defaultFormat, setDefaultFormat] = useState<ExportFormat>('png');
  const addToast = useToastStore((s) => s.addToast);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  // Load default format from config
  useEffect(() => {
    ipc.invoke('config:get').then((cfg: AppConfig) => {
      if (cfg.export?.defaultFormat) {
        setDefaultFormat(cfg.export.defaultFormat);
      }
    }).catch(() => {});
  }, []);

  // Position popup when opening
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popupHeight = 120;
      const popupWidth = 120;

      // Prefer placing above the button; fall back to below if not enough space
      let top = rect.top - popupHeight - 4;
      if (top < 8) {
        top = rect.bottom + 4;
      }

      let left = rect.left + rect.width / 2 - popupWidth / 2;
      // Clamp to viewport
      left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));

      setPopupPos({ top, left });
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        popupRef.current && !popupRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler, true);
    return () => window.removeEventListener('mousedown', handler, true);
  }, [open]);

  const handleExport = useCallback(async (format: ExportFormat) => {
    setOpen(false);
    try {
      const result = await ipc.invoke('file:export', imageId, { format });
      if (result) {
        addToast({ message: 'Изображение сохранено', type: 'success' });
      } else {
        addToast({ message: 'Экспорт отменён', type: 'info' });
      }
    } catch {
      addToast({ message: 'Не удалось экспортировать', type: 'error' });
    }
  }, [imageId, addToast]);

  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`cursor-pointer transition-colors ${className}`}
        title="Экспорт"
      >
        <Download size={iconSize} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ duration: 0.12 }}
              className="fixed z-[9999] py-1.5 rounded-xl bg-bg-elevated/95 border border-glass-border backdrop-blur-xl shadow-2xl min-w-[120px]"
              style={{ top: popupPos.top, left: popupPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2.5 pb-1 mb-1 border-b border-glass-border">
                <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Экспорт</span>
              </div>
              {(['png', 'jpeg', 'webp'] as ExportFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => handleExport(fmt)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer text-left ${
                    fmt === defaultFormat
                      ? 'text-aurora-blue bg-aurora-blue/10'
                      : 'text-text-secondary hover:text-text-primary hover:bg-glass-hover'
                  }`}
                >
                  {fmt === defaultFormat ? <Check size={12} className="shrink-0" /> : <span className="w-3" />}
                  {FORMAT_LABELS[fmt]}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
