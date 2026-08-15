import { describe, it, expect, beforeEach } from 'vitest';
import { resolveModelForMode, useGenerateStore } from '../src/modules/generate/store';
import type { KieModel } from '../src/shared/types/kie';

function model(over: Partial<KieModel> & Pick<KieModel, 'id'>): KieModel {
  return {
    name: over.id,
    family: over.id.split('/')[0],
    kind: 'image',
    modes: ['text2img'],
    schema: {},
    required: [],
    roles: { prompt: 'prompt' },
    docUrl: 'https://docs.kie.ai/market/x.md',
    ...over,
  };
}

const MODELS: KieModel[] = [
  model({ id: 'alpha/text-to-image', modes: ['text2img'] }),
  model({ id: 'zebra/text-to-image', modes: ['text2img'] }),
  model({
    id: 'alpha/image-to-image',
    modes: ['img2img'],
    roles: { prompt: 'prompt', references: { key: 'image_url', array: false, max: 1 } },
  }),
  model({ id: 'kling/v2', kind: 'video', modes: ['text2video'] }),
];

beforeEach(() => useGenerateStore.getState().reset());

describe('resolveModelForMode', () => {
  it('оставляет модель, которая обслуживает режим', () => {
    expect(resolveModelForMode(MODELS, 'zebra/text-to-image', 'text2img')).toBe(
      'zebra/text-to-image',
    );
  });

  it('меняет модель, которая режим не обслуживает', () => {
    expect(resolveModelForMode(MODELS, 'zebra/text-to-image', 'img2img')).toBe(
      'alpha/image-to-image',
    );
  });

  it('берёт первую по идентификатору, а не первую в списке', () => {
    expect(resolveModelForMode(MODELS, '', 'text2img')).toBe('alpha/text-to-image');
  });

  it('оставляет пусто, когда моделей режима нет', () => {
    expect(resolveModelForMode(MODELS, 'alpha/text-to-image', 'img2video')).toBe('');
  });

  it('не держится за модель, которой в списке нет вовсе', () => {
    expect(resolveModelForMode(MODELS, 'исчезнувшая/модель', 'text2img')).toBe(
      'alpha/text-to-image',
    );
  });
});

describe('switchMode', () => {
  it('подбирает модель под новый режим', () => {
    const store = useGenerateStore.getState();
    store.setSelectedModelId('zebra/text-to-image');
    store.switchMode('img2img', MODELS);

    expect(useGenerateStore.getState().mode).toBe('img2img');
    expect(useGenerateStore.getState().selectedModelId).toBe('alpha/image-to-image');
  });

  it('стирает маску при уходе с режима правки области', () => {
    const store = useGenerateStore.getState();
    store.setMode('inpaint');
    store.setMaskData('data:image/png;base64,МАСКА');
    useGenerateStore.getState().switchMode('text2img', MODELS);

    expect(useGenerateStore.getState().maskData).toBeNull();
  });

  it('сохраняет маску внутри режима правки области', () => {
    const store = useGenerateStore.getState();
    store.setMode('inpaint');
    store.setMaskData('data:image/png;base64,МАСКА');
    useGenerateStore.getState().switchMode('inpaint', MODELS);

    expect(useGenerateStore.getState().maskData).toBe('data:image/png;base64,МАСКА');
  });
});

describe('syncParamsToModel', () => {
  it('выбрасывает параметр, которого новая модель не знает', () => {
    const store = useGenerateStore.getState();
    store.setParam('aspect_ratio', '1:1');
    store.setParam('чужой_параметр', 'значение');

    useGenerateStore.getState().syncParamsToModel(
      model({ id: 'x/y', schema: { aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] } } }),
    );

    expect(useGenerateStore.getState().params).toEqual({ aspect_ratio: '1:1' });
  });

  it('предзаполняет обязательный параметр — без него сервис отвергает запрос', () => {
    useGenerateStore.getState().syncParamsToModel(
      model({
        id: 'z-image',
        schema: { aspect_ratio: { type: 'enum', values: ['1:1', '4:3'], default: '1:1' } },
        required: ['aspect_ratio'],
      }),
    );

    expect(useGenerateStore.getState().params).toEqual({ aspect_ratio: '1:1' });
  });

  it('не предзаполняет необязательный параметр', () => {
    useGenerateStore.getState().syncParamsToModel(
      model({
        id: 'z-image',
        schema: { aspect_ratio: { type: 'enum', values: ['1:1'], default: '1:1' } },
      }),
    );

    expect(useGenerateStore.getState().params).toEqual({});
  });
});

describe('история результатов', () => {
  const result = (imageId: number) => ({
    filePath: `/tmp/${imageId}.png`,
    imageId,
    modelId: 'z-image',
    prompt: 'кот',
    params: {},
    mediaKind: 'image' as const,
    width: 1024,
    height: 1024,
    costUsd: 0.004,
    costSource: 'actual' as const,
  });

  it('не задваивает одну и ту же запись', () => {
    const store = useGenerateStore.getState();
    store.setCurrentResult(result(1));
    useGenerateStore.getState().setCurrentResult(result(1));

    expect(useGenerateStore.getState().resultHistory).toHaveLength(1);
  });

  it('хранит разные записи по отдельности', () => {
    const store = useGenerateStore.getState();
    store.setCurrentResult(result(1));
    useGenerateStore.getState().setCurrentResult(result(2));

    expect(useGenerateStore.getState().resultHistory).toHaveLength(2);
  });
});
