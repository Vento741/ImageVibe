import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Camera, Swords, Paintbrush, Type, ShoppingBag, Brain, Coins } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePresetsStore } from '../store';
import { useGenerateStore } from '@/modules/generate/store';
import { ipc } from '@/shared/lib/ipc';
import { Tooltip } from '@/shared/components/ui/Tooltip';
import { getModelShortName } from '@/shared/lib/utils';

/** Maps an icon key string to a Lucide React icon. Falls back to the raw string. */
function renderPresetIcon(iconStr: string): ReactNode {
  const iconMap: Record<string, ReactNode> = {
    zap: <Zap size={14} />,
    camera: <Camera size={14} />,
    swords: <Swords size={14} />,
    paintbrush: <Paintbrush size={14} />,
    type: <Type size={14} />,
    'shopping-bag': <ShoppingBag size={14} />,
    brain: <Brain size={14} />,
    coins: <Coins size={14} />,
    // Emoji fallbacks for presets loaded from DB that still use emoji strings
    '⚡': <Zap size={14} />,
    '📸': <Camera size={14} />,
    '🎌': <Swords size={14} />,
    '🎨': <Paintbrush size={14} />,
    '🔤': <Type size={14} />,
    '🛍': <ShoppingBag size={14} />,
    '🧠': <Brain size={14} />,
    '💰': <Coins size={14} />,
  };
  return iconMap[iconStr] ?? <span>{iconStr}</span>;
}

export function PresetSelector() {
  const presets = usePresetsStore((s) => s.presets);
  const setPresets = usePresetsStore((s) => s.setPresets);
  const setSelectedModelId = useGenerateStore((s) => s.setSelectedModelId);
  const setStyleTags = useGenerateStore((s) => s.setStyleTags);
  // Keyed separately from the store (which is typed DBPreset[]) so the extra
  // availability field from presets:list doesn't have to leak into that type.
  const [availability, setAvailability] = useState<Record<number, boolean | null>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load presets on mount, then again on every catalog:updated — the catalog is still
  // loading (or not even started) on a typical cold start, so the first load almost always
  // sees every model as unknown; without this the availability flag freezes at that
  // snapshot forever. Same pattern as ParamsPanel.tsx and GenerateButton.tsx.
  useEffect(() => {
    const load = () => {
      ipc.invoke('presets:list').then((loaded) => {
        setPresets(loaded);
        setAvailability(Object.fromEntries(loaded.map((p) => [p.id, p.modelAvailable])));
        setLoadError(null);
      }).catch(() => {
        setPresets([]);
        setAvailability({});
        setLoadError('Не удалось загрузить пресеты.');
      });
    };
    load();
    return ipc.on('catalog:updated', load);
  }, [setPresets]);

  const applyPreset = useCallback((preset: typeof presets[0]) => {
    // A preset whose model is confirmed gone from the catalog (modelAvailable === false)
    // must not silently send a generation request to a model id that no longer exists.
    const isUnavailable = availability[preset.id] === false;
    if (preset.model_id && !isUnavailable) setSelectedModelId(preset.model_id);

    try {
      const tags = JSON.parse(preset.style_tags || '[]') as string[];
      setStyleTags(tags);
    } catch {
      setStyleTags([]);
    }

    try {
      const params = JSON.parse(preset.params);
      // Stored presets may still carry the pre-schema field names (aspectRatio/imageSize);
      // builtin presets are migrated to protocol names (aspect_ratio/resolution), so both
      // spellings are read here until every stored preset has been rewritten.
      const aspectRatio = params.aspect_ratio ?? params.aspectRatio;
      const resolution = params.resolution ?? params.imageSize;
      if (aspectRatio) useGenerateStore.getState().setParam('aspect_ratio', aspectRatio);
      if (resolution) useGenerateStore.getState().setParam('resolution', resolution);
    } catch {
      // ignore parse errors
    }
  }, [setSelectedModelId, setStyleTags, availability]);

  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activePresetId, setActivePresetId] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-1.5 glass-panel p-3 rounded-lg">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between cursor-pointer w-full"
      >
        <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider cursor-pointer">
          Пресеты
        </label>
        <span className={`text-text-tertiary text-xs transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>
          ▼
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {presets.length === 0 ? (
              <div className="text-xs text-text-tertiary rounded-lg border border-glass-border bg-bg-tertiary px-3 py-2 mt-1">
                {loadError ?? 'Пресетов нет.'}
              </div>
            ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {presets.map((preset) => {
                const tags = (() => { try { return JSON.parse(preset.style_tags || '[]') as string[]; } catch { return []; } })();
                const isUnavailable = availability[preset.id] === false;
                return (
                  <Tooltip
                    key={preset.id}
                    content={
                      <div className="flex flex-col gap-1">
                        <div className="text-text-primary font-medium">{preset.name}</div>
                        {isUnavailable && (
                          <div className="text-status-error">
                            Модель недоступна: её больше нет в каталоге OpenRouter
                          </div>
                        )}
                        {preset.model_id && (
                          <div className="text-text-tertiary">
                            Модель: <span className="text-text-secondary">{getModelShortName(preset.model_id)}</span>
                          </div>
                        )}
                        {tags.length > 0 && (
                          <div className="text-text-tertiary">
                            Стили: <span className="text-text-secondary">{tags.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    }
                  >
                    <motion.button
                      onClick={() => { applyPreset(preset); setActivePresetId(preset.id); }}
                      whileTap={{ scale: 0.97 }}
                      className={`px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer flex items-center gap-1.5 border ${
                        isUnavailable
                          ? 'text-text-tertiary/60 border-transparent opacity-60'
                          : activePresetId === preset.id
                            ? 'bg-aurora-blue/15 text-aurora-blue border-aurora-blue/30'
                            : 'text-text-secondary hover:bg-glass-hover hover:text-text-primary border-transparent hover:border-glass-border'
                      }`}
                    >
                      <span className="flex items-center">{renderPresetIcon(preset.icon)}</span>
                      <span>{preset.name}</span>
                      {isUnavailable && <span className="text-status-error">⚠</span>}
                    </motion.button>
                  </Tooltip>
                );
              })}
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
