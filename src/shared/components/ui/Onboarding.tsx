import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ipc } from '@/shared/lib/ipc';
import type { AppConfig } from '@/shared/types/config';

export function Onboarding() {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    ipc.invoke('config:get').then((config: AppConfig) => {
      if (config.apiKeys.length === 0) {
        setIsOpen(true);
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    try {
      await ipc.invoke('config:set', {
        apiKeys: [{
          id: 'key_1',
          name: 'Основной',
          key: apiKey.trim(),
          isActive: true,
        }],
      });
      setIsOpen(false);
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-panel p-8 w-96 flex flex-col items-center gap-6"
        >
          {/* Logo */}
          <div className="text-5xl">🎨</div>
          <div>
            <h2 className="text-xl font-bold text-text-primary text-center">
              Добро пожаловать в ImageVibe
            </h2>
            <p className="text-xs text-text-tertiary text-center mt-2">
              AI-генерация изображений через OpenRouter
            </p>
          </div>

          {/* API Key input */}
          <div className="w-full flex flex-col gap-2">
            <label className="text-xs text-text-secondary">
              Введите API ключ OpenRouter
            </label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="sk-or-..."
              type="password"
              autoFocus
              className="w-full bg-bg-tertiary text-text-primary text-sm rounded-lg px-4 py-3 outline-none border border-glass-border focus:border-aurora-blue/50 font-mono"
            />
            <p className="text-[10px] text-text-tertiary">
              Получите ключ на openrouter.ai/keys
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <button
              onClick={() => setIsOpen(false)}
              className="flex-1 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
            >
              Позже
            </button>
            <button
              onClick={handleSave}
              disabled={!apiKey.trim() || isSaving}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-aurora-blue to-aurora-purple text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Сохранение...' : 'Начать'}
            </button>
          </div>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  );
}
