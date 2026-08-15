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

// Что знает реестр в конкретном тесте. Состояния загрузки у него нет: он читается из
// файла и готов сразу, поэтому «модель не найдена» теперь однозначно значит «её нет».
let knownModelIds: string[] = [];

vi.mock('../electron/services/kieRegistry', () => ({
  getAllModels: vi.fn(() => []),
  getAvailableModes: vi.fn(() => []),
  getModelsForMode: vi.fn(() => []),
  getDefaultModelId: vi.fn(() => undefined),
  getModelById: (id: string) => (knownModelIds.includes(id) ? { id } : undefined),
}));

vi.mock('../electron/services/configManager', () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  getActiveApiKey: vi.fn(() => 'test-key'),
}));
vi.mock('../electron/services/logger', () => ({ logger: { log: () => {} } }));
vi.mock('../electron/services/openRouterClient', () => ({
  translatePrompt: vi.fn(),
  translateToRussian: vi.fn(),
  promptAssist: vi.fn(),
  promptFromImage: vi.fn(),
  isRussianText: vi.fn(),
}));
vi.mock('../electron/services/costHistory', () => ({
  medianCostFor: vi.fn(() => null),
  getBalance: vi.fn(),
}));
vi.mock('../electron/services/dataUrl', () => ({ readAsDataUrl: vi.fn() }));
vi.mock('../electron/services/autoTagger', () => ({ saveImageTags: vi.fn() }));
vi.mock('../electron/services/fileStorage', () => ({
  saveMedia: vi.fn(),
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
  resumeRunningTasks: vi.fn(),
}));

function makePreset(overrides: Partial<DBPreset>): DBPreset {
  return {
    id: 1,
    name: 'Test',
    icon: '⚡',
    model_id: 'black-forest-labs/flux.2-pro',
    params: '{}',
    style_tags: '[]',
    negative_prompt: null,
    is_builtin: 1,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  ipcHandlers.clear();
  presetRows = [];
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

describe('presets:list — доступность модели по реестру', () => {
  it('модель, которой в реестре нет, помечается недоступной', () => {
    // Пресеты, переехавшие с OpenRouter, ссылаются на исчезнувшие модели — и это
    // теперь достоверный ответ, а не следствие незагруженного каталога
    presetRows = [makePreset({ id: 1, model_id: 'black-forest-labs/flux.2-klein-4b' })];
    knownModelIds = ['z-image'];

    const result = listPresets();

    expect(result).toHaveLength(1);
    expect(result[0].modelAvailable).toBe(false);
  });

  it('модель, которая в реестре есть, помечается доступной', () => {
    presetRows = [makePreset({ id: 2, model_id: 'z-image' })];
    knownModelIds = ['z-image'];

    expect(listPresets()[0].modelAvailable).toBe(true);
  });

  it('пресет без модели проверять нечего', () => {
    // У встроенных пресетов модель снята миграцией v5: они несут только параметры
    presetRows = [makePreset({ id: 3, model_id: null })];
    knownModelIds = ['z-image'];

    expect(listPresets()[0].modelAvailable).toBeNull();
  });
});
