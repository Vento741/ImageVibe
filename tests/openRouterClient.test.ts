import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../electron/services/configManager', () => ({
  getActiveApiKey: () => 'test-key',
  getConfig: () => ({}),
}));
vi.mock('../electron/services/logger', () => ({
  logger: { log: () => {} },
}));
vi.mock('../electron/services/modelCatalog', () => ({
  getModelById: () => ({
    id: 'test/model',
    name: 'Test Model',
    description: '',
    schema: {},
    passthrough: [],
    pricing: [],
    providerSlugs: ['test-provider'],
    outputModalities: ['image'],
    category: 'quality',
    pricesLoaded: true,
  }),
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

describe('generateImage', () => {
  it('does not throw when the returned bytes cannot be parsed as an image, and reports unknown size', async () => {
    // Bytes that are not a valid image in any format sharp understands.
    const unparseableBase64 = Buffer.from('this is plain text, not image bytes').toString('base64');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'gen-unparseable',
        model: 'test/model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              images: [
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${unparseableBase64}` },
                },
              ],
            },
            finish_reason: 'stop',
          },
        ],
      }),
    })));

    const { generateImage } = await import('../electron/services/openRouterClient');
    const result = await generateImage({
      prompt: 'test prompt',
      modelId: 'test/model',
      mode: 'text2img',
      aspectRatio: '1:1',
      imageSize: '1K',
    });

    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('does not send a pixel-form image_size for a model that declares no resolution parameter', async () => {
    // The mocked model (see top of file) has an empty schema — no 'resolution' key — which
    // is exactly the state ParamsPanel hides its Size control for. request.imageSize below
    // stands in for a value stuck in the store from a previously selected model; it must not
    // be forwarded as pixels (see openRouterClient.ts comment on the removed branch).
    const unparseableBase64 = Buffer.from('not an image').toString('base64');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'gen-no-resolution',
        model: 'test/model',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              images: [
                { type: 'image_url', image_url: { url: `data:image/png;base64,${unparseableBase64}` } },
              ],
            },
            finish_reason: 'stop',
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { generateImage } = await import('../electron/services/openRouterClient');
    await generateImage({
      prompt: 'test prompt',
      modelId: 'test/model',
      mode: 'text2img',
      aspectRatio: '1:1',
      imageSize: '4K',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body.image_config?.image_size).toBeUndefined();
  });
});
