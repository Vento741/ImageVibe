import { useEffect, useState } from 'react';
import { Zap, Paintbrush, Brain, Shuffle } from 'lucide-react';
import type { ComponentType } from 'react';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { ipc } from '@/shared/lib/ipc';
import { useGenerateStore } from '../store';
import type { ModelCategory, AspectRatio, ImageSize } from '@/shared/types/models';
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

  useEffect(() => {
    const load = () => {
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
    };
    load();
    return ipc.on('catalog:updated', load);
  }, []);

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

  return (
    <GlassPanel className="flex flex-col gap-3">
      {groups.length === 0 ? (
        <div className="text-xs text-text-tertiary rounded-lg border border-glass-border bg-bg-tertiary px-3 py-2">
          {catalogMessage(status)}
        </div>
      ) : (
        <>
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
      {supportsImageSize && (
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
