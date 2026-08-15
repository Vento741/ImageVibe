import { describe, it, expect } from 'vitest';
import { buildTaskInput, needsSource } from '../src/shared/lib/kieRequest';
import type { KieMode, KieModel, KieParamSchema } from '../src/shared/types/kie';

function makeModel(over: Partial<KieModel> = {}): KieModel {
  return {
    id: 'x/y',
    name: 'Модель X',
    family: 'x',
    kind: 'image',
    modes: ['text2img'],
    schema: {},
    required: [],
    roles: { prompt: 'prompt' },
    docUrl: 'https://docs.kie.ai/market/x.md',
    ...over,
  };
}

const ratio: KieParamSchema = { type: 'enum', values: ['1:1', '16:9'] };

function request(over: Partial<Parameters<typeof buildTaskInput>[1]> = {}) {
  return {
    prompt: 'a red apple',
    modelId: 'x/y',
    mode: 'text2img' as KieMode,
    params: {},
    ...over,
  };
}

describe('needsSource', () => {
  it('исходник нужен трём режимам', () => {
    expect(needsSource('img2img')).toBe(true);
    expect(needsSource('inpaint')).toBe(true);
    expect(needsSource('img2video')).toBe(true);
    expect(needsSource('text2img')).toBe(false);
    expect(needsSource('text2video')).toBe(false);
  });
});

describe('промпт', () => {
  it('кладётся по ключу своей роли', () => {
    const model = makeModel({ roles: { prompt: 'prompt' } });
    expect(buildTaskInput(model, request())).toEqual({ prompt: 'a red apple' });
  });

  it('пустой промпт отвергается', () => {
    expect(() => buildTaskInput(makeModel(), request({ prompt: '   ' }))).toThrow(/Промпт пуст/);
  });
});

describe('референс', () => {
  it('массив получает массив из одной ссылки', () => {
    const model = makeModel({
      modes: ['img2img'],
      roles: { prompt: 'prompt', references: { key: 'input_urls', array: true, max: 8 } },
    });
    const input = buildTaskInput(model, request({ mode: 'img2img', sourceUrl: 'https://x/a.png' }));
    expect(input.input_urls).toEqual(['https://x/a.png']);
  });

  it('строка получает строку, а не массив', () => {
    const model = makeModel({
      modes: ['img2img'],
      roles: { prompt: 'prompt', references: { key: 'image_url', array: false, max: 1 } },
    });
    const input = buildTaskInput(model, request({ mode: 'img2img', sourceUrl: 'https://x/a.png' }));
    expect(input.image_url).toBe('https://x/a.png');
  });

  it('режим с картинкой без исходника отвергается', () => {
    const model = makeModel({
      modes: ['img2img'],
      roles: { prompt: 'prompt', references: { key: 'image_url', array: false, max: 1 } },
    });
    expect(() => buildTaskInput(model, request({ mode: 'img2img' }))).toThrow(
      /нужно исходное изображение/,
    );
  });

  it('исходник для модели без роли референса отвергается', () => {
    expect(() =>
      buildTaskInput(makeModel(), request({ sourceUrl: 'https://x/a.png' })),
    ).toThrow(/не принимает исходное изображение/);
  });

  it('в базовом режиме исходник не отправляется', () => {
    const model = makeModel({
      modes: ['text2img', 'img2img'],
      roles: { prompt: 'prompt', references: { key: 'image_url', array: false, max: 1 } },
    });
    const input = buildTaskInput(model, request({ mode: 'text2img' }));
    expect(input.image_url).toBeUndefined();
  });
});

describe('маска', () => {
  const inpaintModel = makeModel({
    modes: ['img2img', 'inpaint'],
    roles: {
      prompt: 'prompt',
      references: { key: 'image_url', array: false, max: 1 },
      mask: { key: 'mask_url', array: false },
    },
  });

  it('уходит в режиме правки области', () => {
    const input = buildTaskInput(
      inpaintModel,
      request({ mode: 'inpaint', sourceUrl: 'https://x/a.png', maskUrl: 'https://x/m.png' }),
    );
    expect(input.mask_url).toBe('https://x/m.png');
  });

  it('без маски режим правки отвергается', () => {
    expect(() =>
      buildTaskInput(inpaintModel, request({ mode: 'inpaint', sourceUrl: 'https://x/a.png' })),
    ).toThrow(/нужна маска/);
  });

  it('не уходит вне режима правки, даже если задана', () => {
    const input = buildTaskInput(
      inpaintModel,
      request({ mode: 'img2img', sourceUrl: 'https://x/a.png', maskUrl: 'https://x/m.png' }),
    );
    expect(input.mask_url).toBeUndefined();
  });

  it('правка области у модели без маски отвергается', () => {
    const model = makeModel({
      modes: ['inpaint'],
      roles: { prompt: 'prompt', references: { key: 'image_url', array: false, max: 1 } },
    });
    expect(() =>
      buildTaskInput(
        model,
        request({ mode: 'inpaint', sourceUrl: 'https://x/a.png', maskUrl: 'https://x/m.png' }),
      ),
    ).toThrow(/не принимает маску/);
  });
});

