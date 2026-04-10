import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ipc } from '@/shared/lib/ipc';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useToastStore } from '@shared/stores/toastStore';
import { useDebugStore } from '@shared/stores/debugStore';
import type { AppConfig } from '@/shared/types/config';

export function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [newApiKeyName, setNewApiKeyName] = useState('');

  useEffect(() => {
    ipc.invoke('config:get').then(setConfig).catch(() => {});
  }, []);

  const saveConfig = useCallback(async (partial: Partial<AppConfig>) => {
    setIsSaving(true);
    try {
      await ipc.invoke('config:set', partial);
      const updated = await ipc.invoke('config:get');
      setConfig(updated);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleAddApiKey = useCallback(async () => {
    if (!newApiKey.trim()) return;
    const key = {
      id: `key_${Date.now()}`,
      name: newApiKeyName.trim() || 'Ключ API',
      key: newApiKey.trim(),
      isActive: true,
    };
    const currentKeys = config?.apiKeys ?? [];
    // Deactivate others
    const updatedKeys = currentKeys.map((k) => ({ ...k, isActive: false }));
    await saveConfig({ apiKeys: [...updatedKeys, key] });
    setNewApiKey('');
    setNewApiKeyName('');
  }, [newApiKey, newApiKeyName, config, saveConfig]);

  const handleRemoveApiKey = useCallback(async (id: string) => {
    const currentKeys = config?.apiKeys ?? [];
    const remaining = currentKeys.filter((k) => k.id !== id);
    // Activate first remaining if none active
    if (remaining.length > 0 && !remaining.some((k) => k.isActive)) {
      remaining[0].isActive = true;
    }
    await saveConfig({ apiKeys: remaining });
  }, [config, saveConfig]);

  const handleSetActiveKey = useCallback(async (id: string) => {
    const currentKeys = config?.apiKeys ?? [];
    const updated = currentKeys.map((k) => ({ ...k, isActive: k.id === id }));
    await saveConfig({ apiKeys: updated });
  }, [config, saveConfig]);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-aurora-blue/30 border-t-aurora-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto max-w-2xl">
      <h2 className="text-lg font-medium text-text-primary">Настройки</h2>

      {/* API Keys */}
      <GlassPanel>
        <h3 className="text-sm font-medium text-text-primary mb-3">API ключи OpenRouter</h3>

        {/* Existing keys */}
        <div className="flex flex-col gap-2 mb-3">
          {config.apiKeys.map((key) => (
            <div key={key.id} className="flex items-center gap-2 text-xs">
              <button
                onClick={() => handleSetActiveKey(key.id)}
                className={`w-4 h-4 rounded-full border-2 cursor-pointer ${
                  key.isActive
                    ? 'border-aurora-blue bg-aurora-blue'
                    : 'border-glass-border'
                }`}
              />
              <span className="text-text-secondary flex-1">{key.name}</span>
              <span className="text-text-tertiary font-mono">
                {key.key.slice(0, 8)}...{key.key.slice(-4)}
              </span>
              <button
                onClick={() => handleRemoveApiKey(key.id)}
                className="text-text-tertiary hover:text-status-error cursor-pointer"
              >
                ✕
              </button>
            </div>
          ))}

          {config.apiKeys.length === 0 && (
            <div className="text-xs text-text-tertiary">
              Нет добавленных ключей
            </div>
          )}
        </div>

        {/* Add new key */}
        <div className="flex flex-col gap-2 border-t border-glass-border pt-3">
          <div className="flex gap-2">
            <input
              value={newApiKeyName}
              onChange={(e) => setNewApiKeyName(e.target.value)}
              placeholder="Название (напр. Основной)"
              className="flex-1 bg-bg-tertiary text-text-primary text-xs rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              placeholder="sk-or-..."
              type="password"
              className="flex-1 bg-bg-tertiary text-text-primary text-xs rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50 font-mono"
            />
            <button
              onClick={handleAddApiKey}
              disabled={!newApiKey.trim()}
              className="px-3 py-2 rounded-lg bg-aurora-blue/20 text-aurora-blue text-xs font-medium cursor-pointer hover:bg-aurora-blue/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Добавить
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* Budget Settings */}
      <GlassPanel>
        <h3 className="text-sm font-medium text-text-primary mb-3">Бюджет</h3>
        <div className="grid grid-cols-3 gap-3">
          <BudgetInput
            label="Дневной ($)"
            onChange={(val) => ipc.invoke('cost:set-budget', { daily_limit: val })}
          />
          <BudgetInput
            label="Недельный ($)"
            onChange={(val) => ipc.invoke('cost:set-budget', { weekly_limit: val })}
          />
          <BudgetInput
            label="Месячный ($)"
            onChange={(val) => ipc.invoke('cost:set-budget', { monthly_limit: val })}
          />
        </div>
      </GlassPanel>

      {/* Prompt Assistant */}
      <GlassPanel>
        <h3 className="text-sm font-medium text-text-primary mb-3">Промпт-ассистент</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary">Автоперевод RU → EN</div>
            <div className="text-[10px] text-text-tertiary">
              Автоматически переводит русский промпт через Gemini
            </div>
          </div>
          <ToggleSwitch
            checked={config.promptAssistant.autoTranslate}
            onChange={(val) => saveConfig({ promptAssistant: { ...config.promptAssistant, autoTranslate: val } })}
          />
        </div>
      </GlassPanel>

      {/* Export */}
      <GlassPanel>
        <h3 className="text-sm font-medium text-text-primary mb-3">Экспорт</h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Формат по умолчанию</span>
            <select
              value={config.export.defaultFormat}
              onChange={(e) => saveConfig({ export: { ...config.export, defaultFormat: e.target.value as 'png' | 'jpeg' | 'webp' } })}
              className="bg-bg-tertiary text-text-primary text-xs rounded-lg px-2 py-1 outline-none border border-glass-border cursor-pointer"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Встраивать метаданные</span>
            <ToggleSwitch
              checked={config.export.embedMetadata}
              onChange={(val) => saveConfig({ export: { ...config.export, embedMetadata: val } })}
            />
          </div>
        </div>
      </GlassPanel>

      {/* Benchmark & Reset — dev only, hidden from users */}
      {/* <BenchmarkSection /> */}

      {/* App Info */}
      <GlassPanel>
        <h3 className="text-sm font-medium text-text-primary mb-3">О приложении</h3>
        <div className="flex flex-col gap-1 text-xs text-text-secondary">
          <div className="flex justify-between">
            <span>Версия</span>
            <AppVersion />
          </div>
          <div className="flex justify-between items-start">
            <span>Хранилище</span>
            <div className="flex items-center gap-2">
              <span className="text-text-tertiary truncate max-w-[40%] text-right text-[10px]">{config.storage.imagesPath}</span>
              <button
                onClick={async () => {
                  const folder = await ipc.invoke('file:select-folder');
                  if (folder) {
                    const oldPath = config.storage.imagesPath;
                    await ipc.invoke('storage:migrate-paths', oldPath, folder);
                    await saveConfig({ storage: { ...config.storage, imagesPath: folder } });
                  }
                }}
                className="text-[10px] text-aurora-blue hover:text-aurora-purple cursor-pointer shrink-0"
              >
                Изменить
              </button>
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* Save indicator */}
      {isSaving && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 glass-panel px-4 py-2 text-xs text-aurora-blue"
        >
          Сохранение...
        </motion.div>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${
        checked ? 'bg-aurora-blue' : 'bg-glass-active'
      }`}
    >
      <motion.div
        animate={{ x: checked ? 16 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="w-4 h-4 rounded-full bg-white absolute top-0.5"
      />
    </button>
  );
}

function BudgetInput({ label, value, onChange }: { label: string; value?: number; onChange: (val: number | null) => void }) {
  const [localValue, setLocalValue] = useState(value?.toString() ?? '');

  return (
    <div>
      <label className="text-[10px] text-text-tertiary mb-1 block">{label}</label>
      <input
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => { const n = parseFloat(localValue); onChange(!isNaN(n) && n >= 0 ? n : null); }}
        placeholder="Без лимита"
        className="w-full bg-bg-tertiary text-text-primary text-xs rounded-lg px-2 py-1.5 outline-none border border-glass-border focus:border-aurora-blue/50"
      />
    </div>
  );
}

function AppVersion() {
  const [version, setVersion] = useState('...');
  const debugEnabled = useDebugStore((s) => s.enabled);
  const setDebugEnabled = useDebugStore((s) => s.setEnabled);
  const clickCountRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    ipc.invoke('app:get-version').then(setVersion).catch(() => setVersion('—'));
  }, []);

  const handleClick = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    clickCountRef.current += 1;

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      const newState = !debugEnabled;
      setDebugEnabled(newState);
      ipc.invoke('debug:set-enabled', newState);
      addToast({
        message: newState ? 'Режим разработчика активирован' : 'Режим разработчика деактивирован',
        type: newState ? 'success' : 'info',
      });
    } else {
      resetTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, 2000);
    }
  }, [debugEnabled, setDebugEnabled, addToast]);

  return (
    <span
      className="text-text-tertiary cursor-default select-none"
      onClick={handleClick}
    >
      {version}
    </span>
  );
}

// @ts-ignore: kept for dev use, commented out in render
function BenchmarkSection() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; modelName: string } | null>(null);
  const [reportPath, setReportPath] = useState<string | null>(null);

  const BENCHMARK_PROMPT = 'Cinematic action shot on a vibrant, alien battlefield with bioluminescent flora and jagged obsidian rock formations. A massive, gritty polar bear standing upright, wearing a bulky, weathered industrial-grade space suit with glowing blue seals and cracked glass plating, dual-wielding futuristic plasma blasters that fire streaks of neon orange energy. The polar bear is locked in a fierce firefight against a swarm of grotesque, amphibious alien creatures—bipedal, humanoid-sized predatory fish with slick iridescent scales, protruding glowing eyes, and sharp spindly legs, emerging from a thick, purple-tinted alien mist. Dynamic composition with debris flying, explosions of ionized gas, and sparks hitting the bear\'s suit. Dramatic high-contrast lighting, deep shadows, cinematic depth of field, hyper-realistic textures, 8k resolution, sci-fi epic aesthetic, intricate mechanical details, intense atmosphere.';

  useEffect(() => {
    const unsub = ipc.on('benchmark:progress', (data) => {
      setProgress(data as { current: number; total: number; modelName: string });
    });
    return unsub;
  }, []);

  const handleRunBenchmark = async () => {
    setIsRunning(true);
    setReportPath(null);
    try {
      const result = await ipc.invoke('benchmark:run', BENCHMARK_PROMPT);
      setReportPath((result as { reportPath: string }).reportPath);
    } catch (err) {
      console.error('Benchmark failed:', err);
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const handleResetAnalytics = async () => {
    await ipc.invoke('analytics:reset');
  };

  return (
    <GlassPanel>
      <h3 className="text-sm font-medium text-text-primary mb-3">Инструменты</h3>
      <div className="flex flex-col gap-3">
        {/* Reset analytics */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary">Сбросить аналитику</div>
            <div className="text-[10px] text-text-tertiary">Очистить все данные о расходах</div>
          </div>
          <button
            onClick={handleResetAnalytics}
            className="px-3 py-1.5 rounded-lg text-xs text-status-error hover:bg-status-error/10 border border-status-error/20 cursor-pointer transition-colors"
          >
            Сбросить
          </button>
        </div>

        <div className="border-t border-glass-border" />

        {/* Benchmark */}
        <div className="flex flex-col gap-2">
          <div>
            <div className="text-xs text-text-secondary">Бенчмарк моделей</div>
            <div className="text-[10px] text-text-tertiary">
              Прогнать промпт по всем 13 моделям, собрать реальные цены и время генерации. Отчёт сохранится на рабочий стол.
            </div>
          </div>

          {isRunning && progress && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-aurora-purple">{progress.modelName}</span>
                <span className="text-text-tertiary">{progress.current}/{progress.total}</span>
              </div>
              <div className="h-1 bg-glass-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-aurora-blue to-aurora-purple rounded-full transition-all duration-500"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {reportPath && (
            <div className="text-[10px] text-aurora-blue">
              Отчёт сохранён: {reportPath}
            </div>
          )}

          <button
            onClick={handleRunBenchmark}
            disabled={isRunning}
            className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              isRunning
                ? 'bg-glass text-text-tertiary cursor-not-allowed'
                : 'bg-aurora-purple/15 text-aurora-purple hover:bg-aurora-purple/25 border border-aurora-purple/25'
            }`}
          >
            {isRunning ? `Генерация ${progress?.current ?? 0}/${progress?.total ?? 13}...` : 'Запустить бенчмарк'}
          </button>
        </div>
      </div>
    </GlassPanel>
  );
}
