import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGenerateStore } from '../store';
import { ipc } from '@/shared/lib/ipc';

type ActionState = 'idle' | 'loading' | 'success' | 'error';

interface ActionButton {
  id: string;
  icon: string;
  label: string;
  tooltip: string;
}

const actions: ActionButton[] = [
  { id: 'generate', icon: '✨', label: 'Генерировать', tooltip: 'AI сгенерирует промпт по описанию' },
  { id: 'enhance', icon: '🔧', label: 'Улучшить', tooltip: 'AI улучшит текущий промпт' },
  { id: 'rephrase', icon: '🔄', label: 'Перефразировать', tooltip: 'AI перефразирует промпт' },
  { id: 'from_image', icon: '📸', label: 'Из фото', tooltip: 'Получить промпт из изображения' },
];

export function PromptActions() {
  const prompt = useGenerateStore((s) => s.prompt);
  const setPrompt = useGenerateStore((s) => s.setPrompt);
  const pushPromptHistory = useGenerateStore((s) => s.pushPromptHistory);
  const [actionState, setActionState] = useState<Record<string, ActionState>>({});

  const handleAction = async (actionId: string) => {
    if (actionState[actionId] === 'loading') return;

    setActionState((s) => ({ ...s, [actionId]: 'loading' }));

    try {
      let result: string;

      if (actionId === 'from_image') {
        const filePath = await ipc.invoke('file:select-image');
        if (!filePath) {
          setActionState((s) => ({ ...s, [actionId]: 'idle' }));
          return;
        }
        // Read image as base64 — for now use the file path
        // TODO: read file as base64 via IPC
        result = await ipc.invoke('generate:prompt-from-image', filePath);
      } else {
        if (!prompt.trim()) {
          setActionState((s) => ({ ...s, [actionId]: 'idle' }));
          return;
        }
        result = await ipc.invoke(
          'generate:prompt-assist',
          prompt,
          actionId as 'generate' | 'enhance' | 'rephrase'
        );
      }

      if (result) {
        pushPromptHistory(prompt);
        setPrompt(result);
      }

      setActionState((s) => ({ ...s, [actionId]: 'success' }));
      setTimeout(() => {
        setActionState((s) => ({ ...s, [actionId]: 'idle' }));
      }, 1500);
    } catch {
      setActionState((s) => ({ ...s, [actionId]: 'error' }));
      setTimeout(() => {
        setActionState((s) => ({ ...s, [actionId]: 'idle' }));
      }, 2000);
    }
  };

  return (
    <div className="flex gap-1 flex-wrap">
      {actions.map((action) => {
        const state = actionState[action.id] || 'idle';
        const isDisabled =
          state === 'loading' ||
          (action.id !== 'from_image' && action.id !== 'generate' && !prompt.trim());

        return (
          <motion.button
            key={action.id}
            onClick={() => handleAction(action.id)}
            disabled={isDisabled}
            whileHover={!isDisabled ? { scale: 1.05 } : {}}
            whileTap={!isDisabled ? { scale: 0.95 } : {}}
            title={action.tooltip}
            className={`px-2 py-1 rounded-md text-xs transition-all cursor-pointer flex items-center gap-1 ${
              state === 'loading'
                ? 'bg-aurora-blue/10 text-aurora-blue'
                : state === 'success'
                ? 'bg-status-success/10 text-status-success'
                : state === 'error'
                ? 'bg-status-error/10 text-status-error'
                : isDisabled
                ? 'text-text-tertiary opacity-50 cursor-not-allowed'
                : 'text-text-secondary hover:bg-glass-hover'
            }`}
          >
            <AnimatePresence mode="wait">
              {state === 'loading' ? (
                <motion.div
                  key="spinner"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-3 h-3 border border-aurora-blue/30 border-t-aurora-blue rounded-full animate-spin"
                />
              ) : (
                <motion.span
                  key="icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  {state === 'success' ? '✅' : state === 'error' ? '❌' : action.icon}
                </motion.span>
              )}
            </AnimatePresence>
            <span>{action.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
