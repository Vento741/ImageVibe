import type { KieParams, KieParamSchema } from '../types/kie';

/** Какой контрол требует форма записи схемы. */
export type ControlKind = 'enum' | 'number' | 'toggle' | 'text';

export function controlKindFor(entry: KieParamSchema): ControlKind {
  if (entry.type === 'enum') return 'enum';
  if (entry.type === 'number') return 'number';
  if (entry.type === 'boolean') return 'toggle';
  return 'text';
}

/** True, когда параметр объявлен моделью. Отсутствие означает, что его нет вовсе. */
export function hasParameter(schema: Record<string, KieParamSchema>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(schema, key);
}

/** Допустимые значения перечисления, либо null, если ключа нет или он не перечисление. */
export function enumValues(schema: Record<string, KieParamSchema>, key: string): string[] | null {
  const entry = schema[key];
  if (!entry || entry.type !== 'enum') return null;
  return entry.values;
}

/** True, когда значение всё ещё допустимо по записи схемы, объявленной для него. */
function valueFits(entry: KieParamSchema, value: KieParams[string]): boolean {
  switch (entry.type) {
    case 'enum':
      return typeof value === 'string' && entry.values.includes(value);
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      if (entry.integer && !Number.isInteger(value)) return false;
      if (entry.min !== undefined && value < entry.min) return false;
      if (entry.max !== undefined && value > entry.max) return false;
      return true;
    case 'boolean':
      return typeof value === 'boolean';
    case 'text':
      if (typeof value !== 'string' || value === '') return false;
      return entry.maxLength === undefined || value.length <= entry.maxLength;
  }
}

/**
 * Привести набор параметров к схеме модели: выбросить всё, чего она не допускает.
 *
 * Выпавшее значение выбрасывается, а не заменяется допустимым и не берётся из
 * `default`: подставленное значение — это выдуманный выбор пользователя, а
 * неотправленный параметр честно означает «решает поставщик».
 *
 * Отсев обязателен перед отправкой: kie.ai принимает незнакомый ключ молча, создаёт
 * задачу и списывает за неё деньги (замер 3). Значение вне перечисления сервис при этом
 * отвергает, то есть проверяет домен известных ключей, но не сам набор ключей.
 */
export function filterToSchema(
  params: KieParams,
  schema: Record<string, KieParamSchema>,
): KieParams {
  const out: KieParams = {};

  for (const [key, value] of Object.entries(params)) {
    const entry = schema[key];
    if (!entry) continue;
    if (valueFits(entry, value)) out[key] = value;
  }

  return out;
}
