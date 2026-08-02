import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerationRequest, GenerationResult } from '../src/shared/types/api';
import type { DBQueueItem } from '../src/shared/types/database';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getVersion: () => '0.0.0' },
}));

type Call = { sql: string; args: unknown[] };
let runCalls: Call[] = [];
let pendingItem: DBQueueItem | undefined;

function makeFakeDb() {
  return {
    prepare: (sql: string) => ({
      run: (...args: unknown[]) => {
        runCalls.push({ sql, args });
        return { lastInsertRowid: 42 };
      },
      get: () => {
        // Serve the synthetic pending item exactly once, then stop the queue loop.
        if (sql.includes("WHERE status = 'pending'") && pendingItem) {
          const item = pendingItem;
          pendingItem = undefined;
          return item;
        }
        return undefined;
      },
      all: () => [],
    }),
  };
}

function insertCallsFor(pattern: string): Call[] {
  return runCalls.filter((c) => c.sql.includes(pattern));
}

vi.mock('../electron/services/database', () => ({ getDatabase: () => makeFakeDb() }));
vi.mock('../electron/services/costEstimator', () => ({ estimateCost: vi.fn() }));
vi.mock('../electron/services/openRouterClient', () => ({
  generateImage: vi.fn(),
  translatePrompt: vi.fn(),
  isRussianText: vi.fn(() => false),
  fetchGenerationCostWithRetry: vi.fn(),
}));
vi.mock('../electron/services/fileStorage', () => ({
  saveImage: vi.fn(() => '/tmp/x.png'),
  getFileSize: vi.fn(() => 1234),
}));
vi.mock('../electron/services/autoTagger', () => ({ saveImageTags: vi.fn() }));
vi.mock('../electron/services/costTracker', () => ({
  recordCost: vi.fn(),
  TRANSLATE_ESTIMATED_COST_USD: 0,
}));
vi.mock('../electron/services/configManager', () => ({
  getConfig: () => ({ promptAssistant: { autoTranslate: false } }),
}));
vi.mock('../electron/services/logger', () => ({ logger: { log: () => {} } }));

const request: GenerationRequest & { clientId: string } = {
  prompt: 'a cat',
  modelId: 'flux',
  mode: 'text2img',
  aspectRatio: '1:1',
  imageSize: '1K',
  clientId: 'client-1',
};

const genResult: GenerationResult = {
  imageBase64: 'BASE64DATA',
  generationId: 'gen-123',
  modelId: 'flux',
  prompt: 'a cat',
  width: 1024,
  height: 1024,
  costUsd: 0,
  costSource: 'estimated',
  generationTimeMs: 1000,
};

function makePendingItem(): DBQueueItem {
  return {
    id: 1,
    prompt: 'a cat',
    translated_prompt: null,
    model_id: 'flux',
    params: JSON.stringify({ mode: 'text2img', aspectRatio: '1:1', imageSize: '1K' }),
    negative_prompt: null,
    batch_group_id: null,
    status: 'pending',
    result_image_id: null,
    error_message: null,
    estimated_cost: null,
    actual_cost: null,
    priority: 0,
    created_at: '',
    started_at: null,
    completed_at: null,
  };
}

beforeEach(() => {
  runCalls = [];
  pendingItem = undefined;
  vi.clearAllMocks();
});

describe('submitGeneration', () => {
  it('writes an unknown estimate to the queue as null, not zero', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    vi.mocked(estimateCost).mockReturnValue({ estimatedCost: null, basis: 'unknown', pricing: [] });

    const { submitGeneration } = await import('../electron/services/queueProcessor');
    submitGeneration(request);

    const inserts = insertCallsFor('INSERT INTO generation_queue');
    expect(inserts).toHaveLength(1);
    // Column order: prompt, translated_prompt, model_id, params, negative_prompt,
    // batch_group_id, estimated_cost, priority — estimated_cost is index 6.
    expect(inserts[0].args[6]).toBeNull();
  });

  it('writes a known estimate through unchanged', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    vi.mocked(estimateCost).mockReturnValue({ estimatedCost: 0.33, basis: 'point', pricing: [] });

    const { submitGeneration } = await import('../electron/services/queueProcessor');
    submitGeneration(request);

    const inserts = insertCallsFor('INSERT INTO generation_queue');
    expect(inserts[0].args[6]).toBe(0.33);
  });
});

describe('background cost fetch after a generation completes', () => {
  it('falls back to the estimate — not zero — when the actual cost cannot be determined', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    const { generateImage, fetchGenerationCostWithRetry } = await import(
      '../electron/services/openRouterClient'
    );
    const { recordCost } = await import('../electron/services/costTracker');

    vi.mocked(estimateCost).mockReturnValue({ estimatedCost: 0.05, basis: 'point', pricing: [] });
    vi.mocked(generateImage).mockResolvedValue(genResult);
    vi.mocked(fetchGenerationCostWithRetry).mockResolvedValue(null);

    pendingItem = makePendingItem();
    const { submitGeneration } = await import('../electron/services/queueProcessor');
    submitGeneration(request);

    await vi.waitFor(() => expect(recordCost).toHaveBeenCalled());

    expect(recordCost).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: 0.05, costSource: 'estimated' }),
    );
  });

  it('preserves a genuine zero actual cost instead of overwriting it with the estimate', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    const { generateImage, fetchGenerationCostWithRetry } = await import(
      '../electron/services/openRouterClient'
    );
    const { recordCost } = await import('../electron/services/costTracker');

    vi.mocked(estimateCost).mockReturnValue({ estimatedCost: 0.05, basis: 'point', pricing: [] });
    vi.mocked(generateImage).mockResolvedValue(genResult);
    vi.mocked(fetchGenerationCostWithRetry).mockResolvedValue(0);

    pendingItem = makePendingItem();
    const { submitGeneration } = await import('../electron/services/queueProcessor');
    submitGeneration(request);

    await vi.waitFor(() => expect(recordCost).toHaveBeenCalled());

    expect(recordCost).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: 0, costSource: 'actual' }),
    );
  });
});
