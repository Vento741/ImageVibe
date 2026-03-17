import { useEffect, useRef } from 'react';
import { useGenerateStore } from '../store';
import { ipc } from '@/shared/lib/ipc';

/** Detect if text contains significant Russian characters */
function isRussianText(text: string): boolean {
  const cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  return cyrillicCount / Math.max(text.length, 1) > 0.3;
}

/**
 * Auto-translate prompt bidirectionally with debounce.
 * RU prompt → shows EN translation
 * EN prompt → shows RU translation
 */
export function useAutoTranslate(debounceMs = 800) {
  const prompt = useGenerateStore((s) => s.prompt);
  const setTranslatedPrompt = useGenerateStore((s) => s.setTranslatedPrompt);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPromptRef = useRef('');

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (!prompt.trim()) {
      setTranslatedPrompt('');
      return;
    }

    // Skip if same prompt
    if (prompt === lastPromptRef.current) return;

    const isRu = isRussianText(prompt);
    const channel = isRu ? 'generate:translate' : 'generate:translate-to-ru';

    timerRef.current = setTimeout(async () => {
      try {
        lastPromptRef.current = prompt;
        const translated = await ipc.invoke(channel, prompt);
        if (useGenerateStore.getState().prompt === prompt) {
          setTranslatedPrompt(translated);
        }
      } catch {
        // Silently ignore translation errors
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [prompt, debounceMs, setTranslatedPrompt]);
}