describe('режим', () => {
  it('режим, которого модель не обслуживает, отвергается', () => {
    // Проверка живёт здесь, а не в интерфейсе: гейт на кнопках обходится пресетом
    expect(() => buildTaskInput(makeModel(), request({ mode: 'text2video' }))).toThrow(
      /не поддерживает этот режим/,
    );
  });
});

describe('параметры', () => {
  it('параметр вне схемы не попадает в тело — иначе он был бы оплачен впустую', () => {
    const model = makeModel({ schema: { aspect_ratio: ratio } });
    const input = buildTaskInput(
      model,
      request({ params: { aspect_ratio: '1:1', bogus_param: 42 } }),
    );
    expect(input).toEqual({ prompt: 'a red apple', aspect_ratio: '1:1' });
  });

  it('значение вне перечисления не попадает в тело', () => {
    const model = makeModel({ schema: { aspect_ratio: ratio } });
    const input = buildTaskInput(model, request({ params: { aspect_ratio: '7:3' } }));
    expect(input.aspect_ratio).toBeUndefined();
  });

  it('незаполненный обязательный параметр отвергается до отправки', () => {
    const model = makeModel({ schema: { aspect_ratio: ratio }, required: ['aspect_ratio'] });
    expect(() => buildTaskInput(model, request())).toThrow(/обязательные параметры: aspect_ratio/);
  });

  it('параметр не может перебить ключ роли', () => {
    const model = makeModel({ schema: { aspect_ratio: ratio } });
    const input = buildTaskInput(model, request({ params: { prompt: 'подделка' } }));
    expect(input.prompt).toBe('a red apple');
  });
});

describe('восстановление типов перечислений', () => {
  it('числовому перечислению возвращается число', () => {
    const model = makeModel({
      kind: 'video',
      modes: ['text2video'],
      schema: {
        duration: { type: 'enum', values: ['5', '10'], valueType: 'number' },
      },
    });
    const input = buildTaskInput(model, request({ mode: 'text2video', params: { duration: '10' } }));
    expect(input.duration).toBe(10);
  });

  it('булеву перечислению возвращается булево', () => {
    const model = makeModel({
      schema: { audio: { type: 'enum', values: ['false', 'true'], valueType: 'boolean' } },
    });
    expect(buildTaskInput(model, request({ params: { audio: 'true' } })).audio).toBe(true);
    expect(buildTaskInput(model, request({ params: { audio: 'false' } })).audio).toBe(false);
  });

  it('строковое перечисление остаётся строкой', () => {
    const model = makeModel({ schema: { aspect_ratio: ratio } });
    expect(buildTaskInput(model, request({ params: { aspect_ratio: '16:9' } })).aspect_ratio).toBe(
      '16:9',
    );
  });

  it('числа и переключатели вне перечислений не трогаются', () => {
    const model = makeModel({
      schema: {
        seed: { type: 'number', integer: true },
        nsfw_checker: { type: 'boolean' },
        negative_prompt: { type: 'text' },
      },
    });
    const input = buildTaskInput(
      model,
      request({ params: { seed: 42, nsfw_checker: true, negative_prompt: 'blurry' } }),
    );
    expect(input.seed).toBe(42);
    expect(input.nsfw_checker).toBe(true);
    expect(input.negative_prompt).toBe('blurry');
  });
});

describe('реальная модель из реестра', () => {
  it('flux-2/pro-image-to-image собирается целиком', () => {
    const model = makeModel({
      id: 'flux-2/pro-image-to-image',
      name: 'Flux-2 - Pro Image to Image',
      family: 'flux-2',
      modes: ['img2img'],
      schema: {
        aspect_ratio: { type: 'enum', values: ['1:1', '16:9', 'auto'], default: '1:1' },
        resolution: { type: 'enum', values: ['1K', '2K'], default: '1K' },
        nsfw_checker: { type: 'boolean' },
      },
      required: ['aspect_ratio', 'resolution'],
      roles: { prompt: 'prompt', references: { key: 'input_urls', array: true, max: 8 } },
    });

    const input = buildTaskInput(
      model,
      request({
        mode: 'img2img',
        sourceUrl: 'https://tempfile.redpandaai.co/kieai/1/a.png',
        params: { aspect_ratio: 'auto', resolution: '2K' },
      }),
    );

    expect(input).toEqual({
      prompt: 'a red apple',
      input_urls: ['https://tempfile.redpandaai.co/kieai/1/a.png'],
      aspect_ratio: 'auto',
      resolution: '2K',
    });
  });
});
