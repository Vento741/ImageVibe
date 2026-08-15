import rawModels from '../data/kie-models.json';
import type { KieMode, KieModel, KieParamSchema, ModelRoles } from '../../src/shared/types/kie';

/**
 * Реестр моделей kie.ai.
 *
 * Читается из сгенерированного `electron/data/kie-models.json` — ни сети, ни кеша, ни
 * фонового обновления: у kie.ai нет API со списком моделей (замер 9), а файл собирается
 * скриптом `npm run kie:registry` из документации поставщика. Обновление реестра — это
 * перезапуск скрипта и новая сборка приложения.
 */

const ALL_MODES: readonly KieMode[] = [
  'text2img',
  'img2img',
  'inpaint',
  'text2video',
  'img2video',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseParamSchema(value: unknown): KieParamSchema | null {
  if (!isRecord(value)) return null;

  if (value.type === 'enum') {
    if (!Array.isArray(value.values) || !value.values.every((v) => typeof v === 'string')) {
      return null;
    }
    const entry: KieParamSchema = { type: 'enum', values: value.values };
    if (typeof value.default === 'string') entry.default = value.default;
    if (value.valueType === 'number' || value.valueType === 'boolean') {
      entry.valueType = value.valueType;
    }
    return entry;
  }

  if (value.type === 'number') {
    if (typeof value.integer !== 'boolean') return null;
    const entry: KieParamSchema = { type: 'number', integer: value.integer };
    if (typeof value.min === 'number') entry.min = value.min;
    if (typeof value.max === 'number') entry.max = value.max;
    if (typeof value.default === 'number') entry.default = value.default;
    return entry;
  }

  if (value.type === 'boolean') {
    const entry: KieParamSchema = { type: 'boolean' };
    if (typeof value.default === 'boolean') entry.default = value.default;
    return entry;
  }

  if (value.type === 'text') {
    const entry: KieParamSchema = { type: 'text' };
    if (typeof value.maxLength === 'number') entry.maxLength = value.maxLength;
    return entry;
  }

  return null;
}

function parseRoles(value: unknown): ModelRoles | null {
  if (!isRecord(value) || typeof value.prompt !== 'string') return null;

  const roles: ModelRoles = { prompt: value.prompt };

  if (value.references !== undefined) {
    const ref = value.references;
    if (
      !isRecord(ref) ||
      typeof ref.key !== 'string' ||
      typeof ref.array !== 'boolean' ||
      typeof ref.max !== 'number'
    ) {
      return null;
    }
    roles.references = { key: ref.key, array: ref.array, max: ref.max };
  }

  if (value.mask !== undefined) {
    const mask = value.mask;
    if (!isRecord(mask) || typeof mask.key !== 'string' || typeof mask.array !== 'boolean') {
      return null;
    }
    roles.mask = { key: mask.key, array: mask.array };
  }

  return roles;
}

/**
 * Разобрать одну запись сгенерированного файла.
 *
 * Файл наш собственный и покрыт тестами, но он единственная граница между нетипизированным
 * JSON и типизированным кодом: сломанная перегенерация должна выявляться здесь, а не
 * приводить к запросу с мусором в теле.
 */
export function parseModel(value: unknown): KieModel | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id === '') return null;
  if (typeof value.name !== 'string' || typeof value.family !== 'string') return null;
  if (typeof value.docUrl !== 'string') return null;
  if (value.kind !== 'image' && value.kind !== 'video') return null;

  if (!Array.isArray(value.modes)) return null;
  const modes: KieMode[] = [];
  for (const mode of value.modes) {
    const known = ALL_MODES.find((candidate) => candidate === mode);
    if (!known) return null;
    modes.push(known);
  }

  const roles = parseRoles(value.roles);
  if (!roles) return null;

  if (!isRecord(value.schema)) return null;
  const schema: Record<string, KieParamSchema> = {};
  for (const [key, entry] of Object.entries(value.schema)) {
    const parsed = parseParamSchema(entry);
    if (!parsed) return null;
    schema[key] = parsed;
  }

  if (!Array.isArray(value.required)) return null;
  const required: string[] = [];
  for (const key of value.required) {
    // Обязательный ключ без записи в схеме означал бы параметр, который надо отправить,
    // но нечем: такую модель генератор не выпускает, и здесь это тоже отказ.
    if (typeof key !== 'string' || !(key in schema)) return null;
    required.push(key);
  }

  return {
    id: value.id,
    name: value.name,
    family: value.family,
    kind: value.kind,
    modes,
    schema,
    required,
    roles,
    docUrl: value.docUrl,
  };
}

let models: KieModel[] | null = null;

function load(): KieModel[] {
  if (models) return models;
  const parsed: KieModel[] = [];
  for (const raw of rawModels as unknown[]) {
    const model = parseModel(raw);
    if (model) parsed.push(model);
  }
  models = parsed;
  return models;
}

/** Тестовый шов: подменить реестр вместо чтения сгенерированного файла. */
export function setRegistryForTests(replacement: KieModel[] | null): void {
  models = replacement;
}

export function getAllModels(): KieModel[] {
  return load();
}

export function getModelById(id: string): KieModel | undefined {
  return load().find((model) => model.id === id);
}

/** Модели, обслуживающие режим: по семейству, внутри по имени. */
export function getModelsForMode(mode: KieMode): KieModel[] {
  return load()
    .filter((model) => model.modes.includes(mode))
    .sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
}

/** Режимы, у которых есть хотя бы одна модель — вкладка без моделей не показывается. */
export function getAvailableModes(): KieMode[] {
  const present = new Set(load().flatMap((model) => model.modes));
  return ALL_MODES.filter((mode) => present.has(mode));
}

export function getFamilies(kind: 'image' | 'video'): string[] {
  const families = new Set(load().filter((m) => m.kind === kind).map((m) => m.family));
  return [...families].sort((a, b) => a.localeCompare(b));
}

/**
 * Модель по умолчанию для режима — первая по идентификатору.
 *
 * Никакой сортировки «по качеству» или «по цене»: ни того, ни другого приложение не
 * знает, а придуманный порядок был бы утверждением о моделях, ничем не подкреплённым.
 */
export function getDefaultModelId(mode: KieMode): string | undefined {
  return load()
    .filter((model) => model.modes.includes(mode))
    .map((model) => model.id)
    .sort((a, b) => a.localeCompare(b))[0];
}
