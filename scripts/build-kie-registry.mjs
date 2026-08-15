/**
 * Сборка реестра моделей kie.ai из документации поставщика.
 *
 * У kie.ai нет API со списком моделей — проверено восемь кандидатов, все 404 (замер 9).
 * Зато у каждой модели на странице документации лежит полная OpenAPI-схема входа,
 * а индекс всех страниц отдаётся по llms.txt. Отсюда и собирается реестр.
 *
 * Запуск: npm run kie:registry
 * Результат: electron/data/kie-models.json
 *
 * Подробности — скилл kie-model-registry.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const INDEX_URL = 'https://docs.kie.ai/llms.txt';
const OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'electron',
  'data',
  'kie-models.json',
);
const CONCURRENCY = 12;

/**
 * Имена ключей, несущих роль, по убыванию приоритета.
 *
 * Имя ключа с референсом не нормализовано: у моделей изображений встречается шесть
 * разных имён (замер 11), у видео добавляются кадры. Это единственное место во всём
 * конвейере, где что-то предполагается об именах — приложение получает готовые роли
 * данными и ничего не угадывает.
 *
 * last_frame_url и end_image_url ролью намеренно не становятся: последний кадр это
 * отдельная возможность, а не исходник. bbox_list — прямоугольные области, а не
 * растровая маска.
 */
const REFERENCE_KEYS = [
  'input_urls',
  'image_urls',
  'reference_image_urls',
  'image_url',
  'image_input',
  'image',
  'first_frame_url',
];
const MASK_KEYS = ['mask_url', 'reference_mask_urls'];
const PROMPT_KEY = 'prompt';

const CREATE_TASK_PATH = '/api/v1/jobs/createTask';

/** Вынуть OpenAPI из markdown-страницы документации. null, если блока нет. */
export function extractOpenApi(markdown) {
  const match = /```yaml\n([\s\S]*?)\n```/.exec(markdown);
  if (!match) return null;
  try {
    const doc = yaml.load(match[1]);
    return doc && typeof doc === 'object' ? doc : null;
  } catch {
    return null;
  }
}

/** Свойства входа, включая вынесенные в x-apidog-refs через components.schemas. */
function inputProperties(doc, post) {
  const schema = post?.requestBody?.content?.['application/json']?.schema;
  const input = schema?.properties?.input;
  if (!input || typeof input !== 'object') return null;

  const props = { ...(input.properties ?? {}) };
  const components = doc.components?.schemas ?? {};

  for (const ref of Object.values(input['x-apidog-refs'] ?? {})) {
    const name = String(ref?.$ref ?? '').split('/').pop();
    if (name && components[name] && !(name in props)) props[name] = components[name];
  }

  return { props, required: input.required ?? [] };
}

/** Преобразовать одно свойство OpenAPI в запись схемы. null — свойство не поддержано. */
function toParamSchema(prop) {
  if (!prop || typeof prop !== 'object') return null;

  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    const entry = { type: 'enum', values: prop.enum.map(String) };
    const first = prop.enum[0];
    if (typeof first === 'number') entry.valueType = 'number';
    else if (typeof first === 'boolean') entry.valueType = 'boolean';
    if (prop.default !== undefined) entry.default = String(prop.default);
    return entry;
  }

  if (prop.type === 'integer' || prop.type === 'number') {
    const entry = { type: 'number', integer: prop.type === 'integer' };
    if (typeof prop.minimum === 'number') entry.min = prop.minimum;
    if (typeof prop.maximum === 'number') entry.max = prop.maximum;
    if (typeof prop.default === 'number') entry.default = prop.default;
    return entry;
  }

  if (prop.type === 'boolean') {
    const entry = { type: 'boolean' };
    if (typeof prop.default === 'boolean') entry.default = prop.default;
    return entry;
  }

  if (prop.type === 'string') {
    const entry = { type: 'text' };
    if (typeof prop.maxLength === 'number') entry.maxLength = prop.maxLength;
    return entry;
  }

  // Массивы без роли и объекты интерфейса не имеют — контрол для них не построить.
  return null;
}

/** Найти первый ключ из таблицы, присутствующий в свойствах. */
function findRole(props, keys) {
  return keys.find((key) => key in props);
}

/**
 * Превратить OpenAPI страницы в запись модели.
 * null — страница не описывает createTask либо модель негенеративная.
 */
