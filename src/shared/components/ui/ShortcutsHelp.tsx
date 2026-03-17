import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SHORTCUTS = [
  { keys: 'Ctrl+Enter', action: 'Генерировать' },
  { keys: 'Ctrl+K', action: 'Палитра команд' },
  { keys: 'Ctrl+G', action: 'Генерация' },
  { keys: 'Ctrl+L', action: 'Галерея' },
  { keys: 'Ctrl+,', action: 'Настройки' },
  { keys: 'Ctrl+Shift+M', action: 'Простой/Расширенный' },
  { keys: 'Ctrl+R', action: 'Случайный seed' },
  { keys: 'Ctrl+D', action: 'Дублировать генерацию' },
  { keys: '?', action: 'Эта подсказка' },
];

export function ShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setIsOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="relative glass-panel p-6 w-80"
          >
            <h3 className="text-sm font-medium text-text-primary mb-4">
              Горячие клавиши
            </h3>
            <div className="flex flex-col gap-2">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">{s.action}</span>
                  <kbd className="text-[10px] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
