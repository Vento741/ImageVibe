import { ipcMain, dialog, BrowserWindow, app, shell } from 'electron';
import { getConfig, updateConfig } from '../services/configManager';
import { getDatabase } from '../services/database';
import {
  generateImage,
  translatePrompt,
  promptAssist,
  promptFromImage,
  fetchCredits,
  fetchGenerationCostWithRetry,
  isRussianText,
} from '../services/openRouterClient';
import { estimateCost } from '../services/costEstimator';
import { saveImageTags } from '../services/autoTagger';
import { saveImage, deleteImage, getFileSize } from '../services/fileStorage';
import { readMetadataFromFile } from '../services/pngMetadata';
import {
  recordCost,
  getSpendingSummary,
  checkBudget,
  setBudget,
  TRANSLATE_ESTIMATED_COST_USD,
  PROMPT_ASSIST_ESTIMATED_COST_USD,
} from '../services/costTracker';
import type { GenerationRequest } from '../../src/shared/types/api';
import type { GalleryQuery } from '../../src/shared/types/ipc';
import type { DBBudgetConfig, DBImage } from '../../src/shared/types/database';

/** Allowed sort columns to prevent SQL injection */
const ALLOWED_SORT_COLUMNS: Record<string, boolean> = {
  created_at: true,
  cost_usd: true,
  file_size: true,
};

