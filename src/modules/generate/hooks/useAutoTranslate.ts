import { useEffect, useRef } from 'react';
import { useGenerateStore } from '../store';
import { ipc } from '@/shared/lib/ipc';

/** Detect if text contains significant Russian characters */
function isRussianText(text: string): boolean {
  const cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  return cyrillicCount / Math.max(text.length, 1) > 0.3;
}

/**
 * Auto-translate prompt from Russian to English with debounce.
 * Shows the translated text in the UI as a preview.
 */
export function useAutoTranslate(debounceMs = 800) {
  const prompt = useGenerateStore((s) => s.prompt);
  const setTranslatedPrompt = useGenerateStore((s) => s.setTranslatedPrompt);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);
  const lastPromptRef = useRef('');

  useEffect(() => {
    // Clear previous timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Clear translation if prompt is empty
    if (!prompt.trim()) {
      setTranslatedPrompt('');
      return;
    }

    // Skip if not Russian
    if (!isRussianText(prompt)) {
      setTranslatedPrompt('');
      return;
    }

    // Skip if same prompt (avoid duplicate calls)
    if (prompt === lastPromptRef.current) return;

    // Debounce the translation
    timerRef.current = setTimeout(async () => {
      // Cancel previous in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      try {
        lastPromptRef.current = prompt;
        const translated = await ipc.invoke('generate:translate', prompt);
        // Only update if the prompt hasn't changed since we started
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
