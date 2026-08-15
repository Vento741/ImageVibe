import type { KieMode, KieModel, KieParams } from './kie';
import type { AppConfig } from './config';
import type {
  DBBudgetConfig,
  DBCollection,
  DBImage,
  DBPreset,
  DBQueueItem,
} from './database';
import type { LogCategory, LogEntry } from './logging';


/** IPC channel definitions: main ↔ renderer */
export interface IpcChannels {
  // ═══ Config ═══
  'config:get': { args: []; result: AppConfig };
  'config:set': { args: [Partial<AppConfig>]; result: void };
  'config:get-images-path': { args: []; result: string };

  // ═══ Generation ═══
  'generate:translate': { args: [string]; result: string };
  'generate:translate-to-ru': { args: [string]; result: string };
  'generate:prompt-assist': {
    args: [string, 'generate' | 'enhance' | 'rephrase'];
    result: string;
  };
  'generate:prompt-from-image': { args: [string]; result: string };

  // ═══ Gallery ═══
  'gallery:list': {
    args: [GalleryQuery];
    result: { images: DBImage[]; total: number };
  };
  'gallery:get': { args: [number]; result: DBImage | null };
  'gallery:delete': { args: [number]; result: void };
  'gallery:toggle-favorite': { args: [number]; result: boolean };
  'gallery:search': {
    args: [string];
    result: DBImage[];
  };
  'gallery:set-prompt-ru': { args: [number, string]; result: void };

  // ═══ Collections ═══
  'collections:list': { args: []; result: DBCollection[] };
  'collections:create': { args: [string, string?]; result: DBCollection };
  'collections:delete': { args: [number]; result: void };
  'collections:add-image': { args: [number, number]; result: void };
  'collections:remove-image': { args: [number, number]; result: void };
  'collections:images': {
    args: [number];
    result: DBImage[];
  };

  // ═══ Cost ═══
  'cost:get-balance': { args: []; result: CreditBalance };
  'cost:get-summary': { args: [CostPeriod?]; result: SpendingSummary };
  /** Предварительной цены у kie.ai не существует — только медиана собственной истории */
  'cost:estimate': { args: [string]; result: number | null };
  'cost:check-budget': { args: []; result: BudgetStatus };
  'cost:set-budget': { args: [Partial<DBBudgetConfig>]; result: void };
  'cost:export': {
    args: [string, string, 'csv' | 'json'];
    result: string;
  };

  // ═══ Presets ═══
  'presets:list': { args: []; result: PresetWithAvailability[] };
  'presets:create': { args: [Omit<DBPreset, 'id' | 'created_at'>]; result: DBPreset };
  'presets:update': { args: [number, Partial<DBPreset>]; result: void };
  'presets:delete': { args: [number]; result: void };

  // ═══ Queue ═══
  'queue:list': { args: []; result: DBQueueItem[] };
  'queue:add': {
    args: [Omit<DBQueueItem, 'id' | 'status' | 'created_at' | 'started_at' | 'completed_at' | 'result_image_id' | 'error_message' | 'actual_cost'>];
    result: DBQueueItem;
  };
  'queue:submit': {
    args: [QueueSubmitRequest];
    result: { queueItemId: number };
  };
  'queue:cancel': { args: [number]; result: void };
  'queue:clear': { args: []; result: void };
  'queue:retry': { args: [number]; result: void };

  // ═══ File operations ═══
  'file:save-image': {
    args: [string, Record<string, string>];
    result: string;
  };
  /** Путь или ссылка local-file:// → data-URL. Иначе исходник до API не доходит. */
  'file:read-as-data-url': { args: [string]; result: string };
  'file:read-metadata': {
    args: [string];
    result: Record<string, string> | null;
  };
  'file:open-folder': { args: [string]; result: void };
  'file:select-image': { args: []; result: string | null };
  'file:select-folder': { args: []; result: string | null };
  'file:export': {
    args: [number, ExportOptions];
    result: string;
  };
  'file:convert': {
    args: [string, 'png' | 'jpeg' | 'webp', number?];
    result: string;
  };
  'file:convert-batch': {
    args: [string[], string, 'png' | 'jpeg' | 'webp', number?];
    result: string[];
  };

  // ═══ Storage ═══
  'storage:migrate-paths': { args: [string, string]; result: { migrated: number } };

