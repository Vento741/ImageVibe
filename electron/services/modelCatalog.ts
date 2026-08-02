import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type {
  CatalogRecord,
  EndpointRecord,
  ModelCategory,
  ParamSchema,
  PricingRow,
} from '../../src/shared/types/models';
import { intersectPassthrough, intersectSchemas, enumValues } from './catalogSchema';
import { bucketByPrice, estimateOutputImage, rowsFor, stepRank } from './catalogPricing';
import { getActiveApiKey } from './configManager';
import { logger } from './logger';

const BASE_URL = 'https://openrouter.ai/api/v1';
const CACHE_FILE = 'models-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ENDPOINT_CONCURRENCY = 6;
const CATALOG_TIMEOUT_MS = 30_000;

export interface CatalogModel {
  id: string;
  name: string;
  description: string;
  /** what every provider of this model accepts */
  schema: Record<string, ParamSchema>;
  passthrough: string[];
  pricing: PricingRow[];
  providerSlugs: string[];
  /** architecture.output_modalities of the catalog record — the only source for "returns text" */
  outputModalities: string[];
  category: ModelCategory;
  pricesLoaded: boolean;
}

interface CacheFile {
  fetchedAt: number;
  models: CatalogRecord[];
  endpoints: Record<string, EndpointRecord[]>;
}

type CatalogState = 'empty' | 'loading' | 'ready' | 'error';

let state: CatalogState = 'empty';
let lastError: string | undefined;
let fetchedAt = 0;
let records: CatalogRecord[] = [];
let endpointsById: Record<string, EndpointRecord[]> = {};
let pricesTask: Promise<void> = Promise.resolve();
let catalogRefreshTask: Promise<void> = Promise.resolve();
let cacheDirOverride: string | null = null;
let lastOnPricesUpdated: () => void = () => {};

/** Test seam: point the cache at a temp directory instead of userData. */
export function setCachePathForTests(dir: string): void {
  cacheDirOverride = dir;
}

/** Test seam: await the background price load. */
export function waitForPricesForTests(): Promise<void> {
  return pricesTask;
}

/** Test seam: await the background catalog refresh that runs behind a valid cache. */
export function waitForCatalogRefreshForTests(): Promise<void> {
  return catalogRefreshTask;
}

function cachePath(): string {
  return path.join(cacheDirOverride ?? app.getPath('userData'), CACHE_FILE);
}

