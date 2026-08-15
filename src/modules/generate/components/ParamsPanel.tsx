import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import { useModelsForMode } from '../hooks/useModelsForMode';
import { KieSchemaControls } from './KieSchemaControls';
import type { KieModel } from '@/shared/types/kie';

/** Модели режима, сгруппированные по семейству — иначе список из сорока имён нечитаем. */
function byFamily(models: KieModel[]): Array<{ family: string; models: KieModel[] }> {
  const groups = new Map<string, KieModel[]>();
  for (const model of models) {
    const list = groups.get(model.family);
    if (list) list.push(model);
    else groups.set(model.family, [model]);
  }
  return [...groups.entries()]
    .map(([family, list]) => ({ family, models: list }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

export function ParamsPanel() {
  // Список и выбор модели живут в хуке: он вызывается и из GeneratePage, которая
  // смонтирована в обоих режимах интерфейса
  const { models, selected } = useModelsForMode();
  const selectedModelId = useGenerateStore((s) => s.selectedModelId);
  const params = useGenerateStore((s) => s.params);
  const setSelectedModelId = useGenerateStore((s) => s.setSelectedModelId);
  const setParam = useGenerateStore((s) => s.setParam);
  const clearParam = useGenerateStore((s) => s.clearParam);

  const groups = byFamily(models);

  return (
    <GlassPanel className="flex flex-col gap-3">
      {models.length === 0 ? (
        <div className="text-xs text-text-tertiary rounded-lg border border-glass-border bg-bg-tertiary px-3 py-2">
          Для этого режима моделей нет.
        </div>
      ) : (
        <div>
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 block">
            Модель
          </label>
          <select
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="w-full bg-bg-tertiary text-text-primary text-sm rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50 cursor-pointer"
          >
            {groups.map((group) => (
              <optgroup key={group.family} label={group.family}>
                {group.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {selected && (
        <KieSchemaControls
          model={selected}
          params={params}
          onChange={setParam}
          onClear={clearParam}
        />
      )}
    </GlassPanel>
  );
}
