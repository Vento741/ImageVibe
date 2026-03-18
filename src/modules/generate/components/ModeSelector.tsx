import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Image, Layers } from 'lucide-react';
import { useGenerateStore } from '../store';
import type { GenerationMode } from '@/shared/types/models';

const MODES: Array<{ id: GenerationMode; icon: ReactNode; label: string }> = [
  { id: 'text2img', icon: <Pencil size={14} />, label: 'Текст→Фото' },
  { id: 'img2img', icon: <Image size={14} />, label: 'Фото→Фото' },
  { id: 'inpaint', icon: <Layers size={14} />, label: 'Инпейнт' },
];

export function ModeSelector() {
  const mode = useGenerateStore((s) => s.mode);
  const setMode = useGenerateStore((s) => s.setMode);

  return (
    <div className="flex gap-0.5">
      {MODES.map((m) => (
        <motion.button
          key={m.id}
          onClick={() => setMode(m.id)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={`flex-1 py-1.5 px-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-0.5 min-w-0 ${
            mode === m.id
              ? 'bg-aurora-blue/20 text-aurora-blue border border-aurora-blue/30'
              : 'text-text-secondary hover:bg-glass-hover border border-transparent'
          }`}
        >
          <span className="shrink-0">{m.icon}</span>
          <span className="truncate">{m.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
