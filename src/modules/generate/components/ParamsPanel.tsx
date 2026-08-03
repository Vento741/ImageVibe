import { useCallback, useEffect, useState } from 'react';
import { Zap, Paintbrush, Brain } from 'lucide-react';
import type { ComponentType } from 'react';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { ipc } from '@/shared/lib/ipc';
import { useGenerateStore } from '../store';
import { SchemaControls } from './SchemaControls';
import type { ModelCategory } from '@/shared/types/models';
import type { CatalogModelDTO, CatalogStatusResult } from '@/shared/types/ipc';

// Buckets are computed from price, so the labels name price, not temperament
const CATEGORIES: Array<{ id: ModelCategory; name: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'fast', name: 'Дешёвые', icon: Zap },
  { id: 'quality', name: 'Средние', icon: Paintbrush },
  { id: 'smart', name: 'Дорогие', icon: Brain },
];

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
  const [refreshing, setRefreshing] = useState(false);
  const selectedCategory = useGenerateStore((s) => s.selectedCategory);
  const selectedModelId = useGenerateStore((s) => s.selectedModelId);
  const params = useGenerateStore((s) => s.params);
  const setSelectedCategory = useGenerateStore((s) => s.setSelectedCategory);
  const setSelectedModelId = useGenerateStore((s) => s.setSelectedModelId);
  const setParam = useGenerateStore((s) => s.setParam);
  const clearParam = useGenerateStore((s) => s.clearParam);
  const syncParamsToSchema = useGenerateStore((s) => s.syncParamsToSchema);

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

  // Bring the parameter record to the newly selected model's schema: drop what it does
  // not allow, fill 'auto' where it offers it. Until pricesLoaded, schema is the
  // catalog-record schema — not the cross-provider intersection — and cannot be trusted
  // to build controls (see openrouter-model-registry §5), so this waits for it.
  useEffect(() => {
    if (selected?.pricesLoaded) syncParamsToSchema(selected.schema);
  }, [selected?.id, selected?.pricesLoaded, syncParamsToSchema]);

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

      {selected?.pricesLoaded ? (
        <SchemaControls
          schema={selected.schema}
          params={params}
          onChange={setParam}
          onClear={clearParam}
        />
      ) : (
        selected && (
          <div className="text-[11px] text-text-tertiary/70">
            Параметры модели загружаются…
          </div>
        )
      )}
    </GlassPanel>
  );
}
