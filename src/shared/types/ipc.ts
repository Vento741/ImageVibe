import type { GenerationRequest, GenerationResult } from './api';
import type { AppConfig } from './config';
import type {
  DBBudgetConfig,
  DBCollection,
  DBImage,
  DBPreset,
  DBQueueItem,
} from './database';

/** IPC channel definitions: main ↔ renderer */
export interface IpcChannels {
  // ═══ Config ═══
  'config:get': { args: []; result: AppConfig };
  'config:set': { args: [Partial<AppConfig>]; result: void };
  'config:get-images-path': { args: []; result: string };

  // ═══ Generation ═══
  'generate:image': { args: [GenerationRequest]; result: GenerationResult };
  'generate:translate': { args: [string]; result: string };
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
  'cost:estimate': {
    args: [string, Record<string, unknown>?];
    result: CostEstimate;
  };
  'cost:check-budget': { args: []; result: BudgetStatus };
  'cost:set-budget': { args: [Partial<DBBudgetConfig>]; result: void };
  'cost:export': {
    args: [string, string, 'csv' | 'json'];
    result: string;
  };

  // ═══ Presets ═══
  'presets:list': { args: []; result: DBPreset[] };
  'presets:create': { args: [Omit<DBPreset, 'id' | 'created_at'>]; result: DBPreset };
  'presets:update': { args: [number, Partial<DBPreset>]; result: void };
  'presets:delete': { args: [number]; result: void };

  // ═══ Queue ═══
  'queue:list': { args: []; result: DBQueueItem[] };
  'queue:add': {
    args: [Omit<DBQueueItem, 'id' | 'status' | 'created_at' | 'started_at' | 'completed_at' | 'result_image_id' | 'error_message' | 'actual_cost'>];
    result: DBQueueItem;
  };
  'queue:cancel': { args: [number]; result: void };
  'queue:clear': { args: []; result: void };
  'queue:retry': { args: [number]; result: void };

  // ═══ File operations ═══
  'file:save-image': {
    args: [string, Record<string, string>];
    result: string;
  };
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
  width?: number;
  height?: number;
  embedMetadata?: boolean;
}

/** Credit balance from OpenRouter */
export interface CreditBalance {
  totalCredits: number;
  totalUsage: number;
  balance: number;
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

/** Cost estimate before generation */
export interface CostEstimate {
  estimatedCost: number;
  confidence: 'exact' | 'approximate';
  modelPricing: {
    perImage?: number;
    perMegapixel?: number;
    perToken?: number;
  };
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
  'generation:progress': { stage: string; percent: number };
}
