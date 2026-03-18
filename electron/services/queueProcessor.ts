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
import type { GenerationRequest } from '../../src/shared/types/api';
import type { DBQueueItem } from '../../src/shared/types/database';

/** Maps queueItemId → clientId for routing events back to renderer */
const clientIdMap = new Map<number, string>();
let processing = false;

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

  // Kick off processing
  processNext();

  return queueItemId;
}

async function processNext(): Promise<void> {
  if (processing) return;

  const db = getDatabase();
  const next = db.prepare(
    "SELECT * FROM generation_queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 1"
  ).get() as DBQueueItem | undefined;

  if (!next) return;

  processing = true;
  const clientId = clientIdMap.get(next.id) ?? '';

  try {
    // Mark as running
    db.prepare("UPDATE generation_queue SET status = 'running', started_at = datetime('now') WHERE id = ?").run(next.id);

    sendToRenderer('queue:progress', {
      id: next.id,
      status: 'running',
    });

    // Parse stored params
    const params = JSON.parse(next.params || '{}');
    const request: GenerationRequest = {
      prompt: next.prompt,
      translatedPrompt: next.translated_prompt || undefined,
      negativePrompt: next.negative_prompt || undefined,
      modelId: next.model_id,
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

    // Generate image
    const genResult = await generateImage(request);

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

    // Update queue item
    db.prepare("UPDATE generation_queue SET status = 'completed', result_image_id = ?, completed_at = datetime('now') WHERE id = ?")
      .run(imageId, next.id);

    // Send completion event to renderer
    sendToRenderer('queue:item-completed', {
      clientId,
      queueItemId: next.id,
      result: { ...genResult, filePath, imageId },
    });

    sendToRenderer('queue:progress', {
      id: next.id,
      status: 'completed',
      resultImageId: imageId,
    });

    // Background cost fetch
    if (genResult.generationId) {
      fetchGenerationCostWithRetry(genResult.generationId).then((actualCost) => {
        const cost = actualCost || estimateCost(genResult.modelId, request.imageSize).estimatedCost;
        const costSource: 'actual' | 'estimated' = actualCost > 0 ? 'actual' : 'estimated';

        db.prepare('UPDATE images SET cost_usd = ? WHERE id = ?').run(cost, imageId);
        db.prepare('UPDATE generation_queue SET actual_cost = ? WHERE id = ?').run(cost, next.id);

        recordCost({
          imageId,
          generationId: genResult.generationId,
          modelId: genResult.modelId,
          costUsd: cost,
          costType: 'image',
          tokensInput: genResult.tokensInput ?? 0,
          tokensOutput: genResult.tokensOutput ?? 0,
          costSource,
        });

        sendToRenderer('cost:updated', { cost, generationId: genResult.generationId });
      }).catch(() => {
        const estimated = estimateCost(genResult.modelId, request.imageSize).estimatedCost;
        db.prepare('UPDATE images SET cost_usd = ? WHERE id = ?').run(estimated, imageId);
        recordCost({
          imageId,
          generationId: genResult.generationId,
          modelId: genResult.modelId,
          costUsd: estimated,
          costType: 'image',
          tokensInput: 0,
          tokensOutput: 0,
          costSource: 'estimated',
        });
      });
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';

    db.prepare("UPDATE generation_queue SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?")
      .run(errorMessage, next.id);

    sendToRenderer('queue:item-failed', {
      clientId,
      queueItemId: next.id,
      error: errorMessage,
    });

    sendToRenderer('queue:progress', {
      id: next.id,
      status: 'failed',
      error: errorMessage,
    });
  } finally {
    processing = false;
    clientIdMap.delete(next.id);

    // Process next item in queue
    processNext();
  }
}
