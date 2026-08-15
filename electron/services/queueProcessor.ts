import { BrowserWindow, app } from 'electron';
import { getDatabase } from './database';
import { translatePrompt, isRussianText } from './openRouterClient';
import { createTask, downloadResult, getTask, uploadDataUrl } from './kieClient';
import { getModelById } from './kieRegistry';
import { buildTaskInput, needsSource } from '../../src/shared/lib/kieRequest';
import { creditsToUsd, medianCostFor } from './costHistory';
import { saveMedia, getFileSize } from './fileStorage';
import { detectMedia, readImageSize } from './mediaBytes';
import { saveImageTags } from './autoTagger';
import { recordCost, TRANSLATE_ESTIMATED_COST_USD } from './costTracker';
import { getConfig } from './configManager';
import { logger } from './logger';
import type { KieMode, KieParams } from '../../src/shared/types/kie';
import type { DBQueueItem } from '../../src/shared/types/database';

/**
 * Очередь генерации.
 *
 * Генерация у kie.ai асинхронная: createTask возвращает идентификатор, результат
 * забирается опросом. Идентификатор пишется в базу сразу, поэтому задача переживает
 * перезапуск приложения — иначе закрытое окно означало бы оплаченную и потерянную
 * генерацию, что для видео с его минутами ожидания почти обычное дело.
 */

export interface KieQueueRequest {
  prompt: string;
  translatedPrompt?: string;
  modelId: string;
  mode: KieMode;
  params: KieParams;
  /** Исходник в виде data-URL: сервису нужен URL, поэтому файл сначала заливается */
  sourceImageDataUrl?: string;
  maskDataUrl?: string;
  styleTags?: string[];
  clientId: string;
}

/** Что хранится в колонке params записи очереди. */
interface StoredRequest {
  mode: KieMode;
  params: KieParams;
  styleTags?: string[];
  sourceImageDataUrl?: string;
  maskDataUrl?: string;
}

const MAX_CONCURRENT = 3;

/** Наблюдавшееся время генерации изображения — 13 и 55 секунд; видео идёт минутами. */
export const POLL_INTERVAL_MS = { image: 3_000, video: 10_000 } as const;
export const POLL_TIMEOUT_MS = { image: 10 * 60_000, video: 30 * 60_000 } as const;

const clientIdMap = new Map<number, string>();
const abortControllers = new Map<number, AbortController>();
const activeGenerations = new Set<number>();

let pollingOverride: { intervalMs: number; timeoutMs: number } | null = null;

/** Тестовый шов: укоротить опрос, чтобы не ждать минутами. */
export function setPollingForTests(value: { intervalMs: number; timeoutMs: number } | null): void {
  pollingOverride = value;
}

function pollTiming(kind: 'image' | 'video') {
  if (pollingOverride) return pollingOverride;
  return { intervalMs: POLL_INTERVAL_MS[kind], timeoutMs: POLL_TIMEOUT_MS[kind] };
}

function sendToRenderer(channel: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function canProcessMore(): boolean {
  return activeGenerations.size < MAX_CONCURRENT;
}

/** Поставить генерацию в очередь. Возвращает номер записи очереди. */
export function submitGeneration(request: KieQueueRequest): number {
  const db = getDatabase();
  const model = getModelById(request.modelId);
  const mediaKind = model?.kind ?? 'image';

  const stored: StoredRequest = {
    mode: request.mode,
    params: request.params,
    styleTags: request.styleTags,
    sourceImageDataUrl: request.sourceImageDataUrl,
    maskDataUrl: request.maskDataUrl,
  };

  const result = db
    .prepare(
      `INSERT INTO generation_queue
         (prompt, translated_prompt, model_id, params, estimated_cost, priority, media_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      request.prompt,
      request.translatedPrompt ?? null,
      request.modelId,
      JSON.stringify(stored),
      medianCostFor(request.modelId),
      0,
      mediaKind,
    );

  const queueItemId = Number(result.lastInsertRowid);
  clientIdMap.set(queueItemId, request.clientId);

  logger.log('generation', 'info', `Генерация #${queueItemId} добавлена в очередь`, {
    modelId: request.modelId,
    prompt: request.prompt.slice(0, 80),
  });

  processNext();
  return queueItemId;
}

