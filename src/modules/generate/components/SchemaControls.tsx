import { Shuffle } from 'lucide-react';
import type { ParamSchema } from '@/shared/types/models';
import type { GenerationParams } from '@/shared/types/api';
import { controlKindFor, SKIPPED_KEYS } from '@/shared/lib/paramSchema';

/**
 * Russian labels for the protocol keys we have seen. This is interface copy, not a
 * claim about any model: a key that is not here is labelled with itself, so a parameter
 * the API adds tomorrow shows up working, merely untranslated.
 */
export const LABELS: Record<string, string> = {
  aspect_ratio: 'Пропорции',
  resolution: 'Разрешение',
  quality: 'Качество',
  background: 'Фон',
  output_format: 'Формат',
  output_compression: 'Сжатие',
  seed: 'Seed',
  size: 'Размер',
};

/** Display order for the keys we know; anything else follows, alphabetically. */
const ORDER = [
  'aspect_ratio',
  'resolution',
  'size',
  'quality',
  'background',
  'output_format',
  'output_compression',
  'seed',
];

function orderKeys(keys: string[]): string[] {
  const known = ORDER.filter((key) => keys.includes(key));
  const rest = keys.filter((key) => !ORDER.includes(key)).sort();
  return [...known, ...rest];
}

interface Props {
  schema: Record<string, ParamSchema>;
  params: GenerationParams;
  onChange: (key: string, value: string | number) => void;
  onClear: (key: string) => void;
}

export function SchemaControls({ schema, params, onChange, onClear }: Props) {
  const keys = orderKeys(
    Object.keys(schema).filter(
      (key) => !SKIPPED_KEYS.includes(key) && controlKindFor(schema[key]) !== 'none',
    ),
  );

  if (keys.length === 0) return null;

  return (
    <>
      {keys.map((key) => {
        const entry = schema[key];
        const kind = controlKindFor(entry);
        const label = LABELS[key] ?? key;
        const value = params[key];

        return (
          <div key={key}>
            <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1 block">
              {label}
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

            {kind === 'counter' && entry.type === 'range' && (
              <input
                type="number"
                min={entry.min}
                max={entry.max}
                value={typeof value === 'number' ? value : ''}
                onChange={(e) =>
                  e.target.value === '' ? onClear(key) : onChange(key, Number(e.target.value))
                }
                placeholder={`${entry.min}–${entry.max}`}
                className="w-full bg-bg-tertiary text-text-primary text-sm rounded-lg px-3 py-2 outline-none border border-glass-border focus:border-aurora-blue/50"
              />
            )}

            {kind === 'input' && (
              <div className="flex gap-2">
                <input
                  type={key === 'seed' ? 'number' : 'text'}
                  value={value === undefined ? '' : String(value)}
                  onChange={(e) =>
                    e.target.value === ''
                      ? onClear(key)
                      : onChange(key, key === 'seed' ? Number(e.target.value) : e.target.value)
                  }
                  placeholder="Случайный"
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

            {value === undefined && kind === 'enum' && (
              <div className="text-[10px] text-text-tertiary/70 mt-1">Решает провайдер</div>
            )}
          </div>
        );
      })}
    </>
  );
}
