import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Fuse from 'fuse.js';
import type { Page } from '../../../App';
import { useGenerateStore } from '@/modules/generate/store';

interface CommandItem {
  id: string;
  icon: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
}

export function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  function applyModel(modelId: string) {
    useGenerateStore.getState().setSelectedModelId(modelId);
    onNavigate('generate');
    onClose();
  }

  // Build command list
  const commands = useMemo<CommandItem[]>(() => [
    // Navigation
    { id: 'nav-generate', icon: '🎨', label: 'Генерация', category: 'Навигация', shortcut: 'Ctrl+G', action: () => { onNavigate('generate'); onClose(); } },
    { id: 'nav-gallery', icon: '🖼', label: 'Галерея', category: 'Навигация', shortcut: 'Ctrl+L', action: () => { onNavigate('gallery'); onClose(); } },
    { id: 'nav-collections', icon: '📁', label: 'Коллекции', category: 'Навигация', action: () => { onNavigate('collections'); onClose(); } },
    { id: 'nav-analytics', icon: '📊', label: 'Аналитика', category: 'Навигация', action: () => { onNavigate('analytics'); onClose(); } },
    { id: 'nav-settings', icon: '⚙️', label: 'Настройки', category: 'Навигация', shortcut: 'Ctrl+,', action: () => { onNavigate('settings'); onClose(); } },

    // Models — Fast
    { id: 'model-klein', icon: '⚡', label: 'FLUX.2 Klein', category: 'Быстрые', action: () => { applyModel('black-forest-labs/flux.2-klein-4b'); } },
    { id: 'model-rv-fast', icon: '⚡', label: 'Riverflow V2 Fast', category: 'Быстрые', action: () => { applyModel('sourceful/riverflow-v2-fast'); } },
    { id: 'model-gemini-flash', icon: '⚡', label: 'Gemini 3.1 Flash', category: 'Быстрые', action: () => { applyModel('google/gemini-3.1-flash-image-preview'); } },
    { id: 'model-gemini-25', icon: '⚡', label: 'Gemini 2.5 Flash', category: 'Быстрые', action: () => { applyModel('google/gemini-2.5-flash-image'); } },

    // Models — Quality
    { id: 'model-flux-pro', icon: '🎨', label: 'FLUX.2 Pro', category: 'Качественные', action: () => { applyModel('black-forest-labs/flux.2-pro'); } },
    { id: 'model-flux-max', icon: '🎨', label: 'FLUX.2 Max', category: 'Качественные', action: () => { applyModel('black-forest-labs/flux.2-max'); } },
    { id: 'model-flux-flex', icon: '🎨', label: 'FLUX.2 Flex', category: 'Качественные', action: () => { applyModel('black-forest-labs/flux.2-flex'); } },
    { id: 'model-seedream', icon: '🎨', label: 'Seedream 4.5', category: 'Качественные', action: () => { applyModel('bytedance-seed/seedream-4.5'); } },
    { id: 'model-rv-pro', icon: '🎨', label: 'Riverflow V2 Pro', category: 'Качественные', action: () => { applyModel('sourceful/riverflow-v2-pro'); } },
    { id: 'model-rv-max', icon: '🎨', label: 'Riverflow V2 Max', category: 'Качественные', action: () => { applyModel('sourceful/riverflow-v2-max-preview'); } },

    // Models — Smart
    { id: 'model-gemini-pro', icon: '🧠', label: 'Gemini 3 Pro', category: 'Умные', action: () => { applyModel('google/gemini-3-pro-image-preview'); } },
    { id: 'model-gpt5', icon: '🧠', label: 'GPT-5 Image', category: 'Умные', action: () => { applyModel('openai/gpt-5-image'); } },
    { id: 'model-gpt5-mini', icon: '🧠', label: 'GPT-5 Image Mini', category: 'Умные', action: () => { applyModel('openai/gpt-5-image-mini'); } },

    // Actions
    { id: 'act-generate', icon: '🎲', label: 'Генерировать', category: 'Действия', shortcut: 'Ctrl+Enter', action: () => { document.dispatchEvent(new CustomEvent('imagevibe:generate')); onClose(); } },
    { id: 'act-random-seed', icon: '🎲', label: 'Случайный seed', category: 'Действия', shortcut: 'Ctrl+R', action: () => { useGenerateStore.getState().randomizeSeed(); onClose(); } },
    { id: 'act-toggle-mode', icon: '⚡', label: 'Переключить режим', category: 'Действия', shortcut: 'Ctrl+Shift+M', action: () => { useGenerateStore.getState().toggleUiMode(); onClose(); } },
  ], [onNavigate, onClose]);

  // Fuzzy search
  const fuse = useMemo(
    () => new Fuse(commands, { keys: ['label', 'category'], threshold: 0.4 }),
    [commands]
  );

  const results = query.trim()
    ? fuse.search(query).map((r) => r.item)
    : commands;

  // Reset selection when query changes
  useEffect(() => setSelectedIndex(0), [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        results[selectedIndex]?.action();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [results, selectedIndex, onClose]
  );

  if (!isOpen) return null;

  // Group results by category
  const grouped = new Map<string, CommandItem[]>();
  for (const item of results) {
    const group = grouped.get(item.category) || [];
    group.push(item);
    grouped.set(item.category, group);
  }

  let flatIndex = 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        {/* Palette */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg glass-panel overflow-hidden"
        >
          {/* Search input */}
          <div className="flex items-center px-4 py-3 border-b border-glass-border">
            <span className="text-text-tertiary mr-2">🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Введите команду..."
              className="flex-1 bg-transparent text-text-primary outline-none text-sm placeholder-text-tertiary"
            />
            <kbd className="text-[10px] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-2">
            {results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-text-tertiary">
                Ничего не найдено
              </div>
            ) : (
              Array.from(grouped.entries()).map(([category, items]) => (
                <div key={category}>
                  <div className="px-4 py-1 text-[10px] text-text-tertiary uppercase tracking-wider">
                    {category}
                  </div>
                  {items.map((item) => {
                    const currentIndex = flatIndex++;
                    return (
                      <button
                        key={item.id}
                        onClick={item.action}
                        className={`w-full px-4 py-2 flex items-center gap-3 text-left text-sm transition-colors cursor-pointer ${
                          currentIndex === selectedIndex
                            ? 'bg-aurora-blue/10 text-text-primary'
                            : 'text-text-secondary hover:bg-glass-hover'
                        }`}
                      >
                        <span>{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && (
                          <kbd className="text-[10px] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