function processNext(): void {
  if (!canProcessMore()) return;

  const db = getDatabase();
  const activeIds = Array.from(activeGenerations);
  let query = "SELECT * FROM generation_queue WHERE status = 'pending'";
  if (activeIds.length > 0) {
    query += ` AND id NOT IN (${activeIds.map(() => '?').join(',')})`;
  }
  query += ' ORDER BY priority DESC, created_at ASC LIMIT 1';

  const next = (
    activeIds.length > 0 ? db.prepare(query).get(...activeIds) : db.prepare(query).get()
  ) as DBQueueItem | undefined;

  if (!next) return;

  start(next, () => processItem(next));
  if (canProcessMore()) processNext();
}

/** Общая обвязка запуска: учёт активных, сигнал отмены, подхват следующей записи. */
function start(item: DBQueueItem, run: () => Promise<void>): void {
  activeGenerations.add(item.id);
  abortControllers.set(item.id, new AbortController());

  run().finally(() => {
    activeGenerations.delete(item.id);
    clientIdMap.delete(item.id);
    abortControllers.delete(item.id);
    processNext();
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Генерация отменена'));
      },
      { once: true },
    );
  });
}

/** Опрашивать задачу до завершения. Возвращает ссылки результата и списанные кредиты. */
async function pollUntilDone(
  taskId: string,
  kind: 'image' | 'video',
  signal: AbortSignal,
): Promise<{ urls: string[]; credits: number | null }> {
  const { intervalMs, timeoutMs } = pollTiming(kind);
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const task = await getTask(taskId, signal);

    if (task.state === 'success') {
      if (task.resultUrls.length === 0) throw new Error('kie.ai завершил задачу без результата');
      return { urls: task.resultUrls, credits: task.creditsConsumed };
    }

    if (task.state === 'fail') {
      throw new Error(task.failMessage ?? 'kie.ai отклонил задачу без объяснения');
    }

    if (Date.now() >= deadline) {
      // Прекращение опроса не останавливает генерацию: задача продолжает выполняться
      // на стороне сервиса, и деньги за неё спишутся. Врать об этом нельзя.
      throw new Error(
        'Превышено время ожидания. Задача, возможно, ещё выполняется на стороне kie.ai, и она будет оплачена.',
      );
    }

    await sleep(intervalMs, signal);
  }
}

function parseStored(raw: string | null): StoredRequest {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Partial<StoredRequest>;
      return {
        mode: record.mode ?? 'text2img',
        params: record.params ?? {},
        styleTags: record.styleTags,
        sourceImageDataUrl: record.sourceImageDataUrl,
        maskDataUrl: record.maskDataUrl,
      };
    }
  } catch {
    /* повреждённая запись очереди читается как пустая */
  }
  return { mode: 'text2img', params: {} };
}

/** Создать задачу на стороне сервиса и запомнить её идентификатор. */
async function createRemoteTask(item: DBQueueItem, signal: AbortSignal): Promise<string> {
  const db = getDatabase();
  const stored = parseStored(item.params);

  const model = getModelById(item.model_id);
  if (!model) {
    throw new Error(`Модель ${item.model_id} отсутствует в реестре. Обновите приложение.`);
  }

  const cfg = getConfig();
  let prompt = item.translated_prompt ?? item.prompt;
  if (cfg.promptAssistant.autoTranslate && isRussianText(item.prompt) && !item.translated_prompt) {
    try {
      prompt = await translatePrompt(item.prompt);
      db.prepare('UPDATE generation_queue SET translated_prompt = ? WHERE id = ?').run(
        prompt,
        item.id,
      );
      recordCost({
        imageId: null,
        generationId: null,
        modelId: cfg.promptAssistant.model,
        costUsd: TRANSLATE_ESTIMATED_COST_USD,
        costType: 'translate',
        tokensInput: item.prompt.length,
        tokensOutput: prompt.length,
        costSource: 'estimated',
      });
    } catch {
      prompt = item.prompt;
    }
  }

  // Референсы принимаются только ссылками, поэтому исходник заливается заранее
  let sourceUrl: string | undefined;
  if (needsSource(stored.mode) && stored.sourceImageDataUrl) {
    sourceUrl = await uploadDataUrl(stored.sourceImageDataUrl, signal);
  }

  let maskUrl: string | undefined;
  if (stored.mode === 'inpaint' && stored.maskDataUrl) {
    maskUrl = await uploadDataUrl(stored.maskDataUrl, signal);
  }

  const input = buildTaskInput(model, {
    prompt,
    modelId: item.model_id,
    mode: stored.mode,
    params: stored.params,
    sourceUrl,
    maskUrl,
  });

  const taskId = await createTask(item.model_id, input, signal);

  // Идентификатор сохраняется до первого опроса: приложение может закрыться в любой
  // момент, а задача на сервере продолжит выполняться и будет оплачена
  db.prepare('UPDATE generation_queue SET task_id = ? WHERE id = ?').run(taskId, item.id);

  return taskId;
}

