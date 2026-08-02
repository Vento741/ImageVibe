import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../electron/services/configManager', () => ({
  getActiveApiKey: () => 'test-key',
  getConfig: () => ({}),
}));
vi.mock('../electron/services/logger', () => ({
  logger: { log: () => {} },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGenerationCost', () => {
  it('returns null, not zero, when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const { fetchGenerationCost } = await import('../electron/services/openRouterClient');
    expect(await fetchGenerationCost('gen-1')).toBeNull();
  });

  it('returns null, not zero, when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const { fetchGenerationCost } = await import('../electron/services/openRouterClient');
    expect(await fetchGenerationCost('gen-1')).toBeNull();
  });

  it('returns null when the response has no usage field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) })));
    const { fetchGenerationCost } = await import('../electron/services/openRouterClient');
    expect(await fetchGenerationCost('gen-1')).toBeNull();
  });

  it('preserves a genuine zero reported by the API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { usage: 0 } }) })));
    const { fetchGenerationCost } = await import('../electron/services/openRouterClient');
    expect(await fetchGenerationCost('gen-1')).toBe(0);
  });

  it('returns a genuine non-zero cost', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { usage: 0.05 } }) })));
    const { fetchGenerationCost } = await import('../electron/services/openRouterClient');
    expect(await fetchGenerationCost('gen-1')).toBe(0.05);
  });
});

describe('fetchGenerationCostWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null, not zero, after every retry stays undetermined', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const { fetchGenerationCostWithRetry } = await import('../electron/services/openRouterClient');
    const promise = fetchGenerationCostWithRetry('gen-1', 2);
    await vi.runAllTimersAsync();
    expect(await promise).toBeNull();
  });

  it('returns a genuine zero immediately, without retrying it away', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: { usage: 0 } }) }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchGenerationCostWithRetry } = await import('../electron/services/openRouterClient');
    expect(await fetchGenerationCostWithRetry('gen-1', 3)).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries past an undetermined attempt and returns the later real value', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      if (call === 1) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ data: { usage: 0.07 } }) };
    }));
    const { fetchGenerationCostWithRetry } = await import('../electron/services/openRouterClient');
    const promise = fetchGenerationCostWithRetry('gen-1', 3);
    await vi.runAllTimersAsync();
    expect(await promise).toBe(0.07);
  });
});
