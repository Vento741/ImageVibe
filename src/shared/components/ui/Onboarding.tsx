import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, FolderOpen, Key, ArrowRight, Check } from 'lucide-react';
import { ipc } from '@/shared/lib/ipc';
import type { AppConfig } from '@/shared/types/config';

type Step = 'welcome' | 'folder' | 'apikey';

export function Onboarding() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    ipc.invoke('config:get').then((config: AppConfig) => {
      if (config.apiKeys.length === 0) {
        setIsOpen(true);
        setFolderPath(config.storage.imagesPath || '');
      }
    }).catch(() => {});
  }, []);

  const handleSelectFolder = async () => {
    const selected = await ipc.invoke('file:select-folder');
    if (selected) {
      setFolderPath(selected as string);
    }
  };

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      const updates: Partial<AppConfig> = {};
      if (apiKey.trim()) {
        updates.apiKeys = [{
          id: 'key_1',
          name: 'Основной',
          key: apiKey.trim(),
          isActive: true,
        }];
      }
      if (folderPath) {
        updates.storage = { imagesPath: folderPath };
      }
      await ipc.invoke('config:set', updates);
      setIsOpen(false);
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  const stepIndex = step === 'welcome' ? 0 : step === 'folder' ? 1 : 2;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="glass-panel p-8 w-[420px] flex flex-col items-center gap-6 relative overflow-hidden"
          >
            {/* Progress dots */}
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i <= stepIndex
                      ? 'w-8 bg-gradient-to-r from-aurora-blue to-aurora-purple'
                      : 'w-4 bg-glass-border'
                  }`}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              {/* Step 1: Welcome */}
              {step === 'welcome' && (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col items-center gap-5 w-full"
                >
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-aurora-blue/20 to-aurora-purple/20 flex items-center justify-center">
                    <Sparkles size={36} className="text-aurora-blue" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-text-primary">
                      Добро пожаловать в ImageVibe
                    </h2>
                    <p className="text-sm text-text-secondary mt-3 leading-relaxed">
                      Генерируйте изображения с помощью 13 AI-моделей
                      в одном красивом приложении.
                    </p>
                    <p className="text-xs text-text-tertiary mt-2">
                      Настроим всё за пару шагов
                    </p>
                  </div>
                  <button
                    onClick={() => setStep('folder')}
                    className="w-full py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-aurora-blue to-aurora-purple text-white cursor-pointer flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-aurora-blue/25 transition-shadow"
                  >
                    Начать
                    <ArrowRight size={16} />
                  </button>
                </motion.div>
              )}

              {/* Step 2: Folder */}
              {step === 'folder' && (
                <motion.div
                  key="folder"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col items-center gap-5 w-full"
                >
                  <div className="w-16 h-16 rounded-2xl bg-aurora-purple/10 flex items-center justify-center">
                    <FolderOpen size={28} className="text-aurora-purple" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-text-primary">
                      Куда сохранять изображения?
                    </h2>
                    <p className="text-xs text-text-tertiary mt-1.5">
                      Выберите папку для сгенерированных изображений
                    </p>
                  </div>

                  <div className="w-full flex flex-col gap-2">
                    <button
                      onClick={handleSelectFolder}
                      className="w-full py-3 px-4 rounded-lg border border-dashed border-glass-border hover:border-aurora-purple/50 bg-bg-tertiary/50 text-left transition-colors cursor-pointer flex items-center gap-3"
                    >
                      <FolderOpen size={18} className="text-text-tertiary shrink-0" />
                      {folderPath ? (
                        <span className="text-sm text-text-primary truncate">{folderPath}</span>
                      ) : (
                        <span className="text-sm text-text-tertiary">Выбрать папку...</span>
                      )}
                    </button>
                    {folderPath && (
                      <p className="text-[10px] text-aurora-purple flex items-center gap-1">
                        <Check size={10} /> Папка выбрана
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setStep('apikey')}
                      className="flex-1 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
                    >
                      Пропустить
                    </button>
                    <button
                      onClick={() => setStep('apikey')}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-aurora-blue to-aurora-purple text-white cursor-pointer flex items-center justify-center gap-2"
                    >
                      Далее
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: API Key */}
              {step === 'apikey' && (
                <motion.div
                  key="apikey"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col items-center gap-5 w-full"
                >
                  <div className="w-16 h-16 rounded-2xl bg-aurora-blue/10 flex items-center justify-center">
                    <Key size={28} className="text-aurora-blue" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-text-primary">
                      API ключ OpenRouter
                    </h2>
                    <p className="text-xs text-text-tertiary mt-1.5">
                      Нужен для генерации изображений
                    </p>
                  </div>

                  <div className="w-full flex flex-col gap-2">
                    <input
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && apiKey.trim() && handleFinish()}
                      placeholder="sk-or-..."
                      type="password"
                      autoFocus
                      className="w-full bg-bg-tertiary text-text-primary text-sm rounded-lg px-4 py-3 outline-none border border-glass-border focus:border-aurora-blue/50 font-mono"
                    />
                    <p className="text-[10px] text-text-tertiary">
                      Получите ключ на{' '}
                      <span className="text-aurora-blue">openrouter.ai/keys</span>
                    </p>
                  </div>

                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setStep('folder')}
                      className="flex-1 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
                    >
                      Назад
                    </button>
                    <button
                      onClick={handleFinish}
                      disabled={!apiKey.trim() || isSaving}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-aurora-blue to-aurora-purple text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSaving ? 'Сохранение...' : (
                        <>
                          <Check size={14} />
                          Готово
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
