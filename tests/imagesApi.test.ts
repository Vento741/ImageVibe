import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../electron/services/configManager', () => ({
  getActiveApiKey: () => 'test-key',
  getConfig: () => ({}),
}));
vi.mock('../electron/services/logger', () => ({ logger: { log: () => {} } }));
vi.mock('../electron/services/modelCatalog', () => ({
  getModelById: () => ({
    id: 'test/model',
    name: 'Test Model',
    description: '',
    schema: {
      aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] },
      seed: { type: 'boolean' },
      input_references: { type: 'range', min: 0, max: 4 },
    },
    passthrough: [],
    pricing: [],
    providerSlugs: ['test-provider'],
    outputModalities: ['image'],
    category: 'quality',
    pricesLoaded: true,
  }),
}));

/** A 1×1 PNG, so sharp can measure it and the size assertions are real. */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function okResponse(headers: Record<string, string> = { 'x-generation-id': 'gen-img-1' }) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => ({
      created: 0,
      data: [{ b64_json: PNG_1X1, media_type: 'image/png' }],
      usage: { cost: 0.014, prompt_tokens: 12, completion_tokens: 4096 },
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

const baseRequest = {
  prompt: 'a pebble',
  modelId: 'test/model',
  mode: 'text2img' as const,
  params: {},
};

describe('generateImage — request body', () => {
  it('posts to the images endpoint, not chat/completions', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { generateImage } = await import('../electron/services/openRouterClient');
    await generateImage(baseRequest);
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toBe('https://openrouter.ai/api/v1/images');
  });

  it('sends a declared parameter under its protocol key', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { generateImage } = await import('../electron/services/openRouterClient');
    await generateImage({ ...baseRequest, params: { aspect_ratio: '16:9' } });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).aspect_ratio).toBe('16:9');
  });

  it('drops a parameter the model does not declare', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { generateImage } = await import('../electron/services/openRouterClient');
    await generateImage({ ...baseRequest, params: { quality: 'high' } });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).quality).toBeUndefined();
  });

  it('sends the mask as the second reference and explains it in the prompt', async () => {
    // Finding 10: without the explanation the model ignores the mask and edits the
    // wrong region — the result came out inverted.
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { generateImage } = await import('../electron/services/openRouterClient');
    await generateImage({
      ...baseRequest,
      mode: 'inpaint',
      sourceImageBase64: PNG_1X1,
      maskBase64: PNG_1X1,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body.input_references).toHaveLength(2);
    expect(body.input_references[1].image_url.url).toContain(PNG_1X1);
    expect(body.prompt).toContain('mask');
  });
});

describe('generateImage — response', () => {
  it('takes the generation id from the x-generation-id header, absent from the body', async () => {
    // Finding 12: the body has no id field at all.
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    const { generateImage } = await import('../electron/services/openRouterClient');
    const result = await generateImage(baseRequest);
    expect(result.generationId).toBe('gen-img-1');
  });

  it('reports a missing generation id as null, never as an empty string', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({})));
    const { generateImage } = await import('../electron/services/openRouterClient');
    const result = await generateImage(baseRequest);
    expect(result.generationId).toBeNull();
  });

  it('takes the actual cost from usage.cost, with no second request', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { generateImage } = await import('../electron/services/openRouterClient');
    const result = await generateImage(baseRequest);
    expect(result.costUsd).toBe(0.014);
    expect(result.costSource).toBe('actual');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an absent usage.cost as unknown, not as zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'gen-img-2' },
      json: async () => ({ created: 0, data: [{ b64_json: PNG_1X1, media_type: 'image/png' }] }),
    })));
    const { generateImage } = await import('../electron/services/openRouterClient');
    const result = await generateImage(baseRequest);
    expect(result.costUsd).toBeNull();
    expect(result.costSource).toBe('unknown');
  });

  it('measures the size from the returned image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    const { generateImage } = await import('../electron/services/openRouterClient');
    const result = await generateImage(baseRequest);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('throws a readable error when the response carries no image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ created: 0, data: [] }),
    })));
    const { generateImage } = await import('../electron/services/openRouterClient');
    await expect(generateImage(baseRequest)).rejects.toThrow('Ответ API не содержит изображение');
  });
});
