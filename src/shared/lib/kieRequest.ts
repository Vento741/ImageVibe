import { filterToSchema, missingRequired } from './kieParams';
import type { KieMode, KieModel, KieParams } from '../types/kie';

/**
 * Сборка тела запроса kie.ai.
 *
 * Чистая функция без сети: именно она решает, что уедет в оплачиваемый запрос, поэтому
 * должна быть покрыта тестами целиком. Проверки живут здесь, а не в компоненте — правило,
 * реализованное только в интерфейсе, обходится применением пресета (урок блока C).
 */

export interface KieGenerationRequest {
  /** Промпт в том виде, в каком он уйдёт: переведённый, со стилевыми тегами */
  prompt: string;
  modelId: string;
  mode: KieMode;
  params: KieParams;
  /** Ссылка на исходник, уже загруженный в сервис */
  sourceUrl?: string;
  /** Ссылка на маску, уже загруженную в сервис */
  maskUrl?: string;
}

/** Режимы, для которых исходное изображение обязательно. */
const MODES_NEEDING_SOURCE: readonly KieMode[] = ['img2img', 'inpaint', 'img2video'];

export function needsSource(mode: KieMode): boolean {
  return MODES_NEEDING_SOURCE.includes(mode);
}

/**
 * Вернуть значению перечисления исходный тип.
 *
 * Значения хранятся строками — так с ними работают контролы и стор, — но у шести
 * моделей `duration` объявлен целыми числами, а у одной `audio` булевым. Отправить "5"
 * туда, где объявлено 5, значит получить отказ проверки.
 */
function restoreEnumTypes(
  params: KieParams,
  schema: KieModel['schema'],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    const entry = schema[key];
    if (entry?.type === 'enum' && typeof value === 'string') {
      if (entry.valueType === 'number') {
        out[key] = Number(value);
        continue;
      }
      if (entry.valueType === 'boolean') {
        out[key] = value === 'true';
        continue;
      }
    }
    out[key] = value;
  }

  return out;
}

/**
 * Собрать поле `input` запроса createTask.
 *
 * Порядок: промпт по своей роли, затем референс и маска по своим, затем отсеянные по
 * схеме параметры. Отсев обязателен: kie.ai принимает незнакомый ключ молча, создаёт
 * задачу и списывает за неё деньги (замер 3).
 */
export function buildTaskInput(
  model: KieModel,
  request: KieGenerationRequest,
): Record<string, unknown> {
  if (!model.modes.includes(request.mode)) {
    throw new Error(`Модель «${model.name}» не поддерживает этот режим генерации`);
  }

  if (request.prompt.trim() === '') {
    throw new Error('Промпт пуст');
  }

  if (request.sourceUrl && !model.roles.references) {
    throw new Error(`Модель «${model.name}» не принимает исходное изображение`);
  }

  if (needsSource(request.mode) && !request.sourceUrl) {
    throw new Error('Для этого режима нужно исходное изображение');
  }

  if (request.mode === 'inpaint') {
    if (!model.roles.mask) {
      throw new Error(`Модель «${model.name}» не принимает маску`);
    }
    if (!request.maskUrl) {
      throw new Error('Для правки области нужна маска');
    }
  }

  const missing = missingRequired(request.params, model);
  if (missing.length > 0) {
    throw new Error(`Не заполнены обязательные параметры: ${missing.join(', ')}`);
  }

  const input: Record<string, unknown> = { [model.roles.prompt]: request.prompt };

  const references = model.roles.references;
  if (references && request.sourceUrl) {
    input[references.key] = references.array ? [request.sourceUrl] : request.sourceUrl;
  }

  const mask = model.roles.mask;
  if (mask && request.maskUrl && request.mode === 'inpaint') {
    input[mask.key] = mask.array ? [request.maskUrl] : request.maskUrl;
  }

  Object.assign(input, restoreEnumTypes(filterToSchema(request.params, model.schema), model.schema));

  return input;
}
