import type { KieModel, KieParams, KieParamSchema } from '../types/kie';

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

/**
 * Значение, которым имеет смысл предзаполнить контрол обязательного параметра.
 *
 * Объявленный `default`, иначе первое значение перечисления, иначе `false` для
 * переключателя — у него всё равно нет состояния «не выбрано». Для числа без
 * значения по умолчанию честного варианта нет: возвращается `undefined`, контрол
 * остаётся пустым, и генерация блокируется, пока пользователь не заполнит его сам.
 */
export function defaultValueFor(entry: KieParamSchema): string | number | boolean | undefined {
  switch (entry.type) {
    case 'enum':
      return entry.default ?? entry.values[0];
    case 'number':
      return entry.default;
    case 'boolean':
      return entry.default ?? false;
    case 'text':
      return undefined;
  }
}

/**
 * Привести набор параметров к модели: выбросить недопустимое, затем предзаполнить
 * обязательное.
 *
 * Предзаполняются только обязательные параметры, и только потому, что без них сервис
 * отвергает запрос (замер 3a). Необязательные остаются пустыми — их отсутствие честно
 * означает «решает поставщик».
 */
export function applyModel(params: KieParams, model: KieModel): KieParams {
  const out = filterToSchema(params, model.schema);

  for (const key of model.required) {
    if (key in out) continue;
    const entry = model.schema[key];
    if (!entry) continue;
    const value = defaultValueFor(entry);
    if (value !== undefined) out[key] = value;
  }

  return out;
}

/** Обязательные параметры, для которых значение так и не задано. Пусто — можно запускать. */
export function missingRequired(params: KieParams, model: KieModel): string[] {
  return model.required.filter((key) => !(key in params));
}