export function openApiToModel(doc, meta) {
  const post = doc?.paths?.[CREATE_TASK_PATH]?.post;
  if (!post) return null;

  const schemaProps = post.requestBody?.content?.['application/json']?.schema?.properties;
  const modelProp = schemaProps?.model;
  const id = modelProp?.enum?.[0] ?? modelProp?.default;
  if (typeof id !== 'string' || id === '') return null;

  const input = inputProperties(doc, post);
  if (!input) return null;

  // Признак генеративной модели — наличие промпта. Апскейл, удаление фона и разбор
  // на слои отсеиваются сами: интерфейс генерации просит промпт, а им его дать нечем.
  if (!(PROMPT_KEY in input.props)) return null;

  const referenceKey = findRole(input.props, REFERENCE_KEYS);
  const maskKey = findRole(input.props, MASK_KEYS);

  const roles = { prompt: PROMPT_KEY };
  if (referenceKey) {
    const prop = input.props[referenceKey];
    roles.references = {
      key: referenceKey,
      array: prop.type === 'array',
      max: typeof prop.maxItems === 'number' ? prop.maxItems : 1,
    };
  }
  if (maskKey) {
    roles.mask = { key: maskKey, array: input.props[maskKey].type === 'array' };
  }

  const schema = {};
  const roleKeys = new Set([PROMPT_KEY, referenceKey, maskKey].filter(Boolean));
  for (const [key, prop] of Object.entries(input.props)) {
    if (roleKeys.has(key)) continue;
    const entry = toParamSchema(prop);
    if (entry) schema[key] = entry;
  }

  // Режим выводится из схемы, а не из имени: суффиксы идентификаторов не единообразны
  // и обратной группировке не поддаются (замер 13).
  const base = meta.kind === 'video' ? 'text2video' : 'text2img';
  const withImage = meta.kind === 'video' ? 'img2video' : 'img2img';
  const modes = [];
  if (!referenceKey || !input.required.includes(referenceKey)) modes.push(base);
  if (referenceKey) modes.push(withImage);
  if (maskKey && meta.kind === 'image') modes.push('inpaint');

  return {
    id,
    name: typeof post.summary === 'string' && post.summary ? post.summary : id,
    family: id.includes('/') ? id.slice(0, id.indexOf('/')) : id,
    kind: meta.kind,
    modes,
    schema,
    roles,
    docUrl: meta.docUrl,
  };
}

/** Разобрать llms.txt в список страниц разделов Image и Video. */
export function parseIndex(text) {
  const pages = [];
  const line = /^-\s*([^[]*)\[[^\]]*\]\((https:\/\/docs\.kie\.ai\/market\/[^)]+\.md)\)/;

  for (const raw of text.split('\n')) {
    const match = line.exec(raw.trim());
    if (!match) continue;
    const category = match[1].trim();
    if (category.startsWith('Image')) pages.push({ kind: 'image', docUrl: match[2] });
    else if (category.startsWith('Video')) pages.push({ kind: 'video', docUrl: match[2] });
  }

  return pages;
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  process.stdout.write(`Индекс: ${INDEX_URL}\n`);
  const index = await fetch(INDEX_URL);
  if (!index.ok) throw new Error(`Индекс недоступен: HTTP ${index.status}`);

  const pages = parseIndex(await index.text());
  process.stdout.write(`Страниц изображений и видео: ${pages.length}\n`);

  const models = await mapLimited(pages, CONCURRENCY, async (page) => {
    const res = await fetch(page.docUrl);
    if (!res.ok) {
      process.stderr.write(`  пропущено ${page.docUrl}: HTTP ${res.status}\n`);
      return null;
    }
    const doc = extractOpenApi(await res.text());
    if (!doc) {
      process.stderr.write(`  пропущено ${page.docUrl}: нет блока OpenAPI\n`);
      return null;
    }
    return openApiToModel(doc, page);
  });

  const kept = models.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));

  // Один идентификатор описан двумя страницами у части семейств — берём первую.
  const unique = [];
  const seen = new Set();
  for (const model of kept) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    unique.push(model);
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(unique, null, 2) + '\n', 'utf8');

  const images = unique.filter((m) => m.kind === 'image').length;
  const videos = unique.filter((m) => m.kind === 'video').length;
  process.stdout.write(`Записано ${unique.length}: изображений ${images}, видео ${videos}\n`);
  process.stdout.write(`Файл: ${OUT_PATH}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    process.stderr.write(`Ошибка: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
