import { motion } from 'framer-motion';
import { useGenerateStore } from '../store';
import type { GenerationMode } from '@/shared/types/models';

const MODES: Array<{ id: GenerationMode; icon: string; label: string }> = [
  { id: 'text2img', icon: '✏️', label: 'Текст→Фото' },
  { id: 'img2img', icon: '🖼', label: 'Фото→Фото' },
  { id: 'inpaint', icon: '🎭', label: 'Инпейнт' },
  { id: 'upscale', icon: '🔍', label: 'Апскейл' },
];

export function ModeSelector() {
  const mode = useGenerateStore((s) => s.mode);
  const setMode = useGenerateStore((s) => s.setMode);

  return (
    <div className="flex gap-1">
      {MODES.map((m) => (
        <motion.button
          key={m.id}
          onClick={() => setMode(m.id)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
            mode === m.id
              ? 'bg-aurora-blue/20 text-aurora-blue border border-aurora-blue/30'
              : 'text-text-secondary hover:bg-glass-hover border border-transparent'
          }`}
        >
          <span>{m.icon}</span>
          <span>{m.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
