import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ipc } from '@/shared/lib/ipc';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useToastStore } from '@shared/stores/toastStore';
import { useDebugStore } from '@shared/stores/debugStore';
import type { ApiProvider, AppConfig } from '@/shared/types/config';

export function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [newKieKey, setNewKieKey] = useState('');

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

  const handleAddApiKey = useCallback(async (provider: ApiProvider) => {
    const value = provider === 'kie' ? newKieKey : newApiKey;
    if (!value.trim()) return;
    const key = {
      id: `key_${Date.now()}`,
      name: provider === 'kie' ? 'Ключ kie.ai' : 'Ключ OpenRouter',
      key: value.trim(),
      isActive: true,
      provider,
    };
    const currentKeys = config?.apiKeys ?? [];
    // Активен один ключ на поставщика: ключи другого поставщика не трогаются
    const updatedKeys = currentKeys.map((k) =>
      (k.provider ?? 'openrouter') === provider ? { ...k, isActive: false } : k,
    );
    await saveConfig({ apiKeys: [...updatedKeys, key] });
    if (provider === 'kie') setNewKieKey('');
    else setNewApiKey('');
  }, [newApiKey, newKieKey, config, saveConfig]);

  const handleRemoveApiKey = useCallback(async (id: string) => {
    const currentKeys = config?.apiKeys ?? [];
    const removed = currentKeys.find((k) => k.id === id);
    const remaining = currentKeys.filter((k) => k.id !== id);
    // Активным делается оставшийся ключ того же поставщика, а не первый попавшийся
    const provider = removed?.provider ?? 'openrouter';
    const sameProvider = remaining.filter((k) => (k.provider ?? 'openrouter') === provider);
    if (sameProvider.length > 0 && !sameProvider.some((k) => k.isActive)) {
      sameProvider[0].isActive = true;
    }
    await saveConfig({ apiKeys: remaining });
  }, [config, saveConfig]);

  const handleSetActiveKey = useCallback(async (id: string) => {
    const currentKeys = config?.apiKeys ?? [];
    const target = currentKeys.find((k) => k.id === id);
    const provider = target?.provider ?? 'openrouter';
    const updated = currentKeys.map((k) =>
      (k.provider ?? 'openrouter') === provider ? { ...k, isActive: k.id === id } : k,
    );
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

      {/* Ключ kie.ai — им идёт вся генерация изображений и видео */}
      <KeyPanel
        title="Ключ kie.ai"
        note="Через него идёт генерация изображений и видео. Без него приложение не генерирует."
        placeholder="Ключ с kie.ai/api-key"
        provider="kie"
        keys={config.apiKeys.filter((k) => k.provider === 'kie')}
        value={newKieKey}
        onChange={setNewKieKey}
        onAdd={handleAddApiKey}
        onRemove={handleRemoveApiKey}
        onActivate={handleSetActiveKey}
      />

      {/* Ключ OpenRouter — только текст */}
      <KeyPanel
        title="Ключ OpenRouter"
        note="Нужен только для перевода промпта и ассистента промпта. Без него генерация работает, не работают перевод и подсказки."
        placeholder="sk-or-..."
        provider="openrouter"
        keys={config.apiKeys.filter((k) => (k.provider ?? 'openrouter') === 'openrouter')}
        value={newApiKey}
        onChange={setNewApiKey}
        onAdd={handleAddApiKey}
        onRemove={handleRemoveApiKey}
        onActivate={handleSetActiveKey}
      />

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


interface KeyPanelProps {
  title: string;
  note: string;
  placeholder: string;
  provider: ApiProvider;
  keys: AppConfig['apiKeys'];
  value: string;
  onChange: (value: string) => void;
  onAdd: (provider: ApiProvider) => void;
  onRemove: (id: string) => void;
  onActivate: (id: string) => void;
}

/** Панель ключей одного поставщика. Два поставщика — две панели, ключи не смешиваются. */
function KeyPanel({
  title, note, placeholder, provider, keys, value, onChange, onAdd, onRemove, onActivate,
}: KeyPanelProps) {
  return (
    <GlassPanel>
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      <p className="text-[11px] text-text-tertiary mb-3">{note}</p>

      <div className="flex flex-col gap-2 mb-3">
        {keys.map((key) => (
          <div key={key.id} className="flex items-center gap-2 text-xs">
            <button
              onClick={() => onActivate(key.id)}
              className={`w-4 h-4 rounded-full border-2 cursor-pointer ${
                key.isActive ? 'border-aurora-blue bg-aurora-blue' : 'border-glass-border'
              }`}
            />
            <span className="text-text-secondary flex-1">{key.name}</span>
            <span className="text-text-tertiary font-mono">
              {key.key.slice(0, 8)}...{key.key.slice(-4)}
            </span>
            <button
              onClick={() => onRemove(key.id)}
              className="text-text-tertiary hover:text-status-error cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}

        {keys.length === 0 && <div className="text-xs text-text-tertiary">Ключ не задан</div>}
      </div>

      <div className="flex gap-2 border-t border-glass-border pt-3">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type="password"
          className="flex-1 bg-bg-tertiary text-text-primary text-xs rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50 font-mono"
        />
        <button
          onClick={() => onAdd(provider)}
          disabled={!value.trim()}
          className="px-3 py-2 rounded-lg bg-aurora-blue/20 text-aurora-blue text-xs font-medium cursor-pointer hover:bg-aurora-blue/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Добавить
        </button>
      </div>
    </GlassPanel>
  );
}