  // ═══ Analytics ═══
  'analytics:reset': { args: []; result: { success: boolean } };

  // ═══ Benchmark ═══

  // ═══ Реестр моделей ═══
  'catalog:list': { args: []; result: KieModel[] };
  'catalog:modes': { args: []; result: KieMode[] };
  'catalog:for-mode': { args: [KieMode]; result: KieModel[] };
  'catalog:default-model': { args: [KieMode]; result: string | null };

  // ═══ Logs ═══
  'logs:get': { args: [LogCategory?]; result: LogEntry[] };
  'logs:clear': { args: []; result: void };

  // ═══ Debug ═══
  'debug:get-enabled': { args: []; result: boolean };
  'debug:set-enabled': { args: [boolean]; result: void };

  // ═══ App ═══
  'app:get-version': { args: []; result: string };
  'app:open-external': { args: [string]; result: void };
}

/** Gallery query params */
export interface GalleryQuery {
  offset: number;
  limit: number;
  search?: string;
  modelId?: string;
  mode?: string;
  isFavorite?: boolean;
  tags?: string[];
  collectionId?: number;
  sortBy?: 'created_at' | 'cost_usd' | 'file_size';
  sortDir?: 'asc' | 'desc';
}

/** Export options */
export interface ExportOptions {
  format: 'png' | 'jpeg' | 'webp';
  quality?: number;
}

/**
 * Остаток на счету kie.ai.
 *
 * `usd` — верхняя граница: при покупке пакетами даются бонусные кредиты, поэтому
 * эффективная цена кредита ниже объявленных $0.005.
 */
export interface CreditBalance {
  credits: number;
  usd: number;
  lastChecked: string;
}

/** Cost period for summaries */
export type CostPeriod = 'day' | 'week' | 'month' | 'all';

/** Spending summary */
export interface SpendingSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  allTime: number;
  generationCount: number;
  averageCost: number;
  costByModel: Array<{
    modelId: string;
    modelName: string;
    cost: number;
    count: number;
  }>;
  costByType: Array<{
    type: string;
    cost: number;
    count: number;
  }>;
}

/**
 * Строка пресета с проверкой модели по реестру.
 *
 * Реестр читается из файла и всегда готов, поэтому `false` теперь однозначно означает
 * «такой модели нет». `null` остаётся только у пресета без модели — у встроенных она
 * снята миграцией, потому что они ссылались на модели OpenRouter.
 */
export interface PresetWithAvailability extends DBPreset {
  modelAvailable: boolean | null;
}

/** Запрос генерации, как он пересекает границу процессов */
export interface QueueSubmitRequest {
  prompt: string;
  translatedPrompt?: string;
  modelId: string;
  mode: KieMode;
  params: KieParams;
  /** Исходник только в виде data-URL: путь и ссылка на файл до API не доходят */
  sourceImageDataUrl?: string;
  maskDataUrl?: string;
  styleTags?: string[];
  clientId: string;
}

/** Результат генерации, как он приходит в интерфейс */
export interface QueueResult {
  filePath: string;
  imageId: number;
  modelId: string;
  prompt: string;
  translatedPrompt?: string;
  params: KieParams;
  mediaKind: 'image' | 'video';
  width: number | null;
  height: number | null;
  costUsd: number | null;
  costSource: 'actual' | 'estimated' | 'unknown';
}

/** Budget status */
export interface BudgetStatus {
  dailyUsed: number;
  dailyLimit: number | null;
  weeklyUsed: number;
  weeklyLimit: number | null;
  monthlyUsed: number;
  monthlyLimit: number | null;
  warningThreshold: number;
  hardStop: boolean;
  isOverBudget: boolean;
  warnings: string[];
}

/** Events emitted from main to renderer */
export interface IpcEvents {
  'cost:updated': { cost: number; generationId: string };
  'queue:progress': {
    id: number;
    status: DBQueueItem['status'];
    resultImageId?: number;
    error?: string;
  };
  'queue:item-completed': {
    clientId: string;
    queueItemId: number;
    result: QueueResult;
  };
  'queue:item-failed': {
    clientId: string;
    queueItemId: number;
    error: string;
  };
  'generation:progress': { stage: string; percent: number };
  'catalog:updated': undefined;
}
