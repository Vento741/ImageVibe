import { getActiveApiKey } from './configManager';
import { logger } from './logger';

/**
 * Транспорт kie.ai.
 *
 * Генерация асинхронная: createTask возвращает только идентификатор задачи, результат
 * забирается опросом recordInfo и приходит ссылкой на файл, живущий 14 дней.
 *
 * Главная особенность: ошибка приходит с HTTP 200, а настоящий код лежит в поле `code`
 * тела ответа (замер 2). Проверять `response.ok` бесполезно.
 *
 * Подробности — скилл `kie-jobs-api`.
 */

const API_BASE = 'https://api.kie.ai/api/v1';
const UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload';
const UPLOAD_PATH = 'images/user-uploads';
const REQUEST_TIMEOUT_MS = 60_000;

/** Кредит kie.ai в долларах. Единственное место определения во всём проекте. */
export const CREDIT_USD = 0.005;

export type KieTaskState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';

export interface KieTask {
  taskId: string;
  state: KieTaskState;
  /** Ссылки на результат; пусто, пока задача не завершилась успехом */
  resultUrls: string[];
  failMessage: string | null;
  /** Фактический расход задачи; null, пока она не завершилась */
  creditsConsumed: number | null;
  /** Время генерации в секундах — документация ошибочно называет это миллисекундами */
  costTimeSec: number | null;
}

const TASK_STATES: readonly KieTaskState[] = [
  'waiting',
  'queuing',
  'generating',
  'success',
  'fail',
];

function apiKey(): string {
  const key = getActiveApiKey('kie');
  if (!key) throw new Error('Не задан ключ kie.ai. Откройте настройки и добавьте его.');
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
  };
}

/** Свести таймаут запроса с сигналом отмены вызывающего. */
function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Человеческий текст отказа.
 *
 * Код 500 у kie.ai означает не сбой сервиса, а непройденную проверку входа — например
 * отсутствующее обязательное поле или значение вне перечисления, — поэтому его
 * сообщение отдаётся как есть: оно объясняет, что именно не так с запросом.
 */
function errorMessage(code: number, msg: string): string {
  if (code === 401) return 'Неверный ключ kie.ai. Проверьте его в настройках.';
  if (code === 402) return 'На счету kie.ai недостаточно кредитов.';
  if (code === 429) return 'Слишком много запросов к kie.ai. Попробуйте через минуту.';
  return msg || `Ошибка kie.ai (код ${code})`;
}

/**
 * Разобрать ответ kie.ai и вернуть поле `data`.
 *
 * Порядок обязателен: сначала `code` тела, и только потом содержимое. HTTP-статус
 * отказа не отражает — сервис отвечает 200 и на неверный ключ, и на невалидный вход.
 */
async function readResponse(response: Response): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`kie.ai вернул неразбираемый ответ (HTTP ${response.status})`);
  }

  if (!isRecord(body)) throw new Error('kie.ai вернул ответ неожиданной формы');

  const code = typeof body.code === 'number' ? body.code : response.status;
  if (code !== 200) {
    const msg = typeof body.msg === 'string' ? body.msg : '';
    throw new Error(errorMessage(code, msg));
  }

  return body.data;
}

/** Создать задачу генерации. Возвращает её идентификатор — но не результат. */
export async function createTask(
  model: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, input }),
    signal: withTimeout(signal),
  });

  const data = await readResponse(response);
  if (!isRecord(data) || typeof data.taskId !== 'string' || data.taskId === '') {
    throw new Error('kie.ai не вернул идентификатор задачи');
  }

  logger.log('generation', 'info', `Задача kie.ai создана: ${data.taskId}`, { model });
  return data.taskId;
}

/** Разобрать resultJson — это строка с JSON, а не объект (замер 4). */
function parseResultUrls(raw: unknown, state: KieTaskState): string[] {
  if (typeof raw !== 'string' || raw === '') {
    if (state === 'success') throw new Error('kie.ai сообщил об успехе, но результата не приложил');
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('kie.ai вернул нечитаемый результат задачи');
  }

  const urls = isRecord(parsed) ? parsed.resultUrls : undefined;
  if (!Array.isArray(urls) || !urls.every((u) => typeof u === 'string')) {
    if (state === 'success') throw new Error('kie.ai сообщил об успехе, но ссылок не приложил');
    return [];
  }

  return urls;
}

/** Состояние задачи. Опрашивается до success или fail. */
export async function getTask(taskId: string, signal?: AbortSignal): Promise<KieTask> {
  const url = `${API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
  const response = await fetch(url, { headers: headers(), signal: withTimeout(signal) });

  const data = await readResponse(response);
  if (!isRecord(data)) throw new Error('kie.ai вернул запись задачи неожиданной формы');

  const state = TASK_STATES.find((candidate) => candidate === data.state);
  if (!state) throw new Error(`kie.ai вернул неизвестное состояние задачи: ${String(data.state)}`);

  return {
    taskId: typeof data.taskId === 'string' ? data.taskId : taskId,
    state,
    resultUrls: parseResultUrls(data.resultJson, state),
    failMessage: typeof data.failMsg === 'string' && data.failMsg !== '' ? data.failMsg : null,
    creditsConsumed: typeof data.creditsConsumed === 'number' ? data.creditsConsumed : null,
    costTimeSec: typeof data.costTime === 'number' ? data.costTime : null,
  };
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Уникальное имя загружаемого файла.
 *
 * Путь на стороне сервиса строится из uploadPath и fileName буквально, поэтому
 * повторное имя перезаписало бы прошлую загрузку — в том числе чужой генерации,
 * которая ещё ждёт результата (замер 6).
 */
function uniqueName(mime: string): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${suffix}.${EXTENSIONS[mime] ?? 'png'}`;
}

/** Залить data-URL и получить ссылку, пригодную как референс. Загруженное живёт сутки. */
export async function uploadDataUrl(dataUrl: string, signal?: AbortSignal): Promise<string> {
  const mime = /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1];
  if (!mime) throw new Error('Исходное изображение не в формате data-URL');

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      base64Data: dataUrl,
      uploadPath: UPLOAD_PATH,
      fileName: uniqueName(mime),
    }),
    signal: withTimeout(signal),
  });

  const data = await readResponse(response);
  if (!isRecord(data) || typeof data.downloadUrl !== 'string' || data.downloadUrl === '') {
    throw new Error('kie.ai не вернул ссылку на загруженный файл');
  }

  return data.downloadUrl;
}

/** Остаток кредитов на счету. Поле data — число, а не объект. */
export async function getCredits(signal?: AbortSignal): Promise<number> {
  const response = await fetch(`${API_BASE}/chat/credit`, {
    headers: headers(),
    signal: withTimeout(signal),
  });

  const data = await readResponse(response);
  if (typeof data !== 'number') throw new Error('kie.ai вернул баланс неожиданной формы');
  return data;
}

/**
 * Скачать результат.
 *
 * Файловый хост — не API kie.ai: авторизация не нужна, а об ошибке он сообщает
 * обычным HTTP-статусом. Хост непостоянен и от модели к модели меняется, поэтому
 * ссылка берётся из ответа целиком и никак не достраивается.
 */
export async function downloadResult(url: string, signal?: AbortSignal): Promise<Buffer> {
  const response = await fetch(url, { signal: withTimeout(signal) });
  if (!response.ok) {
    throw new Error(`Не удалось скачать результат: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
