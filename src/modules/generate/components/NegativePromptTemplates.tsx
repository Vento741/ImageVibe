import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGenerateStore } from '../store';

const TEMPLATES = [
  {
    name: 'Базовый',
    prompt: 'blurry, low quality, deformed, watermark, text, logo',
  },
  {
    name: 'Портреты',
    prompt: 'blurry, low quality, deformed, watermark, bad anatomy, extra fingers, mutated hands, poorly drawn face',
  },
  {
    name: 'Пейзажи',
    prompt: 'blurry, low quality, people, buildings, urban, text, watermark',
  },
  {
    name: 'Аниме',
    prompt: 'photorealistic, 3d, western, blurry, low quality, deformed',
  },
  {
    name: 'Фото',
    prompt: 'cartoon, anime, illustration, painting, drawing, low quality, blurry',
  },
  {
    name: 'Максимум',
    prompt: 'blurry, low quality, deformed, watermark, text, logo, bad anatomy, extra fingers, mutated hands, poorly drawn face, duplicate, morbid, out of frame, cropped, worst quality, low resolution, jpeg artifacts',
  },
];

export function NegativePromptTemplates() {
  const [isOpen, setIsOpen] = useState(false);
  const negativePrompt = useGenerateStore((s) => s.negativePrompt);
  const setNegativePrompt = useGenerateStore((s) => s.setNegativePrompt);

  const applyTemplate = (template: string) => {
    // If there's existing text, append; otherwise replace
    if (negativePrompt.trim()) {
      setNegativePrompt(`${negativePrompt}, ${template}`);
    } else {
      setNegativePrompt(template);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-[10px] text-aurora-blue hover:text-aurora-purple transition-colors cursor-pointer"
      >
        Шаблоны ▾
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute top-6 left-0 z-50 w-72 glass-panel p-2 flex flex-col gap-1"
            >
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => applyTemplate(t.prompt)}
                  className="text-left px-2 py-1.5 rounded-md hover:bg-glass-hover transition-colors cursor-pointer"
                >
                  <div className="text-xs text-text-primary font-medium">{t.name}</div>
                  <div className="text-[10px] text-text-tertiary truncate mt-0.5">
                    {t.prompt}
                  </div>
                </button>
              ))}

              {negativePrompt && (
                <button
                  onClick={() => { setNegativePrompt(''); setIsOpen(false); }}
                  className="text-left px-2 py-1.5 rounded-md hover:bg-glass-hover transition-colors cursor-pointer border-t border-glass-border mt-1"
                >
                  <div className="text-xs text-status-error">Очистить</div>
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
