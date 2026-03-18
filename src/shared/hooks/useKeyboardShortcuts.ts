import { useEffect } from 'react';
import type { Page } from '../../App';
import { useGenerateStore } from '@/modules/generate/store';
import { isTypingInInput } from '@/shared/lib/utils';

interface ShortcutConfig {
  onNavigate: (page: Page) => void;
}

/**
 * Global keyboard shortcuts.
 * Call once in App.tsx.
 */
export function useKeyboardShortcuts({ onNavigate }: ShortcutConfig) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isTyping = isTypingInInput(e.target);

      // Ctrl/Cmd + key shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'g':
            e.preventDefault();
            onNavigate('generate');
            break;
          case 'l':
            e.preventDefault();
            onNavigate('gallery');
            break;
          case ',':
            e.preventDefault();
            onNavigate('settings');
            break;
          case 'b':
            // Ctrl+B — toggle sidebar (placeholder)
            e.preventDefault();
            break;
          case 'r':
            if (!isTyping) {
              e.preventDefault();
              useGenerateStore.getState().randomizeSeed();
            }
            break;
          case 'd':
            if (!isTyping) {
              e.preventDefault();
              // Duplicate last generation (keep prompt + params, new seed)
              useGenerateStore.getState().randomizeSeed();
              document.dispatchEvent(new CustomEvent('imagevibe:generate'));
            }
            break;
        }

        // Ctrl+Shift combos
        if (e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case 'm':
              e.preventDefault();
              useGenerateStore.getState().toggleUiMode();
              break;
          }
        }
      }

      // Non-modifier shortcuts (only when not typing)
      if (!isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key) {
          case 'F':
          case 'f':
            // F — toggle favorite (in gallery context)
            break;
          case ' ':
            // Space — fullscreen preview (in gallery context)
            break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNavigate]);
}