function headers(): Record<string, string> {
  const apiKey = getActiveApiKey();
  if (!apiKey) throw new Error('API ключ не настроен');
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://imagevibe.app',
    'X-Title': 'ImageVibe',
  };
}

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: headers(), signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function readCache(): Promise<CacheFile | null> {
  try {
    const raw = await fs.promises.readFile(cachePath(), 'utf-8');
    const parsed = JSON.parse(raw) as CacheFile;
    if (!Array.isArray(parsed.models)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(): Promise<void> {
  const payload: CacheFile = { fetchedAt, models: records, endpoints: endpointsById };
  try {
    await fs.promises.writeFile(cachePath(), JSON.stringify(payload), 'utf-8');
  } catch (error) {
    logger.log('generation', 'warn', 'Не удалось записать кеш каталога', {
      error: String(error),
    });
  }
}

/** Fetch endpoint records for every model, at most ENDPOINT_CONCURRENCY at a time. */
async function loadEndpoints(onUpdated: () => void): Promise<void> {
  const queue = records.map((record) => record);
  let updated = false;

  async function worker(): Promise<void> {
    for (;;) {
      const record = queue.shift();
      if (!record) return;
      try {
        const response = await getJson<{ id: string; endpoints: EndpointRecord[] }>(
          `${BASE_URL}/images/models/${record.id}/endpoints`,
        );
        endpointsById[record.id] = response.endpoints ?? [];
        updated = true;
      } catch (error) {
        logger.log('generation', 'warn', `Не удалось получить эндпоинты: ${record.id}`, {
          error: String(error),
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ENDPOINT_CONCURRENCY, queue.length) }, () => worker()),
  );

  if (updated) {
    await writeCache();
    onUpdated();
  }
}

/**
 * A price used only to sort/bucket models against each other — never shown to the user as
 * an actual cost. Reduced to a common 1-megapixel basis via estimateOutputImage: that is the
 * only point where a flat per-image price and a per-megapixel rate become comparable (at
 * megapixels: 1 the megapixel rate equals the price of a hypothetical 1MP image). Picks the
 * cheapest declared resolution step by pixel count (stepRank), not by array order — the
 * order supported_parameters.resolution comes back in is whatever the API returned, not
 * necessarily ascending.
 */
function comparablePrice(model: CatalogModel): number | null {
  const steps = enumValues(model.schema, 'resolution') ?? [];
  const sorted = [...steps].sort((a, b) => stepRank(a) - stepRank(b));
  const step = sorted.length > 0 ? sorted[0] : null;
  return estimateOutputImage({
    pricing: model.pricing,
    step,
    declaredSteps: steps,
    megapixels: 1,
  }).amountUsd;
}

/**
 * Providers of one model may price differently. With no provider pinned any of them may
 * serve the request, so take the dearest — an estimate may overstate, never understate.
 */
function dearestPricing(endpoints: EndpointRecord[]): PricingRow[] {
  let chosen = endpoints[0].pricing;
  let best = -1;
  for (const endpoint of endpoints) {
    const top = rowsFor(endpoint.pricing, 'output_image').reduce(
      (max, row) => Math.max(max, row.cost_usd),
      -1,
    );
    if (top > best) {
      best = top;
      chosen = endpoint.pricing;
    }
  }
  return chosen;
}

function buildModels(): CatalogModel[] {
  const built = records.map((record) => {
    const endpoints = endpointsById[record.id];
    const hasEndpoints = Array.isArray(endpoints) && endpoints.length > 0;
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      schema: hasEndpoints ? intersectSchemas(endpoints) : record.supported_parameters,
      passthrough: hasEndpoints ? intersectPassthrough(endpoints) : [],
      pricing: hasEndpoints ? dearestPricing(endpoints) : [],
      providerSlugs: hasEndpoints ? endpoints.map((e) => e.provider_slug) : [],
      outputModalities: record.architecture?.output_modalities ?? [],
      category: 'quality' as ModelCategory,
      pricesLoaded: hasEndpoints,
    };
  });

  const buckets = bucketByPrice(
    built.map((model) => ({ id: model.id, price: comparablePrice(model) })),
  );
  for (const model of built) {
    model.category = buckets[model.id] ?? 'quality';
  }

  return built;
}

export function getAllModels(): CatalogModel[] {
  return buildModels();
}

export function getModelById(id: string): CatalogModel | undefined {
  return buildModels().find((model) => model.id === id);
}

export function getGroupedModels(): Array<{ category: ModelCategory; models: CatalogModel[] }> {
  const models = buildModels();
  const order: ModelCategory[] = ['fast', 'quality', 'smart'];
  return order
    .map((category) => ({ category, models: models.filter((m) => m.category === category) }))
    .filter((group) => group.models.length > 0);
}

/** The cheapest model whose price is known; no model id is written in code. */
export function getDefaultModelId(): string | undefined {
  const models = buildModels();
  if (models.length === 0) return undefined;
  const priced = models
    .map((model) => ({ id: model.id, price: comparablePrice(model) }))
    .filter((entry): entry is { id: string; price: number } => entry.price !== null)
    .sort((a, b) => a.price - b.price);
  return priced.length > 0 ? priced[0].id : models[0].id;
}

export function getCatalogStatus(): {
  state: CatalogState;
  error?: string;
  fetchedAt?: number;
  stale: boolean;
} {
  return {
    state,
    error: lastError,
    fetchedAt: fetchedAt || undefined,
    stale: fetchedAt > 0 && Date.now() - fetchedAt > CACHE_TTL_MS,
  };
}

async function fetchCatalog(onPricesUpdated: () => void): Promise<void> {
  const response = await getJson<{ data: CatalogRecord[] }>(`${BASE_URL}/images/models`);
  records = response.data ?? [];
  fetchedAt = Date.now();
  lastError = undefined;
  state = 'ready';
  await writeCache();
  pricesTask = loadEndpoints(onPricesUpdated);
}

/**
 * Load the cache, then refresh from the network.
 * When a cache exists it is good enough to serve immediately: the promise resolves right
 * after it is loaded, and the network refresh (and, through it, the price load) continues
 * in the background — see waitForCatalogRefreshForTests. Without a cache there is nothing
 * to serve yet, so the promise waits for the network and surfaces a network failure as
 * state: 'error' rather than a silent built-in fallback.
 */
export async function initCatalog(onPricesUpdated: () => void): Promise<void> {
  lastOnPricesUpdated = onPricesUpdated;
  state = 'loading';
  const cached = await readCache();

  if (cached) {
    // Merge, don't replace: a concurrent initCatalog/refreshCatalog call may already have
    // populated endpointsById in the background, and the cache must not wipe that out.
    endpointsById = { ...(cached.endpoints ?? {}), ...endpointsById };
    records = cached.models;
    fetchedAt = cached.fetchedAt;
    state = 'ready';

    catalogRefreshTask = fetchCatalog(onPricesUpdated).catch((error) => {
      lastError = String(error);
      logger.log('generation', 'warn', 'Каталог не обновлён, работаем на кеше', {
        error: lastError,
      });
    });
    return;
  }

  try {
    await fetchCatalog(onPricesUpdated);
  } catch (error) {
    lastError = String(error);
    state = 'error';
    records = [];
    endpointsById = {};
    logger.log('generation', 'error', 'Каталог моделей недоступен и кеша нет', {
      error: lastError,
    });
  }
}

/** Force a refresh, e.g. from settings. Reuses the callback initCatalog was started with. */
export async function refreshCatalog(): Promise<void> {
  await initCatalog(lastOnPricesUpdated);
  await pricesTask;
}
