import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../electron/services/configManager', () => ({
  getActiveApiKey: () => 'test-key',
  getConfig: () => ({}),
}));
vi.mock('../electron/services/logger', () => ({ logger: { log: () => {} } }));

// The catalog mock needs to return a different schema per test (e.g. a model that caps
// input_references at 1), while every existing test keeps working against the same
// default model it always used. vi.hoisted runs before vi.mock factories are evaluated,
// so the mutable `model` box below is safe to close over from the factory — this avoids
// forking a second mock file or duplicating the whole mock body per test.
const catalogMock = vi.hoisted(() => {
  const defaultModel = {
    id: 'test/model',
    name: 'Test Model',
    description: '',
    schema: {
      aspect_ratio: { type: 'enum' as const, values: ['1:1', '16:9'] },
      seed: { type: 'boolean' as const },
      input_references: { type: 'range' as const, min: 0, max: 4 },
    },
    passthrough: [] as string[],
    pricing: [] as unknown[],
    providerSlugs: ['test-provider'],
    outputModalities: ['image'],
    category: 'quality' as const,
    pricesLoaded: true,
  };
  return { defaultModel, model: defaultModel as typeof defaultModel };
});

/** Point the mocked catalog at a different model for the current test only. */
function setMockModel(model: typeof catalogMock.defaultModel): void {
  catalogMock.model = model;
}

vi.mock('../electron/services/modelCatalog', () => ({
  getModelById: () => catalogMock.model,
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

afterEach(() => {
  vi.unstubAllGlobals();
  // Restore the catalog mock so a test that swapped in a custom schema (e.g. a
  // reference-count limit) never leaks into the next, unrelated test.
  setMockModel(catalogMock.defaultModel);
});

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

describe('generateImage — result.params reflects what was sent', () => {
  it('returns the schema-applied record, not the raw request params', async () => {
    // result.params is written into the PNG metadata and the gallery's params column —
    // it is the history's answer to "what was this image made with". If it echoed the
    // raw request instead of the record filterToSchema actually put on the wire, the
    // history would claim a parameter was used that the provider never received.
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { generateImage } = await import('../electron/services/openRouterClient');
    const result = await generateImage({
      ...baseRequest,
      // 'quality' is not in the mock schema (only aspect_ratio/seed/input_references are).
      params: { aspect_ratio: '16:9', quality: 'high' },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body.quality).toBeUndefined();
    expect(result.params).toEqual({ aspect_ratio: '16:9' });
  });
});

describe('generateImage — size follows aspect_ratio', () => {
  it('recomputes a pixel size sent alongside a different aspect ratio', async () => {
    // size and aspect_ratio are two independent controls, so a preset (or the command
    // palette) can set aspect_ratio without touching a size that was computed for the
    // ratio that was active before. If that stale size reached the wire, the paid call
    // would come back a different shape than the aspect ratio the user actually chose.
    // The mock schema declares aspect_ratio but no resolution, which is exactly the
    // condition under which size is forwarded at all (see filterToSchema).
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { generateImage } = await import('../electron/services/openRouterClient');
    await generateImage({
      ...baseRequest,
      // 1024x1024 was computed for a 1:1 ratio; aspect_ratio here says 16:9 instead.
      params: { size: '1024x1024', aspect_ratio: '16:9' },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body.size).toBe('1024x576');
  });
});

describe('generateImage — reference count guard', () => {
  it('rejects before any request when references exceed the declared maximum', async () => {
    // This is the one point every path (preset, advanced panel, mode switch) funnels
    // through before a paid request leaves. If the guard did not run, or ran after the
    // fetch, an over-limit call would still be billed even though the provider would
    // reject it — so both the error and "fetch never happened" must hold.
    setMockModel({
      ...catalogMock.defaultModel,
      schema: {
        ...catalogMock.defaultModel.schema,
        input_references: { type: 'range', min: 0, max: 1 },
      },
    });
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { generateImage } = await import('../electron/services/openRouterClient');
    await expect(
      generateImage({
        ...baseRequest,
        mode: 'inpaint',
        sourceImageBase64: PNG_1X1,
        maskBase64: PNG_1X1, // source + mask = 2 references, but the model caps at 1
      }),
    ).rejects.toThrow(/не более 1/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not limit references when the model declares no input_references bound', async () => {
    const { input_references: _unused, ...schemaWithoutReferenceBound } = catalogMock.defaultModel.schema;
    setMockModel({ ...catalogMock.defaultModel, schema: schemaWithoutReferenceBound });
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { generateImage } = await import('../electron/services/openRouterClient');
    await generateImage({
      ...baseRequest,
      mode: 'inpaint',
      sourceImageBase64: PNG_1X1,
      maskBase64: PNG_1X1, // same two references, but no declared limit applies to them
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
