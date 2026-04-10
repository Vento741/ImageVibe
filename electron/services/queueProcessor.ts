import { BrowserWindow, app } from 'electron';
import { getDatabase } from './database';
import {
  generateImage,
  translatePrompt,
  isRussianText,
  fetchGenerationCostWithRetry,
} from './openRouterClient';
import { estimateCost } from './costEstimator';
import { saveImage, getFileSize } from './fileStorage';
import { saveImageTags } from './autoTagger';
import { recordCost, TRANSLATE_ESTIMATED_COST_USD } from './costTracker';
import { getConfig } from './configManager';
import { logger } from './logger';
import type { GenerationRequest } from '../../src/shared/types/api';
import type { DBQueueItem } from '../../src/shared/types/database';

/** Maps queueItemId → clientId for routing events back to renderer */
const clientIdMap = new Map<number, string>();

/** Maps queueItemId → AbortController for cancelling running generations */
const abortControllers = new Map<number, AbortController>();

/** Maximum number of concurrent image generations */
const MAX_CONCURRENT = 3;

/** Set of queue item IDs currently being processed */
const activeGenerations = new Set<number>();

function canProcessMore(): boolean {
  return activeGenerations.size < MAX_CONCURRENT;
}

function sendToRenderer(channel: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

/** Add a generation request to the DB queue and start processing */
export function submitGeneration(request: GenerationRequest & { clientId: string }): number {
  const db = getDatabase();
  const estimate = estimateCost(request.modelId, request.imageSize);

  const result = db.prepare(
    'INSERT INTO generation_queue (prompt, translated_prompt, model_id, params, negative_prompt, batch_group_id, estimated_cost, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    request.prompt,
    request.translatedPrompt || null,
    request.modelId,
    JSON.stringify({
      mode: request.mode,
      aspectRatio: request.aspectRatio,
      imageSize: request.imageSize,
      seed: request.seed,
      styleTags: request.styleTags,
      sourceImageBase64: request.sourceImageBase64,
      maskBase64: request.maskBase64,
    }),
    request.negativePrompt || null,
    null,
    estimate.estimatedCost,
    0,
  );

  const queueItemId = Number(result.lastInsertRowid);
  clientIdMap.set(queueItemId, request.clientId);

  logger.log('generation', 'info', `Генерация #${queueItemId} добавлена в очередь`, { modelId: request.modelId, prompt: request.prompt.slice(0, 80) });

  // Kick off processing
  processNext();

  return queueItemId;
}

function processNext(): void {
  if (!canProcessMore()) return;

  const db = getDatabase();

  // Exclude items already being processed
  const activeIds = Array.from(activeGenerations);
  let query = "SELECT * FROM generation_queue WHERE status = 'pending'";
  if (activeIds.length > 0) {
    const placeholders = activeIds.map(() => '?').join(',');
    query += ` AND id NOT IN (${placeholders})`;
  }
  query += ' ORDER BY priority DESC, created_at ASC LIMIT 1';

  const next = (activeIds.length > 0
    ? db.prepare(query).get(...activeIds)
    : db.prepare(query).get()
  ) as DBQueueItem | undefined;

  if (!next) return;

  // Track this generation as active
  activeGenerations.add(next.id);
  const clientId = clientIdMap.get(next.id) ?? '';

  // Create AbortController for this generation
  const abortController = new AbortController();
  abortControllers.set(next.id, abortController);

  // Launch the generation without awaiting — allows parallel execution
  processItem(next, clientId, abortController).finally(() => {
    activeGenerations.delete(next.id);
    clientIdMap.delete(next.id);
    abortControllers.delete(next.id);

    // Try to pick up the next pending item
    processNext();
  });

  // Immediately try to fill remaining concurrency slots
  if (canProcessMore()) {
    processNext();
  }
}

async function processItem(item: DBQueueItem, clientId: string, abortController: AbortController): Promise<void> {
  const db = getDatabase();

  try {
    logger.log('generation', 'info', `Генерация #${item.id} запущена`, { modelId: item.model_id });

    // Mark as running
    db.prepare("UPDATE generation_queue SET status = 'running', started_at = datetime('now') WHERE id = ?").run(item.id);

    sendToRenderer('queue:progress', {
      id: item.id,
      status: 'running',
    });

    // Parse stored params
    const params = JSON.parse(item.params || '{}');
    const request: GenerationRequest = {
      prompt: item.prompt,
      translatedPrompt: item.translated_prompt || undefined,
      negativePrompt: item.negative_prompt || undefined,
      modelId: item.model_id,
      mode: params.mode || 'text2img',
      aspectRatio: params.aspectRatio || '1:1',
      imageSize: params.imageSize || '1K',
      seed: params.seed,
      styleTags: params.styleTags,
      sourceImageBase64: params.sourceImageBase64,
      maskBase64: params.maskBase64,
    };

    // Auto-translate if Russian
    const cfg = getConfig();
    if (cfg.promptAssistant.autoTranslate && isRussianText(request.prompt) && !request.translatedPrompt) {
      try {
        request.translatedPrompt = await translatePrompt(request.prompt);
        recordCost({
          imageId: null,
          generationId: null,
          modelId: cfg.promptAssistant.model,
          costUsd: TRANSLATE_ESTIMATED_COST_USD,
          costType: 'translate',
          tokensInput: request.prompt.length,
          tokensOutput: request.translatedPrompt.length,
          costSource: 'estimated',
        });
      } catch {
        request.translatedPrompt = request.prompt;
      }
    }

    // Generate image (pass abort signal for timeout + cancellation)
    const genResult = await generateImage(request, abortController.signal);

    // Build metadata for PNG embedding
    const metadata: Record<string, string> = {
      prompt: genResult.prompt,
      original_prompt: request.prompt,
      model: genResult.modelId,
      seed: genResult.seed?.toString() ?? '',
      aspect_ratio: request.aspectRatio,
      image_size: request.imageSize,
      style_tags: request.styleTags?.join(',') ?? '',
      app_version: app.getVersion(),
      created_at: new Date().toISOString(),
    };
    if (genResult.translatedPrompt) metadata.translated_prompt = genResult.translatedPrompt;
    if (genResult.negativePrompt) metadata.negative_prompt = genResult.negativePrompt;

    // Save image to disk
    const filePath = saveImage(genResult.imageBase64, metadata);
    const fileSize = getFileSize(filePath);

    // Save to database
    const insertResult = db.prepare(`
      INSERT INTO images (file_path, prompt, translated_prompt, negative_prompt, model_id, mode, params, width, height, file_size, generation_id, generation_time_ms, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      filePath,
      request.prompt,
      genResult.translatedPrompt || null,
      genResult.negativePrompt || null,
      genResult.modelId,
      request.mode,
      JSON.stringify({ aspectRatio: request.aspectRatio, imageSize: request.imageSize, seed: genResult.seed, styleTags: request.styleTags }),
      genResult.width,
      genResult.height,
      fileSize,
      genResult.generationId,
      genResult.generationTimeMs,
      0,
    );
    const imageId = Number(insertResult.lastInsertRowid);

    // Auto-tag
    const promptForTags = genResult.translatedPrompt || request.prompt;
    saveImageTags(imageId, promptForTags, request.styleTags, request.mode);

    logger.log('generation', 'info', `Генерация #${item.id} завершена, imageId=${imageId}`, { modelId: item.model_id, generationTimeMs: genResult.generationTimeMs });

    // Update queue item
    db.prepare("UPDATE generation_queue SET status = 'completed', result_image_id = ?, completed_at = datetime('now') WHERE id = ?")
      .run(imageId, item.id);

    // Send completion event to renderer
    sendToRenderer('queue:item-completed', {
      clientId,
      queueItemId: item.id,
      result: { ...genResult, filePath, imageId },
    });

    sendToRenderer('queue:progress', {
      id: item.id,
      status: 'completed',
      resultImageId: imageId,
    });

    // Background cost fetch (fire-and-forget)
    if (genResult.generationId) {
      (async () => {
        let actualCost = 0;
        try {
          actualCost = await fetchGenerationCostWithRetry(genResult.generationId);
        } catch { /* use estimate as fallback */ }

        const cost = actualCost || estimateCost(genResult.modelId, request.imageSize).estimatedCost;
        const costSource: 'actual' | 'estimated' = actualCost > 0 ? 'actual' : 'estimated';

        db.prepare('UPDATE images SET cost_usd = ? WHERE id = ?').run(cost, imageId);
        db.prepare('UPDATE generation_queue SET actual_cost = ? WHERE id = ?').run(cost, item.id);

        recordCost({
          imageId,
          generationId: genResult.generationId,
          modelId: genResult.modelId,
          costUsd: cost,
          costType: 'image',
          tokensInput: costSource === 'actual' ? (genResult.tokensInput ?? 0) : 0,
          tokensOutput: costSource === 'actual' ? (genResult.tokensOutput ?? 0) : 0,
          costSource,
        });

        if (actualCost > 0) {
          sendToRenderer('cost:updated', { cost, generationId: genResult.generationId });
        }
      })();
    }
  } catch (err: unknown) {
    // Distinguish intentional cancellation from real errors
    if (abortController.signal.aborted) {
      logger.log('generation', 'warn', `Генерация #${item.id} отменена`, { modelId: item.model_id });
      db.prepare("UPDATE generation_queue SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?")
        .run(item.id);
      sendToRenderer('queue:item-failed', {
        clientId,
        queueItemId: item.id,
        error: 'Генерация отменена',
      });
      sendToRenderer('queue:progress', { id: item.id, status: 'cancelled' });
      return;
    }

    const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';

    logger.log('generation', 'error', `Генерация #${item.id} ошибка: ${errorMessage}`, { modelId: item.model_id });

    db.prepare("UPDATE generation_queue SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?")
      .run(errorMessage, item.id);

    sendToRenderer('queue:item-failed', {
      clientId,
      queueItemId: item.id,
      error: errorMessage,
    });

    sendToRenderer('queue:progress', {
      id: item.id,
      status: 'failed',
      error: errorMessage,
    });
  }
}

/** Cancel a running or pending generation by queue item ID */
export function cancelGeneration(queueItemId: number): void {
  const db = getDatabase();
  const clientId = clientIdMap.get(queueItemId) ?? '';

  // If it's currently running, abort the fetch
  const controller = abortControllers.get(queueItemId);
  if (controller) {
    logger.log('generation', 'warn', `Отмена активной генерации #${queueItemId}`);
    controller.abort();
    // The processItem catch block will handle status update and events
    return;
  }

  // If it's pending (not yet started), just update the DB
  const item = db.prepare('SELECT status FROM generation_queue WHERE id = ?').get(queueItemId) as { status: string } | undefined;
  if (item && item.status === 'pending') {
    logger.log('generation', 'warn', `Отмена ожидающей генерации #${queueItemId}`);
    db.prepare("UPDATE generation_queue SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?").run(queueItemId);

    sendToRenderer('queue:item-failed', {
      clientId,
      queueItemId,
      error: 'Генерация отменена',
    });

    sendToRenderer('queue:progress', {
      id: queueItemId,
      status: 'cancelled',
    });

    clientIdMap.delete(queueItemId);
  }
}