export function registerIpcHandlers(): void {
  // ═══ Config ═══
  ipcMain.handle('config:get', () => getConfig());
  ipcMain.handle('config:set', (_, partial) => updateConfig(partial));
  ipcMain.handle('config:get-images-path', () => getConfig().storage.imagesPath);

  // ═══ Generation ═══
  ipcMain.handle('generate:image', async (_event, request: GenerationRequest) => {
    const config = getConfig();

    // Auto-translate if Russian
    if (config.promptAssistant.autoTranslate && isRussianText(request.prompt)) {
      try {
        request.translatedPrompt = await translatePrompt(request.prompt);

        recordCost({
          imageId: null,
          generationId: null,
          modelId: config.promptAssistant.model,
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
    const result = await generateImage(request);

    // Build metadata for PNG embedding
    const metadata: Record<string, string> = {
      prompt: result.prompt,
      original_prompt: request.prompt,
      model: result.modelId,
      seed: result.seed?.toString() ?? '',
      aspect_ratio: request.aspectRatio,
      image_size: request.imageSize,
      style_tags: request.styleTags?.join(',') ?? '',
      app_version: app.getVersion(),
      created_at: new Date().toISOString(),
    };
    if (result.translatedPrompt) metadata.translated_prompt = result.translatedPrompt;
    if (result.negativePrompt) metadata.negative_prompt = result.negativePrompt;

    // Save image to disk
    const filePath = saveImage(result.imageBase64, metadata);
    const fileSize = getFileSize(filePath);

    // Save to database
    const db = getDatabase();
    const insertResult = db.prepare(`
      INSERT INTO images (file_path, prompt, translated_prompt, negative_prompt, model_id, mode, params, width, height, file_size, generation_id, generation_time_ms, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      filePath,
      request.prompt,
      result.translatedPrompt || null,
      result.negativePrompt || null,
      result.modelId,
      request.mode,
      JSON.stringify({ aspectRatio: request.aspectRatio, imageSize: request.imageSize, seed: result.seed, styleTags: request.styleTags }),
      result.width,
      result.height,
      fileSize,
      result.generationId,
      result.generationTimeMs,
      0,
    );
    const imageId = Number(insertResult.lastInsertRowid);

    // Auto-tag the image
    const promptForTags = result.translatedPrompt || request.prompt;
    saveImageTags(imageId, promptForTags, request.styleTags, request.mode);

    // Fetch actual cost in background
    if (result.generationId) {
      fetchGenerationCostWithRetry(result.generationId).then((actualCost) => {
        const cost = actualCost || estimateCost(result.modelId, request.imageSize).estimatedCost;
        const costSource: 'actual' | 'estimated' = actualCost > 0 ? 'actual' : 'estimated';

        db.prepare('UPDATE images SET cost_usd = ? WHERE id = ?').run(cost, imageId);

        recordCost({
          imageId,
          generationId: result.generationId,
          modelId: result.modelId,
          costUsd: cost,
          costType: 'image',
          tokensInput: result.tokensInput ?? 0,
          tokensOutput: result.tokensOutput ?? 0,
          costSource,
        });

        // Notify renderer
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send('cost:updated', { cost, generationId: result.generationId });
        }
      }).catch(() => {
        const estimated = estimateCost(result.modelId, request.imageSize).estimatedCost;
        db.prepare('UPDATE images SET cost_usd = ? WHERE id = ?').run(estimated, imageId);
        recordCost({
          imageId,
          generationId: result.generationId,
          modelId: result.modelId,
          costUsd: estimated,
          costType: 'image',
          tokensInput: 0,
          tokensOutput: 0,
          costSource: 'estimated',
        });
      });
    }

    return { ...result, filePath, imageId };
  });

  ipcMain.handle('generate:translate', async (_, text: string) => {
    return translatePrompt(text);
  });

  ipcMain.handle('generate:prompt-assist', async (_, input: string, action: 'generate' | 'enhance' | 'rephrase') => {
    const result = await promptAssist(input, action);
    const config = getConfig();
    recordCost({
      imageId: null, generationId: null,
      modelId: config.promptAssistant.model,
      costUsd: PROMPT_ASSIST_ESTIMATED_COST_USD,
      costType: 'prompt_ai',
      tokensInput: input.length, tokensOutput: result.length,
      costSource: 'estimated',
    });
    return result;
  });

  ipcMain.handle('generate:prompt-from-image', async (_, imageBase64: string) => {
    return promptFromImage(imageBase64);
  });

  // ═══ Gallery ═══
  ipcMain.handle('gallery:list', (_, query: GalleryQuery) => {
    const db = getDatabase();
    let where = 'WHERE 1=1';
    const params: unknown[] = [];

    if (query.search) {
      where += ` AND id IN (SELECT rowid FROM images_fts WHERE images_fts MATCH ?)`;
      params.push(query.search);
    }
    if (query.modelId) { where += ` AND model_id = ?`; params.push(query.modelId); }
    if (query.mode) { where += ` AND mode = ?`; params.push(query.mode); }
    if (query.isFavorite) { where += ` AND is_favorite = 1`; }

    // Whitelist sort columns to prevent SQL injection
    const sortBy = ALLOWED_SORT_COLUMNS[query.sortBy ?? ''] ? query.sortBy! : 'created_at';
    const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';

    const total = (db.prepare(`SELECT COUNT(*) as count FROM images ${where}`).get(...params) as { count: number }).count;
    const images = db.prepare(
      `SELECT * FROM images ${where} ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`
    ).all(...params, query.limit, query.offset) as DBImage[];

    return { images, total };
  });

  ipcMain.handle('gallery:get', (_, id: number) => {
    const db = getDatabase();
    return db.prepare('SELECT * FROM images WHERE id = ?').get(id) as DBImage | null;
  });

  ipcMain.handle('gallery:delete', (_, id: number) => {
    const db = getDatabase();
    const image = db.prepare('SELECT file_path FROM images WHERE id = ?').get(id) as { file_path: string } | undefined;
    if (image) {
      deleteImage(image.file_path);
      db.prepare('DELETE FROM images WHERE id = ?').run(id);
    }
  });

  ipcMain.handle('gallery:toggle-favorite', (_, id: number) => {
    const db = getDatabase();
    db.prepare('UPDATE images SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
    const result = db.prepare('SELECT is_favorite FROM images WHERE id = ?').get(id) as { is_favorite: number };
    return !!result?.is_favorite;
  });

  ipcMain.handle('gallery:search', (_, searchText: string) => {
    const db = getDatabase();
    return db.prepare(
      `SELECT * FROM images WHERE id IN (SELECT rowid FROM images_fts WHERE images_fts MATCH ?) ORDER BY created_at DESC LIMIT 50`
    ).all(searchText) as DBImage[];
  });

  // ═══ Cost ═══
  ipcMain.handle('cost:get-balance', async () => {
    const credits = await fetchCredits();
    return { ...credits, lastChecked: new Date().toISOString() };
  });

  ipcMain.handle('cost:get-summary', (_, period) => getSpendingSummary(period));
  ipcMain.handle('cost:estimate', (_, modelId, _params) => estimateCost(modelId));
  ipcMain.handle('cost:check-budget', () => checkBudget());
  ipcMain.handle('cost:set-budget', (_, limits: Partial<DBBudgetConfig>) => setBudget(limits));

  // ═══ File operations ═══
  ipcMain.handle('file:read-metadata', (_, filePath: string) => readMetadataFromFile(filePath));
  ipcMain.handle('file:select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    return result.filePaths[0] || null;
  });

  // ═══ App ═══
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:open-external', (_, url: string) => shell.openExternal(url));
}
