import fs from 'fs';
import path from 'path';
import { ipcMain, dialog, app, shell } from 'electron';
import { getConfig, updateConfig } from '../services/configManager';
import { getDatabase } from '../services/database';
import { logger } from '../services/logger';
import type { LogCategory } from '../services/logger';
import {
  translatePrompt,
  translateToRussian,
  promptAssist,
  promptFromImage,
} from '../services/openRouterClient';
import { getBalance, medianCostFor } from '../services/costHistory';
import {
  getAllModels,
  getAvailableModes,
  getDefaultModelId,
  getModelById,
  getModelsForMode,
} from '../services/kieRegistry';
import { readAsDataUrl } from '../services/dataUrl';
import { deleteImage, exportImage } from '../services/fileStorage';
import { readMetadataFromFile } from '../services/pngMetadata';
import {
  recordCost,
  getSpendingSummary,
  checkBudget,
  setBudget,
  PROMPT_ASSIST_ESTIMATED_COST_USD,
} from '../services/costTracker';
import { submitGeneration, cancelGeneration } from '../services/queueProcessor';
import type { KieQueueRequest } from '../services/queueProcessor';
import type { KieMode } from '../../src/shared/types/kie';
import type { GalleryQuery, ExportOptions } from '../../src/shared/types/ipc';
import type { DBBudgetConfig, DBImage, DBPreset } from '../../src/shared/types/database';

/** Allowed sort columns to prevent SQL injection */
const ALLOWED_SORT_COLUMNS: Record<string, boolean> = {
  created_at: true,
  cost_usd: true,
  file_size: true,
};