/** Забрать готовый результат, положить на диск и записать в базу. */
async function storeResult(
  item: DBQueueItem,
  clientId: string,
  outcome: { urls: string[]; credits: number | null },
  startedAt: number,
  signal: AbortSignal,
): Promise<void> {
  const db = getDatabase();
  const stored = parseStored(item.params);
  const bytes = await downloadResult(outcome.urls[0], signal);

  const media = detectMedia(bytes);
  if (!media) throw new Error('kie.ai вернул файл, не распознанный как изображение или видео');

  const prompt = item.translated_prompt ?? item.prompt;

  const metadata: Record<string, string> = {
    prompt,
    original_prompt: item.prompt,
    model: item.model_id,
    style_tags: stored.styleTags?.join(',') ?? '',
    app_version: app.getVersion(),
    created_at: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(stored.params)) metadata[key] = String(value);

  const filePath = saveMedia(bytes, media.kind === 'image' ? metadata : null);
  const size = readImageSize(bytes);

  // Стоимость считается один раз и до вставки, чтобы одна генерация не получила разные
  // цены в галерее, в очереди и в сводке расходов — прямое требование по итогам блока C
  const actual = outcome.credits !== null ? creditsToUsd(outcome.credits) : null;
  const estimated = actual === null ? medianCostFor(item.model_id) : null;
  const cost = actual ?? estimated;
  const costSource: 'actual' | 'estimated' | 'unknown' =
    actual !== null ? 'actual' : estimated !== null ? 'estimated' : 'unknown';

  const insert = db
    .prepare(
      `INSERT INTO images
         (file_path, prompt, translated_prompt, model_id, mode, params, width, height,
          file_size, generation_id, generation_time_ms, cost_usd, media_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      filePath,
      item.prompt,
      item.translated_prompt,
      item.model_id,
      stored.mode,
      JSON.stringify(stored.params),
      size?.width ?? null,
      size?.height ?? null,
      getFileSize(filePath),
      item.task_id,
      Date.now() - startedAt,
      cost,
      media.kind,
    );

  const imageId = Number(insert.lastInsertRowid);
  saveImageTags(imageId, prompt, stored.styleTags, stored.mode);

  db.prepare(
    "UPDATE generation_queue SET status = 'completed', result_image_id = ?, actual_cost = ?, completed_at = datetime('now') WHERE id = ?",
  ).run(imageId, cost, item.id);

  recordCost({
    imageId,
    generationId: item.task_id,
    modelId: item.model_id,
    costUsd: cost ?? 0,
    costType: media.kind === 'video' ? 'video' : 'image',
    tokensInput: 0,
    tokensOutput: 0,
    costSource,
  });

  logger.log('generation', 'info', `Генерация #${item.id} завершена, imageId=${imageId}`, {
    modelId: item.model_id,
    costSource,
  });

  sendToRenderer('queue:item-completed', {
    clientId,
    queueItemId: item.id,
    result: {
      filePath,
      imageId,
      modelId: item.model_id,
      prompt: item.prompt,
      translatedPrompt: item.translated_prompt ?? undefined,
      params: stored.params,
      mediaKind: media.kind,
      width: size?.width ?? null,
      height: size?.height ?? null,
      costUsd: cost,
      costSource,
    },
  });

  sendToRenderer('queue:progress', { id: item.id, status: 'completed', resultImageId: imageId });
  if (actual !== null) sendToRenderer('cost:updated', { cost: actual, generationId: item.task_id });
}

