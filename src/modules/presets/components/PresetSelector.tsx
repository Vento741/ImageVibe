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

/** 8 built-in presets — used as defaults when DB is empty */
const BUILTIN_PRESETS = [
  { name: 'Быстрый черновик', icon: 'zap', modelId: 'black-forest-labs/flux.2-klein-4b', styleTags: [], negativePrompt: '' },
  { name: 'Фотопортрет', icon: 'camera', modelId: 'black-forest-labs/flux.2-pro', styleTags: ['photorealistic', 'sharp focus'], negativePrompt: 'blurry, cartoon, deformed' },
  { name: 'Аниме персонаж', icon: 'swords', modelId: 'bytedance-seed/seedream-4.5', styleTags: ['anime', 'vibrant'], negativePrompt: 'photorealistic, 3d render' },
  { name: 'Концепт-арт', icon: 'paintbrush', modelId: 'black-forest-labs/flux.2-max', styleTags: ['concept art', 'highly detailed'], negativePrompt: 'photo, realistic' },
  { name: 'Типографика', icon: 'type', modelId: 'black-forest-labs/flux.2-flex', styleTags: ['clean text'], negativePrompt: 'blurry text' },
  { name: 'Продуктовое фото', icon: 'shopping-bag', modelId: 'google/gemini-3-pro-image-preview', styleTags: ['professional'], negativePrompt: 'cluttered background' },
  { name: 'Умная генерация', icon: 'brain', modelId: 'openai/gpt-5-image-mini', styleTags: [], negativePrompt: '' },
  { name: 'Бюджетный', icon: 'coins', modelId: 'google/gemini-3.1-flash-image-preview', styleTags: [], negativePrompt: '' },
];

export function PresetSelector() {
  const presets = usePresetsStore((s) => s.presets);
  const setPresets = usePresetsStore((s) => s.setPresets);
  const setSelectedModelId = useGenerateStore((s) => s.setSelectedModelId);
  const setStyleTags = useGenerateStore((s) => s.setStyleTags);
  const setNegativePrompt = useGenerateStore((s) => s.setNegativePrompt);

  // Load presets on mount
  useEffect(() => {
    const builtinFallback = () =>
      BUILTIN_PRESETS.map((p, i) => ({
        id: -(i + 1),
        name: p.name,
        icon: p.icon,
        model_id: p.modelId,
        params: JSON.stringify({ aspectRatio: '1:1', imageSize: '1K' }),
        style_tags: JSON.stringify(p.styleTags),
        negative_prompt: p.negativePrompt,
        is_builtin: 1,
        sort_order: i,
        created_at: new Date().toISOString(),
      }));

    ipc.invoke('presets:list').then((loaded) => {
      setPresets(loaded.length > 0 ? loaded : builtinFallback());
    }).catch(() => {
      setPresets(builtinFallback());
    });
  }, [setPresets]);

  const applyPreset = useCallback((preset: typeof presets[0]) => {
    if (preset.model_id) setSelectedModelId(preset.model_id);

    try {
      const tags = JSON.parse(preset.style_tags || '[]') as string[];
      setStyleTags(tags);
    } catch {
      setStyleTags([]);
    }

    setNegativePrompt(preset.negative_prompt || '');

    try {
      const params = JSON.parse(preset.params);
      if (params.aspectRatio) {
        useGenerateStore.getState().setAspectRatio(params.aspectRatio);
      }
      if (params.imageSize) {
        useGenerateStore.getState().setImageSize(params.imageSize);
      }
    } catch {
      // ignore parse errors
    }
  }, [setSelectedModelId, setStyleTags, setNegativePrompt]);

  const [isCollapsed, setIsCollapsed] = useState(true);

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
            <div className="flex flex-wrap gap-1.5 pt-1">
              {presets.map((preset) => {
                const tags = (() => { try { return JSON.parse(preset.style_tags || '[]') as string[]; } catch { return []; } })();
                return (
                  <Tooltip
                    key={preset.id}
                    content={
                      <div className="flex flex-col gap-1">
                        <div className="text-text-primary font-medium">{preset.name}</div>
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
                        {preset.negative_prompt && (
                          <div className="text-text-tertiary">
                            Negative: <span className="text-text-secondary truncate">{preset.negative_prompt.slice(0, 50)}</span>
                          </div>
                        )}
                      </div>
                    }
                  >
                    <motion.button
                      onClick={() => applyPreset(preset)}
                      whileTap={{ scale: 0.97 }}
                      className="px-2.5 py-1.5 rounded-md text-xs text-text-secondary hover:bg-glass-hover hover:text-text-primary transition-colors cursor-pointer flex items-center gap-1.5 border border-transparent hover:border-glass-border"
                    >
                      <span className="flex items-center">{renderPresetIcon(preset.icon)}</span>
                      <span>{preset.name}</span>
                    </motion.button>
                  </Tooltip>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
