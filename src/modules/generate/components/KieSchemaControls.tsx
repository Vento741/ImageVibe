import { Shuffle } from 'lucide-react';
import type { KieModel, KieParams, KieParamSchema } from '@/shared/types/kie';
import { controlKindFor } from '@/shared/lib/kieParams';

/**
 * Контролы параметров, построенные из схемы модели.
 *
 * Модель, объявившая параметр, которого приложение никогда не видело, получает
 * работающий контрол без правок кода — это проверяемый критерий блока. Незнакомый ключ
 * подписывается собой: перевода у него нет, но работает он полностью.
 */
export const LABELS: Record<string, string> = {
  aspect_ratio: 'Пропорции',
  resolution: 'Разрешение',
  image_size: 'Размер',
  size: 'Размер',
  quality: 'Качество',
  output_format: 'Формат',
  output_compression: 'Сжатие',
  seed: 'Seed',
  negative_prompt: 'Чего избегать',
  nsfw_checker: 'Фильтр содержимого',
  duration: 'Длительность',
  guidance_scale: 'Следование промпту',
  num_inference_steps: 'Шагов',
  rendering_speed: 'Скорость отрисовки',
  style: 'Стиль',
  expand_prompt: 'Дополнять промпт',
  prompt_extend: 'Дополнять промпт',
  enable_safety_checker: 'Проверка безопасности',
  generate_audio: 'Со звуком',
  acceleration: 'Ускорение',
  strength: 'Сила изменения',
  watermark: 'Водяной знак',
  camera_fixed: 'Неподвижная камера',
};

/** Порядок известных ключей; остальные идут следом по алфавиту. */
const ORDER = [
  'aspect_ratio',
  'resolution',
  'image_size',
  'size',
  'duration',
  'quality',
  'style',
  'negative_prompt',
  'output_format',
  'seed',
];

function orderKeys(keys: string[]): string[] {
  const known = ORDER.filter((key) => keys.includes(key));
  const rest = keys.filter((key) => !ORDER.includes(key)).sort();
  return [...known, ...rest];
}

/** Подпись со значением по умолчанию — что произойдёт, если ничего не выбрать. */
function defaultHint(entry: KieParamSchema): string | null {
  if (entry.type === 'enum' && entry.default) return `по умолчанию: ${entry.default}`;
  if (entry.type === 'number' && entry.default !== undefined) {
    return `по умолчанию: ${entry.default}`;
  }
  return null;
}

function rangeHint(entry: KieParamSchema): string {
  if (entry.type !== 'number') return '';
  if (entry.min !== undefined && entry.max !== undefined) return `${entry.min}–${entry.max}`;
  if (entry.min !== undefined) return `от ${entry.min}`;
  if (entry.max !== undefined) return `до ${entry.max}`;
  return 'число';
}

interface Props {
  model: KieModel;
  params: KieParams;
  onChange: (key: string, value: string | number | boolean) => void;
  onClear: (key: string) => void;
}

export function KieSchemaControls({ model, params, onChange, onClear }: Props) {
  const keys = orderKeys(Object.keys(model.schema));
  if (keys.length === 0) return null;

  return (
    <>
      {keys.map((key) => {
        const entry = model.schema[key];
        const kind = controlKindFor(entry);
        const value = params[key];
        const required = model.required.includes(key);
        const hint = defaultHint(entry);

        return (
          <div key={key}>
            <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
              <span>{LABELS[key] ?? key}</span>
              {required && <span className="text-aurora-blue/70 normal-case">обязательно</span>}
            </label>

            {kind === 'enum' && entry.type === 'enum' && (
              <div className="flex flex-wrap gap-1">
                {entry.values.map((allowed) => (
                  <button
                    key={allowed}
                    onClick={() => onChange(key, allowed)}
                    className={`px-2 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                      value === allowed
                        ? 'bg-aurora-blue/20 text-aurora-blue'
                        : 'text-text-secondary hover:bg-glass-hover'
                    }`}
                  >
                    {allowed}
                  </button>
                ))}
              </div>
            )}

            {kind === 'number' && entry.type === 'number' && (
              <div className="flex gap-2">
                <input
                  type="number"
                  min={entry.min}
                  max={entry.max}
                  step={entry.integer ? 1 : 'any'}
                  value={typeof value === 'number' ? value : ''}
                  onChange={(e) =>
                    e.target.value === '' ? onClear(key) : onChange(key, Number(e.target.value))
                  }
                  placeholder={rangeHint(entry)}
                  className="flex-1 bg-bg-tertiary text-text-primary text-sm rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50"
                />
                {key === 'seed' && (
                  <button
                    onClick={() => onChange(key, Math.floor(Math.random() * 2147483647))}
                    className="px-3 py-2 rounded-lg bg-glass-hover text-text-secondary hover:text-text-primary transition-colors text-sm cursor-pointer"
                    title="Случайный seed"
                  >
                    <Shuffle size={14} />
                  </button>
                )}
              </div>
            )}

            {kind === 'toggle' && (
              <button
                onClick={() => onChange(key, value !== true)}
                className={`w-10 h-6 rounded-full transition-colors cursor-pointer relative ${
                  value === true ? 'bg-aurora-blue/60' : 'bg-bg-tertiary border border-glass-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-text-primary transition-all ${
                    value === true ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
            )}

            {kind === 'text' && entry.type === 'text' && (
              <textarea
                rows={key === 'negative_prompt' ? 2 : 1}
                maxLength={entry.maxLength}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) =>
                  e.target.value === '' ? onClear(key) : onChange(key, e.target.value)
                }
                className="w-full bg-bg-tertiary text-text-primary text-sm rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50 resize-none"
              />
            )}

            {value === undefined && (
              <div className="text-[10px] text-text-tertiary/70 mt-1">
                {required ? 'Нужно выбрать значение' : (hint ?? 'Решает поставщик')}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
