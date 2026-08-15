import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Image, Layers, Film, Clapperboard } from 'lucide-react';
import { useGenerateStore } from '../store';
import { ipc } from '@/shared/lib/ipc';
import type { KieMode, KieModel } from '@/shared/types/kie';

/**
 * Режим — фильтр списка моделей, а не параметр запроса.
 *
 * У kie.ai режим зашит в саму модель: `flux-2/pro-text-to-image` и
 * `flux-2/pro-image-to-image` — две отдельные записи каталога. Поэтому вкладка режима
 * задаёт список моделей, а модель несёт свой режим. Это убирает состояние «режим
 * выбран, а модель его не умеет», которое в блоке C дало три дефекта.
 */
const MODES: Array<{ id: KieMode; icon: ReactNode; label: string }> = [
  { id: 'text2img', icon: <Pencil size={14} />, label: 'Текст→Фото' },
  { id: 'img2img', icon: <Image size={14} />, label: 'Фото→Фото' },
  { id: 'inpaint', icon: <Layers size={14} />, label: 'По маске' },
  { id: 'text2video', icon: <Film size={14} />, label: 'Текст→Видео' },
  { id: 'img2video', icon: <Clapperboard size={14} />, label: 'Фото→Видео' },
];

export function ModeSelector() {
  const [models, setModels] = useState<KieModel[]>([]);
  const [available, setAvailable] = useState<KieMode[]>([]);
  const mode = useGenerateStore((s) => s.mode);
  const switchMode = useGenerateStore((s) => s.switchMode);

  useEffect(() => {
    ipc.invoke('catalog:list').then(setModels).catch(() => {});
    ipc.invoke('catalog:modes').then(setAvailable).catch(() => {});
  }, []);

  // Вкладка, для которой нет ни одной модели, не показывается: предлагать режим,
  // который нечем обслужить, значит вести пользователя в тупик
  const shown = MODES.filter((m) => available.includes(m.id));
  if (shown.length === 0) return null;

  return (
    <div className="flex gap-0.5 flex-wrap">
      {shown.map((m) => (
        <motion.button
          key={m.id}
          onClick={() => switchMode(m.id, models)}
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