export function registerIpcHandlers(): void {
  logger.log('general', 'info', 'Registering IPC handlers');

  // ═══ Config ═══
  ipcMain.handle('config:get', () => getConfig());
  ipcMain.handle('config:set', (_, partial) => {
    logger.log('ipc', 'info', 'config:set', { keys: Object.keys(partial) });
    // Реестр моделей больше не зависит от ключа: он читается из файла, а не из API,
    // поэтому смена ключа ничего не перезапрашивает.
    return updateConfig(partial);
  });
  ipcMain.handle('config:get-images-path', () => getConfig().storage.imagesPath);

  // ═══ Generation ═══
  ipcMain.handle('generate:translate', async (_, text: string) => {
    return translatePrompt(text);
  });

  ipcMain.handle('generate:translate-to-ru', async (_, text: string) => {
    return translateToRussian(text);
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
      // Clear foreign key references before deleting
      db.prepare('UPDATE generation_queue SET result_image_id = NULL WHERE result_image_id = ?').run(id);
      db.prepare('DELETE FROM generation_costs WHERE image_id = ?').run(id);
      db.prepare('DELETE FROM image_tags WHERE image_id = ?').run(id);
      db.prepare('DELETE FROM collection_images WHERE image_id = ?').run(id);
      db.prepare('DELETE FROM images WHERE id = ?').run(id);
    }
  });

  ipcMain.handle('gallery:toggle-favorite', (_, id: number) => {
    const db = getDatabase();
    db.prepare('UPDATE images SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
    const result = db.prepare('SELECT is_favorite FROM images WHERE id = ?').get(id) as { is_favorite: number };
    return !!result?.is_favorite;
  });

  ipcMain.handle('gallery:set-prompt-ru', (_, id: number, promptRu: string) => {
    const db = getDatabase();
    db.prepare('UPDATE images SET prompt_ru = ? WHERE id = ?').run(promptRu, id);
  });

  ipcMain.handle('gallery:search', (_, searchText: string) => {
    const db = getDatabase();
    return db.prepare(
      `SELECT * FROM images WHERE id IN (SELECT rowid FROM images_fts WHERE images_fts MATCH ?) ORDER BY created_at DESC LIMIT 50`
    ).all(searchText) as DBImage[];
  });

  // ═══ Cost ═══
  ipcMain.handle('cost:get-balance', async () => {
    const balance = await getBalance();
    return { ...balance, lastChecked: new Date().toISOString() };
  });

  ipcMain.handle('cost:get-summary', (_, period) => getSpendingSummary(period));
  // Предварительной цены у kie.ai не существует — только медиана собственной истории
  ipcMain.handle('cost:estimate', (_, modelId: string) => medianCostFor(modelId));
  ipcMain.handle('cost:check-budget', () => checkBudget());
  ipcMain.handle('cost:set-budget', (_, limits: Partial<DBBudgetConfig>) => setBudget(limits));

  // ═══ Реестр моделей ═══
  // Реестр читается из файла, собранного скриптом из документации поставщика: обновлять
  // его в работающем приложении нечего, поэтому канала обновления больше нет.
  ipcMain.handle('catalog:list', () => getAllModels());
  ipcMain.handle('catalog:modes', () => getAvailableModes());
  ipcMain.handle('catalog:for-mode', (_, mode: KieMode) => getModelsForMode(mode));
  ipcMain.handle('catalog:default-model', (_, mode: KieMode) => getDefaultModelId(mode) ?? null);

  // ═══ File operations ═══
  ipcMain.handle('file:read-metadata', (_, filePath: string) => readMetadataFromFile(filePath));

  // Исходник, выбранный кнопкой «Обзор» или отправленный из галереи, доходит до API
  // только пройдя здесь: точки отправки принимают лишь data-URL
  ipcMain.handle('file:read-as-data-url', (_, ref: string) => readAsDataUrl(ref));
  ipcMain.handle('file:select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle('file:export', async (_, imageId: number, options: ExportOptions) => {
    const cfg = getConfig();
    const format = options.format || cfg.export.defaultFormat || 'png';
    const quality = options.quality ?? (format === 'jpeg' ? cfg.export.jpegQuality : undefined);

    logger.log('ipc', 'info', 'file:export', { imageId, format, quality });
    const db = getDatabase();
    const image = db.prepare('SELECT file_path FROM images WHERE id = ?').get(imageId) as { file_path: string } | undefined;
    if (!image) throw new Error('Image not found');

    if (!fs.existsSync(image.file_path)) {
      throw new Error(`Исходный файл не найден: ${image.file_path}`);
    }

    const ext = format === 'jpeg' ? 'jpg' : format;
    const defaultName = path.basename(image.file_path, path.extname(image.file_path)) + '.' + ext;

    const filterMap: Record<string, { name: string; extensions: string[] }> = {
      png: { name: 'PNG Image', extensions: ['png'] },
      jpeg: { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      webp: { name: 'WebP Image', extensions: ['webp'] },
    };

    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [filterMap[format]],
    });

    if (!result.filePath) return '';

    return exportImage(image.file_path, result.filePath, format, quality);
  });

  // ═══ Collections ═══
  ipcMain.handle('collections:list', () => {
    const db = getDatabase();
    return db.prepare('SELECT * FROM collections ORDER BY updated_at DESC').all();
  });

  ipcMain.handle('collections:create', (_, name: string, description?: string) => {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO collections (name, description) VALUES (?, ?)'
    ).run(name, description || null);
    return db.prepare('SELECT * FROM collections WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('collections:delete', (_, id: number) => {
    const db = getDatabase();
    db.prepare('DELETE FROM collection_images WHERE collection_id = ?').run(id);
    db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  });

  ipcMain.handle('collections:add-image', (_, collectionId: number, imageId: number) => {
    const db = getDatabase();
    db.prepare('INSERT OR IGNORE INTO collection_images (collection_id, image_id) VALUES (?, ?)').run(collectionId, imageId);
  });

  ipcMain.handle('collections:remove-image', (_, collectionId: number, imageId: number) => {
    const db = getDatabase();
    db.prepare('DELETE FROM collection_images WHERE collection_id = ? AND image_id = ?').run(collectionId, imageId);
  });

  ipcMain.handle('collections:images', (_, collectionId: number) => {
    const db = getDatabase();
    return db.prepare(
      'SELECT i.* FROM images i JOIN collection_images ci ON i.id = ci.image_id WHERE ci.collection_id = ? ORDER BY ci.added_at DESC'
    ).all(collectionId);
  });

  // ═══ Presets ═══
  ipcMain.handle('presets:list', () => {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM presets ORDER BY sort_order ASC').all() as DBPreset[];
    // Реестр всегда готов — он читается из файла, а не догружается по сети, поэтому
    // отсутствие модели теперь однозначно означает отсутствие, а не незавершённую загрузку.
    return rows.map((preset) => ({
      ...preset,
      modelAvailable: preset.model_id ? getModelById(preset.model_id) !== undefined : null,
    }));
  });

  ipcMain.handle('presets:create', (_, preset: any) => {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO presets (name, icon, model_id, params, style_tags, negative_prompt, is_builtin, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(preset.name, preset.icon, preset.model_id, preset.params, preset.style_tags, null, preset.is_builtin || 0, preset.sort_order || 0);
    return db.prepare('SELECT * FROM presets WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('presets:update', (_, id: number, updates: any) => {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length > 0) {
      db.prepare(`UPDATE presets SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    }
  });

  ipcMain.handle('presets:delete', (_, id: number) => {
    const db = getDatabase();
    db.prepare('DELETE FROM presets WHERE id = ?').run(id);
  });

  // ═══ Queue ═══
  ipcMain.handle('queue:list', () => {
    const db = getDatabase();
    return db.prepare('SELECT * FROM generation_queue ORDER BY created_at ASC').all();
  });

  ipcMain.handle('queue:add', (_, item: any) => {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO generation_queue (prompt, translated_prompt, model_id, params, negative_prompt, batch_group_id, estimated_cost, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(item.prompt, item.translated_prompt, item.model_id, item.params, null, item.batch_group_id, item.estimated_cost, item.priority || 0);
    return db.prepare('SELECT * FROM generation_queue WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('queue:cancel', (_, id: number) => {
    logger.log('ipc', 'info', 'queue:cancel', { queueItemId: id });
    cancelGeneration(id);
  });

  ipcMain.handle('queue:clear', () => {
    const db = getDatabase();
    db.prepare("DELETE FROM generation_queue WHERE status IN ('completed', 'failed', 'cancelled')").run();
  });

  ipcMain.handle('queue:retry', (_, id: number) => {
    const db = getDatabase();
    db.prepare("UPDATE generation_queue SET status = 'pending', error_message = NULL WHERE id = ?").run(id);
  });

  ipcMain.handle('queue:submit', (_, request: KieQueueRequest) => {
    logger.log('ipc', 'info', 'queue:submit', { modelId: request.modelId, mode: request.mode });
    const queueItemId = submitGeneration(request);
    return { queueItemId };
  });

  // ═══ File: select folder ═══
  ipcMain.handle('file:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle('file:open-folder', (_, folderPath: string) => {
    shell.openPath(folderPath);
  });

  // ═══ File: convert external image ═══
  ipcMain.handle('file:convert', async (_, sourcePath: string, format: 'png' | 'jpeg' | 'webp', quality?: number) => {
    logger.log('ipc', 'info', 'file:convert', { sourcePath, format, quality });

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Исходный файл не найден: ${sourcePath}`);
    }

    const ext = format === 'jpeg' ? 'jpg' : format;
    const defaultName = path.basename(sourcePath, path.extname(sourcePath)) + '.' + ext;

    const filterMap: Record<string, { name: string; extensions: string[] }> = {
      png: { name: 'PNG Image', extensions: ['png'] },
      jpeg: { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      webp: { name: 'WebP Image', extensions: ['webp'] },
    };

    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [filterMap[format]],
    });

    if (!result.filePath) return '';

    return exportImage(sourcePath, result.filePath, format, quality);
  });

  // ═══ File: batch convert ═══
  ipcMain.handle('file:convert-batch', async (_, sourcePaths: string[], destFolder: string, format: 'png' | 'jpeg' | 'webp', quality?: number) => {
    logger.log('ipc', 'info', 'file:convert-batch', { count: sourcePaths.length, destFolder, format, quality });

    const results: string[] = [];
    const ext = format === 'jpeg' ? 'jpg' : format;

    for (const sourcePath of sourcePaths) {
      if (!fs.existsSync(sourcePath)) {
        logger.log('ipc', 'warn', `Batch convert: file not found: ${sourcePath}`);
        results.push('');
        continue;
      }
      const baseName = path.basename(sourcePath, path.extname(sourcePath));
      const destPath = path.join(destFolder, `${baseName}.${ext}`);
      try {
        const exported = await exportImage(sourcePath, destPath, format, quality);
        results.push(exported);
      } catch (err) {
        logger.log('ipc', 'warn', `Batch convert failed: ${sourcePath}`, { error: err instanceof Error ? err.message : String(err) });
        results.push('');
      }
    }

    return results;
  });

  // ═══ Storage: migrate paths ═══
  ipcMain.handle('storage:migrate-paths', (_, _oldPath: string, newPath: string) => {
    const db = getDatabase();
    const path = require('path');
    // Get ALL images and update their directory to newPath, keeping filename
    const images = db.prepare('SELECT id, file_path FROM images').all() as Array<{ id: number; file_path: string }>;
    const update = db.prepare('UPDATE images SET file_path = ? WHERE id = ?');
    let count = 0;
    for (const img of images) {
      const fileName = path.basename(img.file_path);
      const newFilePath = path.join(newPath, fileName);
      if (newFilePath !== img.file_path) {
        update.run(newFilePath, img.id);
        count++;
      }
    }
    return { migrated: count };
  });

  // ═══ Analytics reset ═══
  ipcMain.handle('analytics:reset', () => {
    const db = getDatabase();
    db.prepare('DELETE FROM generation_costs').run();
    db.prepare('UPDATE images SET cost_usd = 0').run();
    db.prepare('DELETE FROM budget_config').run();
    return { success: true };
  });

  // ═══ Logs ═══
  ipcMain.handle('logs:get', (_, category?: LogCategory) => {
    return logger.getLogs(category);
  });

  ipcMain.handle('logs:clear', () => {
    logger.clearLogs();
  });

  // ═══ Debug ═══
  ipcMain.handle('debug:get-enabled', () => {
    return getConfig().debug.enabled;
  });

  ipcMain.handle('debug:set-enabled', (_, enabled: boolean) => {
    updateConfig({ debug: { enabled } });
    logger.log('general', 'info', enabled ? 'Debug mode enabled' : 'Debug mode disabled');
  });

  // ═══ App ═══
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:open-external', (_, url: string) => shell.openExternal(url));
}
