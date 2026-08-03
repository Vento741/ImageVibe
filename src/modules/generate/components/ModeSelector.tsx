import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Image, Layers } from 'lucide-react';
import { useGenerateStore } from '../store';
import { ipc } from '@/shared/lib/ipc';
import { availableModes } from '@/shared/lib/paramSchema';
import type { GenerationMode } from '@/shared/types/models';
import type { CatalogModelDTO } from '@/shared/types/ipc';

const MODES: Array<{ id: GenerationMode; icon: ReactNode; label: string }> = [
  { id: 'text2img', icon: <Pencil size={14} />, label: 'Текст→Фото' },
  { id: 'img2img', icon: <Image size={14} />, label: 'Фото→Фото' },
  { id: 'inpaint', icon: <Layers size={14} />, label: 'Инпейнт' },
];

// Until prices arrive, the catalog record's schema is not the cross-provider
// intersection and cannot be trusted to judge mode availability (see ParamsPanel).
const TEXT_ONLY_MODES: GenerationMode[] = ['text2img'];

export function ModeSelector() {
  const [models, setModels] = useState<CatalogModelDTO[]>([]);
  const mode = useGenerateStore((s) => s.mode);
  const setMode = useGenerateStore((s) => s.setMode);
  const selectedModelId = useGenerateStore((s) => s.selectedModelId);

  const load = useCallback(() => {
    ipc.invoke('catalog:list')
      .then((groups) => setModels(groups.flatMap((group) => group.models)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    return ipc.on('catalog:updated', load);
  }, [load]);

  const selected = models.find((m) => m.id === selectedModelId);
  const allowed = selected?.pricesLoaded ? availableModes(selected.schema) : TEXT_ONLY_MODES;

  // A mode allowed for one model may not be for the next (e.g. inpaint needs two
  // references) — leaving it selected would send a generation with a mask the
  // model has nowhere to put.
  useEffect(() => {
    if (!allowed.includes(mode)) setMode('text2img');
  }, [allowed.join('|'), mode, setMode]);

  return (
    <div className="flex gap-0.5">
      {MODES.filter((m) => allowed.includes(m.id)).map((m) => (
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
