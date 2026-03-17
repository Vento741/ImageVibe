import { motion, AnimatePresence } from 'framer-motion';
import { useGenerateStore } from '../store';
import { useAutoTranslate } from '../hooks/useAutoTranslate';

/** Check if text contains Cyrillic */
function hasCyrillic(text: string): boolean {
  return /[а-яА-ЯёЁ]/.test(text);
}

export function TranslationPreview() {
  // Activate auto-translation (RU→EN)
  useAutoTranslate();

  const translatedPrompt = useGenerateStore((s) => s.translatedPrompt);
  const prompt = useGenerateStore((s) => s.prompt);

  if (!translatedPrompt || translatedPrompt === prompt) return null;

  // Determine label: if prompt is English and translation is Russian → "RU:", otherwise "EN:"
  const isPromptEnglish = !hasCyrillic(prompt) && hasCyrillic(translatedPrompt);
  const label = isPromptEnglish ? 'RU:' : 'EN:';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="border-t border-glass-border pt-2 mt-1"
      >
        <div className="flex items-start gap-1.5">
          <span className="text-aurora-blue text-xs font-medium shrink-0">{label}</span>
          <p className="text-xs text-text-tertiary leading-relaxed break-words">
            {translatedPrompt}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
