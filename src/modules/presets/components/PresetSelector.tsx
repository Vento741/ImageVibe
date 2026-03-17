import { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { usePresetsStore } from '../store';
import { useGenerateStore } from '@/modules/generate/store';
import { ipc } from '@/shared/lib/ipc';

/** 8 built-in presets — used as defaults when DB is empty */
const BUILTIN_PRESETS = [
  { name: 'Быстрый черновик', icon: '⚡', modelId: 'black-forest-labs/flux.2-klein-4b', styleTags: [], negativePrompt: '' },
  { name: 'Фотопортрет', icon: '📸', modelId: 'black-forest-labs/flux.2-pro', styleTags: ['photorealistic', 'sharp focus'], negativePrompt: 'blurry, cartoon, deformed' },
  { name: 'Аниме персонаж', icon: '🎌', modelId: 'bytedance-seed/seedream-4.5', styleTags: ['anime', 'vibrant'], negativePrompt: 'photorealistic, 3d render' },
  { name: 'Концепт-арт', icon: '🎨', modelId: 'black-forest-labs/flux.2-max', styleTags: ['concept art', 'highly detailed'], negativePrompt: 'photo, realistic' },
  { name: 'Типографика', icon: '🔤', modelId: 'black-forest-labs/flux.2-flex', styleTags: ['clean text'], negativePrompt: 'blurry text' },
  { name: 'Продуктовое фото', icon: '🛍', modelId: 'google/gemini-3-pro-image-preview', styleTags: ['professional'], negativePrompt: 'cluttered background' },
  { name: 'Умная генерация', icon: '🧠', modelId: 'openai/gpt-5-image-mini', styleTags: [], negativePrompt: '' },
  { name: 'Бюджетный', icon: '💰', modelId: 'google/gemini-3.1-flash-image-preview', styleTags: [], negativePrompt: '' },
];

export function PresetSelector() {
  const presets = usePresetsStore((s) => s.presets);
  const setPresets = usePresetsStore((s) => s.setPresets);
  const setSelectedModelId = useGenerateStore((s) => s.setSelectedModelId);
  const setStyleTags = useGenerateStore((s) => s.setStyleTags);
  const setNegativePrompt = useGenerateStore((s) => s.setNegativePrompt);

  // Load presets on mount
  useEffect(() => {
    ipc.invoke('presets:list').then((loaded) => {
      if (loaded.length === 0) {
        // Use builtins as display-only
        setPresets(BUILTIN_PRESETS.map((p, i) => ({
          id: -(i + 1), // negative IDs for builtins
          name: p.name,
          icon: p.icon,
          model_id: p.modelId,
          params: JSON.stringify({ aspectRatio: '1:1', imageSize: '1K' }),
          style_tags: JSON.stringify(p.styleTags),
          negative_prompt: p.negativePrompt,
          is_builtin: 1,
          sort_order: i,
          created_at: new Date().toISOString(),
        })));
      } else {
        setPresets(loaded);
      }
    }).catch(() => {
      // Fallback to builtins
      setPresets(BUILTIN_PRESETS.map((p, i) => ({
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
      })));
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

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider">
        Пресеты
      </label>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <motion.button
            key={preset.id}
            onClick={() => applyPreset(preset)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-2 py-1 rounded-md text-xs text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer flex items-center gap-1 border border-transparent hover:border-glass-border"
            title={preset.name}
          >
            <span>{preset.icon}</span>
            <span>{preset.name}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