function failItem(item: DBQueueItem, clientId: string, message: string): void {
  const db = getDatabase();
  logger.log('generation', 'error', `Генерация #${item.id} ошибка: ${message}`, {
    modelId: item.model_id,
  });
  db.prepare(
    "UPDATE generation_queue SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?",
  ).run(message, item.id);
  sendToRenderer('queue:item-failed', { clientId, queueItemId: item.id, error: message });
  sendToRenderer('queue:progress', { id: item.id, status: 'failed', error: message });
}

function cancelItem(item: DBQueueItem, clientId: string): void {
  const db = getDatabase();
  // Эндпоинта отмены у kie.ai нет: отменённая после отправки задача продолжает
  // выполняться и будет оплачена. Делать вид, что деньги сохранены, нельзя.
  const message = item.task_id
    ? 'Ожидание прекращено. Задача продолжает выполняться на kie.ai и будет оплачена.'
    : 'Генерация отменена';

  logger.log('generation', 'warn', `Генерация #${item.id} отменена`, { modelId: item.model_id });
  db.prepare(
    "UPDATE generation_queue SET status = 'cancelled', error_message = ?, completed_at = datetime('now') WHERE id = ?",
  ).run(message, item.id);
  sendToRenderer('queue:item-failed', { clientId, queueItemId: item.id, error: message });
  sendToRenderer('queue:progress', { id: item.id, status: 'cancelled' });
}

async function processItem(item: DBQueueItem): Promise<void> {
  const db = getDatabase();
  const clientId = clientIdMap.get(item.id) ?? '';
  const signal = abortControllers.get(item.id)!.signal;
  const startedAt = Date.now();
  const kind = item.media_kind === 'video' ? 'video' : 'image';

  try {
    db.prepare(
      "UPDATE generation_queue SET status = 'running', started_at = datetime('now') WHERE id = ?",
    ).run(item.id);
    sendToRenderer('queue:progress', { id: item.id, status: 'running' });

    const taskId = item.task_id ?? (await createRemoteTask(item, signal));
    const current = { ...item, task_id: taskId };

    const outcome = await pollUntilDone(taskId, kind, signal);
    await storeResult(current, clientId, outcome, startedAt, signal);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    const latest = getDatabase()
      .prepare('SELECT task_id FROM generation_queue WHERE id = ?')
      .get(item.id) as { task_id: string | null } | undefined;

    if (signal.aborted) cancelItem({ ...item, task_id: latest?.task_id ?? null }, clientId);
    else failItem(item, clientId, message);
  }
}

/**
 * Вернуть в опрос задачи, пережившие перезапуск приложения.
 *
 * Задача живёт на сервере и не зависит от процесса, который её создал: без этого шага
 * перезапуск во время генерации означал бы оплаченный и потерянный результат.
 */
export function resumeRunningTasks(): void {
  const rows = getDatabase()
    .prepare("SELECT * FROM generation_queue WHERE status = 'running' AND task_id IS NOT NULL")
    .all() as DBQueueItem[];

  for (const item of rows) {
    if (!canProcessMore()) break;
    logger.log('generation', 'info', `Возобновлён опрос задачи генерации #${item.id}`, {
      modelId: item.model_id,
    });
    start(item, () => processItem(item));
  }
}

/**
 * Повторить генерацию.
 *
 * Идентификатор прошлой задачи обязательно стирается: иначе повтор вернулся бы к опросу
 * уже завершившейся задачи и выдал бы её же результат — или её же отказ — вместо новой
 * генерации. И очередь надо разбудить: сама она просыпается только на отправку и на
 * завершение соседней записи.
 */
export function retryGeneration(queueItemId: number): void {
  getDatabase()
    .prepare(
      `UPDATE generation_queue
       SET status = 'pending', error_message = NULL, task_id = NULL,
           started_at = NULL, completed_at = NULL
       WHERE id = ? AND status IN ('failed', 'cancelled')`,
    )
    .run(queueItemId);

  processNext();
}

/** Отменить генерацию. Отправленную задачу это не останавливает и денег не возвращает. */
export function cancelGeneration(queueItemId: number): void {
  const controller = abortControllers.get(queueItemId);
  if (controller) {
    controller.abort();
    return;
  }

  const db = getDatabase();
  const item = db
    .prepare('SELECT * FROM generation_queue WHERE id = ?')
    .get(queueItemId) as DBQueueItem | undefined;

  if (item && item.status === 'pending') {
    cancelItem(item, clientIdMap.get(queueItemId) ?? '');
    clientIdMap.delete(queueItemId);
  }
}
