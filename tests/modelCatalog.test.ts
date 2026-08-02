import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CATALOG_SAMPLE, RIVERFLOW_ENDPOINTS, SEEDREAM_ENDPOINTS } from './fixtures/catalog';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.mock('../electron/services/configManager', () => ({
  getActiveApiKey: () => 'test-key',
  getConfig: () => ({}),
}));
vi.mock('../electron/services/logger', () => ({
  logger: { log: () => {} },
}));

const RIVERFLOW = { ...CATALOG_SAMPLE, id: 'sourceful/riverflow-v2-pro', name: 'Riverflow V2 Pro' };
const SEEDREAM = { ...CATALOG_SAMPLE, id: 'bytedance-seed/seedream-4.5', name: 'Seedream 4.5' };

function mockFetch(handler: (url: string) => { ok: boolean; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const { ok, body } = handler(String(url));
    return { ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) };
  }));
}

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'imagevibe-cache-'));
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.promises.rm(cacheDir, { recursive: true, force: true });
});

async function loadModule() {
  const mod = await import('../electron/services/modelCatalog');
  mod.setCachePathForTests(cacheDir);
  return mod;
}

describe('initCatalog', () => {
  it('exposes models right after the catalog request, before prices arrive', async () => {
    let releaseEndpoints: () => void = () => {};
    const blocked = new Promise<void>((resolve) => { releaseEndpoints = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/images/models')) {
        return { ok: true, status: 200, json: async () => ({ data: [RIVERFLOW, SEEDREAM] }) };
      }
      await blocked;
      return { ok: true, status: 200, json: async () => ({ id: 'x', endpoints: RIVERFLOW_ENDPOINTS }) };
    }));

    const mod = await loadModule();
    await mod.initCatalog(() => {});

    expect(mod.getAllModels()).toHaveLength(2);
    expect(mod.getAllModels()[0].pricesLoaded).toBe(false);
    releaseEndpoints();
  });

  it('fills pricing and notifies once endpoints arrive', async () => {
    mockFetch((url) => {
      if (url.endsWith('/images/models')) return { ok: true, body: { data: [RIVERFLOW, SEEDREAM] } };
      if (url.includes('riverflow')) return { ok: true, body: { id: 'r', endpoints: RIVERFLOW_ENDPOINTS } };
      return { ok: true, body: { id: 's', endpoints: SEEDREAM_ENDPOINTS } };
    });

    const notified = vi.fn();
    const mod = await loadModule();
    await mod.initCatalog(notified);
    await mod.waitForPricesForTests();

    const riverflow = mod.getModelById('sourceful/riverflow-v2-pro');
    expect(riverflow?.pricing).toHaveLength(5);
    expect(riverflow?.pricesLoaded).toBe(true);
    expect(notified).toHaveBeenCalled();
  });

  it('writes a cache file that a second start reads without network', async () => {
    mockFetch((url) => {
      if (url.endsWith('/images/models')) return { ok: true, body: { data: [SEEDREAM] } };
      return { ok: true, body: { id: 's', endpoints: SEEDREAM_ENDPOINTS } };
    });

    const first = await loadModule();
    await first.initCatalog(() => {});
    await first.waitForPricesForTests();

    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const second = await import('../electron/services/modelCatalog');
    second.setCachePathForTests(cacheDir);
    await second.initCatalog(() => {});

    expect(second.getAllModels()).toHaveLength(1);
    expect(second.getCatalogStatus().state).toBe('ready');
  });

  it('reports an error instead of falling back to a built-in list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const mod = await loadModule();
    await mod.initCatalog(() => {});

    expect(mod.getCatalogStatus().state).toBe('error');
    expect(mod.getAllModels()).toEqual([]);
  });

  it('resolves from a valid cache without waiting for a slow network refresh', async () => {
    mockFetch((url) => {
      if (url.endsWith('/images/models')) return { ok: true, body: { data: [SEEDREAM] } };
      return { ok: true, body: { id: 's', endpoints: SEEDREAM_ENDPOINTS } };
    });

    const first = await loadModule();
    await first.initCatalog(() => {});
    await first.waitForPricesForTests();

    vi.resetModules();
    let releaseCatalog: () => void = () => {};
    const blocked = new Promise<void>((resolve) => { releaseCatalog = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/images/models')) {
        await blocked;
        throw new Error('offline');
      }
      return { ok: true, status: 200, json: async () => ({ id: 's', endpoints: SEEDREAM_ENDPOINTS }) };
    }));

    const second = await import('../electron/services/modelCatalog');
    second.setCachePathForTests(cacheDir);
    await second.initCatalog(() => {});

    // Resolved from cache alone — the network refresh above is still blocked at this point.
    expect(second.getAllModels()).toHaveLength(1);
    expect(second.getCatalogStatus().state).toBe('ready');

    releaseCatalog();
    await second.waitForCatalogRefreshForTests();
    expect(second.getCatalogStatus().error).toContain('offline');
  });
});

describe('getCatalogStatus', () => {
  it('marks a cache older than 24h as stale but still serves its models', async () => {
    const staleFetchedAt = Date.now() - 25 * 60 * 60 * 1000;
    await fs.promises.writeFile(
      path.join(cacheDir, 'models-cache.json'),
      JSON.stringify({
        fetchedAt: staleFetchedAt,
        models: [SEEDREAM],
        endpoints: { [SEEDREAM.id]: SEEDREAM_ENDPOINTS },
      }),
      'utf-8',
    );
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    const mod = await loadModule();
    await mod.initCatalog(() => {});
    await mod.waitForCatalogRefreshForTests();

    expect(mod.getCatalogStatus().stale).toBe(true);
    expect(mod.getAllModels()).toHaveLength(1);
  });
});

describe('getDefaultModelId', () => {
  it('picks the cheapest model with a known price, not a hardcoded id', async () => {
    mockFetch((url) => {
      if (url.endsWith('/images/models')) return { ok: true, body: { data: [RIVERFLOW, SEEDREAM] } };
      if (url.includes('riverflow')) return { ok: true, body: { id: 'r', endpoints: RIVERFLOW_ENDPOINTS } };
      return { ok: true, body: { id: 's', endpoints: SEEDREAM_ENDPOINTS } };
    });

    const mod = await loadModule();
    await mod.initCatalog(() => {});
    await mod.waitForPricesForTests();

    expect(mod.getDefaultModelId()).toBe('bytedance-seed/seedream-4.5');
  });
});

describe('getGroupedModels', () => {
  it('groups by computed category and skips empty groups', async () => {
    mockFetch((url) => {
      if (url.endsWith('/images/models')) return { ok: true, body: { data: [RIVERFLOW, SEEDREAM] } };
      if (url.includes('riverflow')) return { ok: true, body: { id: 'r', endpoints: RIVERFLOW_ENDPOINTS } };
      return { ok: true, body: { id: 's', endpoints: SEEDREAM_ENDPOINTS } };
    });

    const mod = await loadModule();
    await mod.initCatalog(() => {});
    await mod.waitForPricesForTests();

    const groups = mod.getGroupedModels();
    expect(groups.every((group) => group.models.length > 0)).toBe(true);
    expect(groups.flatMap((group) => group.models)).toHaveLength(2);
  });
});
