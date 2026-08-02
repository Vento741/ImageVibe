import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DBPreset } from '../src/shared/types/database';

// registerIpcHandlers() pulls in most of electron/services/*; only presets:list is under
// test here, so every other dependency gets a harmless stub. See tests/queueProcessor.test.ts
// for the same pattern applied to a smaller file.

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, listener);
    },
  },
  dialog: {},
  BrowserWindow: { getAllWindows: () => [] },
  app: { getVersion: () => '0.0.0', getPath: () => '/tmp' },
  shell: {},
}));

let presetRows: DBPreset[] = [];

vi.mock('../electron/services/database', () => ({
  getDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => (sql.includes('FROM presets') ? presetRows : []),
    }),
  }),
}));

// Controlled per-test: what the "live catalog" currently knows.
let catalogState: 'empty' | 'loading' | 'ready' | 'error' = 'ready';
let knownModelIds: string[] = [];

vi.mock('../electron/services/modelCatalog', () => ({
  getAllModels: vi.fn(() => []),
  getGroupedModels: vi.fn(() => []),
  getDefaultModelId: vi.fn(() => undefined),
  refreshCatalog: vi.fn(),
  getCatalogStatus: () => ({ state: catalogState, stale: false }),
  getModelById: (id: string) => (knownModelIds.includes(id) ? { id } : undefined),
}));

vi.mock('../electron/services/configManager', () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  getActiveApiKey: vi.fn(() => 'test-key'),
}));
vi.mock('../electron/services/logger', () => ({ logger: { log: () => {} } }));
vi.mock('../electron/services/openRouterClient', () => ({
  generateImage: vi.fn(),
  translatePrompt: vi.fn(),
  translateToRussian: vi.fn(),
  promptAssist: vi.fn(),
  promptFromImage: vi.fn(),
  fetchCredits: vi.fn(),
  fetchGenerationCostWithRetry: vi.fn(),
  isRussianText: vi.fn(),
}));
vi.mock('../electron/services/costEstimator', () => ({ estimateCost: vi.fn() }));
vi.mock('../electron/services/autoTagger', () => ({ saveImageTags: vi.fn() }));
vi.mock('../electron/services/fileStorage', () => ({
  saveImage: vi.fn(),
  deleteImage: vi.fn(),
  getFileSize: vi.fn(),
  exportImage: vi.fn(),
}));
vi.mock('../electron/services/pngMetadata', () => ({ readMetadataFromFile: vi.fn() }));
vi.mock('../electron/services/costTracker', () => ({
  recordCost: vi.fn(),
  getSpendingSummary: vi.fn(),
  checkBudget: vi.fn(),
  setBudget: vi.fn(),
  TRANSLATE_ESTIMATED_COST_USD: 0,
  PROMPT_ASSIST_ESTIMATED_COST_USD: 0,
}));
vi.mock('../electron/services/queueProcessor', () => ({
  submitGeneration: vi.fn(),
  cancelGeneration: vi.fn(),
}));

function makePreset(overrides: Partial<DBPreset>): DBPreset {
  return {
    id: 1,
    name: 'Test',
    icon: '⚡',
    model_id: 'black-forest-labs/flux.2-pro',
    params: '{}',
    style_tags: '[]',
    negative_prompt: '',
    is_builtin: 1,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  ipcHandlers.clear();
  presetRows = [];
  catalogState = 'ready';
  knownModelIds = [];
  vi.resetModules();
  const { registerIpcHandlers } = await import('../electron/ipc/handlers');
  registerIpcHandlers();
});

function listPresets() {
  const handler = ipcHandlers.get('presets:list');
  if (!handler) throw new Error('presets:list not registered');
  return handler() as Array<DBPreset & { modelAvailable: boolean | null }>;
}

describe('presets:list — model availability against the live catalog', () => {
  it('marks a preset unavailable when its model is gone from a ready catalog', () => {
    presetRows = [makePreset({ id: 1, model_id: 'black-forest-labs/flux.2-klein-4b' })];
    catalogState = 'ready';
    knownModelIds = ['black-forest-labs/flux.2-pro']; // klein-4b is not in it

    const result = listPresets();

    expect(result).toHaveLength(1);
    expect(result[0].modelAvailable).toBe(false);
  });

  it('marks a preset available when its model exists in a ready catalog', () => {
    presetRows = [makePreset({ id: 2, model_id: 'black-forest-labs/flux.2-pro' })];
    catalogState = 'ready';
    knownModelIds = ['black-forest-labs/flux.2-pro'];

    const result = listPresets();

    expect(result[0].modelAvailable).toBe(true);
  });

  it.each(['empty', 'loading', 'error'] as const)(
    'marks every preset availability as unknown (null), not unavailable, while the catalog is %s',
    (state) => {
      presetRows = [
        makePreset({ id: 1, model_id: 'black-forest-labs/flux.2-klein-4b' }),
        makePreset({ id: 2, model_id: 'black-forest-labs/flux.2-pro' }),
      ];
      catalogState = state;
      knownModelIds = []; // catalog has no data at all in these states

      const result = listPresets();

      expect(result.every((p) => p.modelAvailable === null)).toBe(true);
    },
  );

  it('treats a preset with no model_id as having nothing to check, not as unavailable', () => {
    presetRows = [makePreset({ id: 3, model_id: null })];
    catalogState = 'ready';
    knownModelIds = ['black-forest-labs/flux.2-pro'];

    const result = listPresets();

    expect(result[0].modelAvailable).toBeNull();
  });
});
