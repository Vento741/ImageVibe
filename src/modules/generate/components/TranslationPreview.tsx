import { motion, AnimatePresence } from 'framer-motion';
import { useGenerateStore } from '../store';
import { useAutoTranslate } from '../hooks/useAutoTranslate';

export function TranslationPreview() {
  // Activate auto-translation
  useAutoTranslate();

  const translatedPrompt = useGenerateStore((s) => s.translatedPrompt);
  const prompt = useGenerateStore((s) => s.prompt);

  // Only show if we have a translation different from the prompt
  if (!translatedPrompt || translatedPrompt === prompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="border-t border-glass-border pt-2 mt-1"
      >
        <div className="flex items-start gap-1.5">
          <span className="text-aurora-blue text-xs font-medium shrink-0">EN:</span>
          <p className="text-xs text-text-tertiary leading-relaxed break-words">
            {translatedPrompt}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
