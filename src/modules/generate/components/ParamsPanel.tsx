import { Zap, Paintbrush, Brain, Shuffle } from 'lucide-react';
import type { ComponentType } from 'react';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import type { ModelCategory, AspectRatio, ImageSize } from '@/shared/types/models';

const CATEGORIES: Array<{ id: ModelCategory; name: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'fast', name: 'Быстрые', icon: Zap },
  { id: 'quality', name: 'Качественные', icon: Paintbrush },
  { id: 'smart', name: 'Умные', icon: Brain },
];

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
const IMAGE_SIZES: ImageSize[] = ['1K', '2K', '4K'];

// Simplified model list — actual data comes from modelRegistry via IPC
const MODELS_BY_CATEGORY: Record<ModelCategory, Array<{ id: string; name: string }>> = {
  fast: [
    { id: 'black-forest-labs/flux.2-klein-4b', name: 'FLUX.2 Klein' },
    { id: 'sourceful/riverflow-v2-fast', name: 'Riverflow V2 Fast' },
    { id: 'google/gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash' },
    { id: 'google/gemini-2.5-flash-image', name: 'Gemini 2.5 Flash' },
  ],
  quality: [
    { id: 'black-forest-labs/flux.2-pro', name: 'FLUX.2 Pro' },
    { id: 'black-forest-labs/flux.2-max', name: 'FLUX.2 Max' },
    { id: 'black-forest-labs/flux.2-flex', name: 'FLUX.2 Flex' },
    { id: 'bytedance-seed/seedream-4.5', name: 'Seedream 4.5' },
    { id: 'sourceful/riverflow-v2-pro', name: 'Riverflow V2 Pro' },
    { id: 'sourceful/riverflow-v2-max-preview', name: 'Riverflow V2 Max' },
  ],
  smart: [
    { id: 'google/gemini-3-pro-image-preview', name: 'Gemini 3 Pro' },
    { id: 'openai/gpt-5-image', name: 'GPT-5 Image' },
    { id: 'openai/gpt-5-image-mini', name: 'GPT-5 Image Mini' },
  ],
};

// Supports map derived from modelRegistry — embedded here to avoid synchronous IPC calls
const MODEL_SUPPORTS: Record<string, { seed: boolean; negativePrompt: boolean; imageSize: boolean; fontInputs: boolean; superResolution: boolean }> = {
  'black-forest-labs/flux.2-klein-4b': { seed: true, negativePrompt: false, imageSize: true, fontInputs: false, superResolution: false },
  'black-forest-labs/flux.2-pro': { seed: true, negativePrompt: false, imageSize: true, fontInputs: false, superResolution: false },
  'black-forest-labs/flux.2-max': { seed: true, negativePrompt: false, imageSize: true, fontInputs: false, superResolution: false },
  'black-forest-labs/flux.2-flex': { seed: true, negativePrompt: false, imageSize: true, fontInputs: false, superResolution: false },
  'bytedance-seed/seedream-4.5': { seed: true, negativePrompt: true, imageSize: true, fontInputs: false, superResolution: false },
  'sourceful/riverflow-v2-pro': { seed: true, negativePrompt: true, imageSize: true, fontInputs: true, superResolution: true },
  'sourceful/riverflow-v2-fast': { seed: true, negativePrompt: true, imageSize: true, fontInputs: true, superResolution: false },
  'sourceful/riverflow-v2-max-preview': { seed: true, negativePrompt: true, imageSize: true, fontInputs: true, superResolution: true },
  'google/gemini-3-pro-image-preview': { seed: true, negativePrompt: false, imageSize: true, fontInputs: false, superResolution: false },
  'google/gemini-3.1-flash-image-preview': { seed: true, negativePrompt: false, imageSize: false, fontInputs: false, superResolution: false },
  'google/gemini-2.5-flash-image': { seed: true, negativePrompt: false, imageSize: false, fontInputs: false, superResolution: false },
  'openai/gpt-5-image': { seed: false, negativePrompt: false, imageSize: true, fontInputs: false, superResolution: false },
  'openai/gpt-5-image-mini': { seed: false, negativePrompt: false, imageSize: true, fontInputs: false, superResolution: false },
};

