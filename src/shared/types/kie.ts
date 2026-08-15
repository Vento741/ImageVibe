/**
 * Типы каталога kie.ai.
 *
 * Схемы параметров приходят из сгенерированного реестра `electron/data/kie-models.json`,
 * который собирается скриптом из OpenAPI-описаний в документации поставщика: API со
 * списком моделей у kie.ai нет (замер 9). Ничего из перечисленного здесь не пишется
 * руками — см. скилл `kie-model-registry`.
 */

/**
 * Одна запись входной схемы модели.
 *
 * У kie.ai типы честные, в отличие от OpenRouter, где единственным ключом формы
 * `boolean` во всём каталоге оказалось числовое зерно (замер 14): здесь `boolean` —
 * настоящий переключатель, а числа и свободный текст объявляются своими формами.
 */
export type KieParamSchema =
  /**
   * Значения перечисления всегда хранятся строками — так с ними работают контролы и
   * стор. Но у шести моделей `duration` объявлен целыми числами, а у одной `audio` —
   * булевым, поэтому исходный тип запоминается в `valueType` и восстанавливается при
   * сборке тела запроса. Отправить "5" туда, где объявлено 5, — вероятный отказ.
   */
  | { type: 'enum'; values: string[]; default?: string; valueType?: 'number' | 'boolean' }
  | { type: 'number'; min?: number; max?: number; default?: number; integer: boolean }
  | { type: 'boolean'; default?: boolean }
  | { type: 'text'; maxLength?: number };

/** Режим генерации. У kie.ai он свойство модели, а не параметр запроса (замер 13). */
export type KieMode = 'text2img' | 'img2img' | 'inpaint' | 'text2video' | 'img2video';

/**
 * Какой ключ схемы что означает.
 *
 * Имя ключа с референсом не нормализовано — шесть разных имён у моделей изображений
 * (замер 11), поэтому роль назначается таблицей соответствия в генераторе реестра,
 * а приложение получает готовый ответ данными.
 */
export interface ModelRoles {
  prompt: string;
  references?: { key: string; array: boolean; max: number };
  mask?: { key: string; array: boolean };
}

/** Запись модели в реестре. */
export interface KieModel {
  /** Идентификатор для поля `model` запроса, например 'flux-2/pro-text-to-image' */
  id: string;
  name: string;
  /** Часть id до первого слэша — по ней группируется список моделей */
  family: string;
  kind: 'image' | 'video';
  modes: KieMode[];
  /** Только те ключи, которыми управляет пользователь: ключи с ролью сюда не попадают */
  schema: Record<string, KieParamSchema>;
  roles: ModelRoles;
  docUrl: string;
}

/** Значения параметров генерации, ключи — имена из схемы модели. */
export type KieParams = Record<string, string | number | boolean>;
