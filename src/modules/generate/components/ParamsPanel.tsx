import { useCallback, useEffect, useState } from 'react';
import { Zap, Paintbrush, Brain, Shuffle } from 'lucide-react';
import type { ComponentType } from 'react';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { ipc } from '@/shared/lib/ipc';
import { useGenerateStore } from '../store';
import type { ModelCategory, AspectRatio, ImageSize, ParamSchema } from '@/shared/types/models';
import type { CatalogModelDTO, CatalogStatusResult } from '@/shared/types/ipc';

// Buckets are computed from price, so the labels name price, not temperament
const CATEGORIES: Array<{ id: ModelCategory; name: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'fast', name: 'Дешёвые', icon: Zap },
  { id: 'quality', name: 'Средние', icon: Paintbrush },
  { id: 'smart', name: 'Дорогие', icon: Brain },
];

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
const IMAGE_SIZES: ImageSize[] = ['1K', '2K', '4K'];

type Group = { category: ModelCategory; models: CatalogModelDTO[] };

/** Allowed values of an enum schema entry, or null when the key is absent or not an enum. */
function enumValuesOf(schema: Record<string, ParamSchema>, key: string): string[] | null {
  const entry = schema[key];
  if (!entry || entry.type !== 'enum') return null;
  return entry.values;
}

/** Short, user-facing reason the model list is empty. */
function catalogMessage(status: CatalogStatusResult | null): string {
  if (!status || status.state === 'loading' || status.state === 'empty') {
    return 'Загрузка каталога моделей…';
  }
  if (status.state === 'error') {
    if (status.error?.includes('ключ не настроен')) {
      return 'Добавьте ключ API OpenRouter в настройках, чтобы увидеть список моделей.';
    }
    return `Не удалось загрузить каталог моделей${status.error ? `: ${status.error}` : ''}.`;
  }
  return 'Каталог моделей пуст.';
}

export function ParamsPanel() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [status, setStatus] = useState<CatalogStatusResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  const load = useCallback(() => {
    Promise.all([ipc.invoke('catalog:list'), ipc.invoke('catalog:status')])
      .then(([loadedGroups, loadedStatus]) => {
        setGroups(loadedGroups);
        setStatus(loadedStatus);
        if (!useGenerateStore.getState().selectedModelId) {
          // The cheapest model with a known price, from the live catalog — never the
          // first element of whatever category happened to be selected at mount time.
          // Left empty (retried on the next catalog:updated) when prices are not in yet.
          ipc.invoke('catalog:default-model').then((id) => {
            if (id) setSelectedModelId(id);
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [setSelectedModelId]);

  useEffect(() => {
    load();
    return ipc.on('catalog:updated', load);
  }, [load]);

  // Before prices arrive every model can end up bucketed into a single category (see
  // bucketByPrice), which may not be the category the store happens to hold. Fall back to
  // the first group that actually exists, rather than leaving the model list empty — this
  // condition goes false as soon as selectedCategory is updated, so it settles in one pass.
  useEffect(() => {
    if (groups.length === 0) return;
    const hasSelectedCategory = groups.some((group) => group.category === selectedCategory);
    if (!hasSelectedCategory) {
      setSelectedCategory(groups[0].category);
    }
  }, [groups, selectedCategory, setSelectedCategory]);

  const models = groups.find((group) => group.category === selectedCategory)?.models ?? [];
  const selected = groups.flatMap((group) => group.models).find((m) => m.id === selectedModelId);
  // Until pricesLoaded, schema is the catalog-record schema — not the cross-provider
  // intersection — and cannot be trusted to build controls (see openrouter-model-registry §5).
  const supportsSeed = selected?.pricesLoaded
    ? Object.prototype.hasOwnProperty.call(selected.schema, 'seed')
    : false;
  const supportsImageSize = selected?.pricesLoaded
    ? Object.prototype.hasOwnProperty.call(selected.schema, 'resolution')
    : false;
  // Aspect ratio has always been offered unconditionally; keep that while the schema isn't
  // trustworthy yet, and hide it only once a loaded schema shows the model has no
  // aspect_ratio parameter at all.
  const supportsAspectRatio = selected?.pricesLoaded
    ? Object.prototype.hasOwnProperty.call(selected.schema, 'aspect_ratio')
    : true;

  // Narrow the closed lists to what this model actually declares (openrouter-model-registry
  // §5/§9): offering a value the model doesn't support sends nothing to the API, and the
  // provider silently falls back to its own default instead of honouring the user's choice.
  const availableAspectRatios = selected?.pricesLoaded && supportsAspectRatio
    ? ASPECT_RATIOS.filter((r) => enumValuesOf(selected.schema, 'aspect_ratio')?.includes(r))
    : ASPECT_RATIOS;
  const availableImageSizes = selected?.pricesLoaded && supportsImageSize
    ? IMAGE_SIZES.filter((s) => enumValuesOf(selected.schema, 'resolution')?.includes(s))
    : IMAGE_SIZES;

  // If narrowing left the value the store was holding unavailable (e.g. it came from a
  // previously selected model), switch to the first value this model actually supports.
  useEffect(() => {
    if (availableAspectRatios.length > 0 && !availableAspectRatios.includes(aspectRatio)) {
      setAspectRatio(availableAspectRatios[0]);
    }
  }, [availableAspectRatios.join('|'), aspectRatio, setAspectRatio]);

  useEffect(() => {
    if (availableImageSizes.length > 0 && !availableImageSizes.includes(imageSize)) {
      setImageSize(availableImageSizes[0]);
    }
  }, [availableImageSizes.join('|'), imageSize, setImageSize]);

  const handleRetry = () => {
    if (refreshing) return;
    setRefreshing(true);
    ipc.invoke('catalog:refresh').finally(() => {
      load();
      setRefreshing(false);
    });
  };

  return (
    <GlassPanel className="flex flex-col gap-3">
      {groups.length === 0 ? (
        <div className="text-xs text-text-tertiary rounded-lg border border-glass-border bg-bg-tertiary px-3 py-2 flex flex-col gap-2">
          <span>{catalogMessage(status)}</span>
          {status?.state === 'error' && (
            <button
              onClick={handleRetry}
              disabled={refreshing}
              className="self-start px-2 py-1 rounded-md text-xs bg-glass-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? 'Повторяем…' : 'Повторить'}
            </button>
          )}
        </div>
      ) : (
        <>
          {status?.stale && (
            <div className="text-[11px] text-text-tertiary/70">
              Данные каталога моделей могут быть устаревшими.
            </div>
          )}

          {/* Category selector — only categories a group actually arrived for */}
          <div>
            <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-2 block">
              Категория
            </label>
            <div className="flex gap-1">
              {CATEGORIES.filter((cat) => groups.some((group) => group.category === cat.id)).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    const firstModel = groups.find((group) => group.category === cat.id)?.models[0];
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
        </>
      )}

      {/* Aspect Ratio — hidden only once a loaded schema proves the model has none */}
      {supportsAspectRatio && (
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 block">
            Пропорции
          </label>
          <div className="flex flex-wrap gap-1">
            {availableAspectRatios.map((ratio) => (
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
      )}

      {/* Image Size — only for models that support it */}
      {supportsImageSize && (
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 block">
            Размер
          </label>
          <div className="flex gap-1">
            {availableImageSizes.map((size) => (
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
      {supportsSeed && (
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
    </GlassPanel>
  );
}