export function ParamsPanel() {
  const selectedCategory = useGenerateStore((s) => s.selectedCategory);
  const selectedModelId = useGenerateStore((s) => s.selectedModelId);
  const aspectRatio = useGenerateStore((s) => s.aspectRatio);
  const imageSize = useGenerateStore((s) => s.imageSize);
  const seed = useGenerateStore((s) => s.seed);
  const setSelectedCategory = useGenerateStore((s) => s.setSelectedCategory);
  const setSelectedModelId = useGenerateStore((s) => s.setSelectedModelId);
  const setAspectRatio = useGenerateStore((s) => s.setAspectRatio);
  const setImageSize = useGenerateStore((s) => s.setImageSize);
  const setSeed = useGenerateStore((s) => s.setSeed);
  const randomizeSeed = useGenerateStore((s) => s.randomizeSeed);

  const models = MODELS_BY_CATEGORY[selectedCategory] || [];

  const supports = MODEL_SUPPORTS[selectedModelId] ?? { seed: true, negativePrompt: false, imageSize: true, fontInputs: false, superResolution: false };

  return (
    <GlassPanel className="flex flex-col gap-3">
      {/* Category selector */}
      <div>
        <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-2 block">
          Категория
        </label>
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                const firstModel = MODELS_BY_CATEGORY[cat.id]?.[0];
                if (firstModel) setSelectedModelId(firstModel.id);
              }}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                selectedCategory === cat.id
                  ? 'bg-aurora-blue/20 text-aurora-blue border border-aurora-blue/30'
                  : 'text-text-secondary hover:bg-glass-hover border border-transparent'
              }`}
            >
              <cat.icon size={16} />
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Model selector */}
      <div>
        <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 block">
          Модель
        </label>
        <select
          value={selectedModelId}
          onChange={(e) => setSelectedModelId(e.target.value)}
          className="w-full bg-bg-tertiary text-text-primary text-sm rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50 cursor-pointer"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 block">
          Пропорции
        </label>
        <div className="flex flex-wrap gap-1">
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio}
              onClick={() => setAspectRatio(ratio)}
              className={`px-2 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                aspectRatio === ratio
                  ? 'bg-aurora-blue/20 text-aurora-blue'
                  : 'text-text-secondary hover:bg-glass-hover'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* Image Size — only for models that support it */}
      {supports.imageSize && (
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 block">
            Размер
          </label>
          <div className="flex gap-1">
            {IMAGE_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setImageSize(size)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  imageSize === size
                    ? 'bg-aurora-blue/20 text-aurora-blue border border-aurora-blue/30'
                    : 'text-text-secondary hover:bg-glass-hover border border-transparent'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Seed — only for models that support it */}
      {supports.seed && (
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 block">
            Seed
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={seed ?? ''}
              onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : null)}
              placeholder="Случайный"
              className="flex-1 bg-bg-tertiary text-text-primary text-sm rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50"
            />
            <button
              onClick={randomizeSeed}
              className="px-3 py-2 rounded-lg bg-glass-hover text-text-secondary hover:text-text-primary transition-colors text-sm cursor-pointer"
              title="Случайный seed"
            >
              <Shuffle size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Font Inputs — Riverflow only */}
      {supports.fontInputs && (
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 block">
            Шрифт
          </label>
          <input
            type="text"
            placeholder="Arial, Roboto..."
            className="w-full bg-bg-tertiary text-text-primary text-sm rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50"
          />
        </div>
      )}

      {/* Super Resolution — Riverflow only */}
      {supports.superResolution && (
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider">
            Super Resolution
          </label>
          <button
            className="w-9 h-5 rounded-full bg-glass-active transition-colors cursor-pointer relative"
          >
            <div className="w-4 h-4 rounded-full bg-text-primary absolute top-0.5 left-0.5 transition-transform" />
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
