import { describe, it, expect, afterEach } from 'vitest';
import {
  getAllModels,
  getAvailableModes,
  getDefaultModelId,
  getFamilies,
  getModelById,
  getModelsForMode,
  parseModel,
  setRegistryForTests,
} from '../electron/services/kieRegistry';
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

const FIXTURE: KieModel[] = [
  model({ id: 'zebra/text-to-image', name: 'Zebra', modes: ['text2img'] }),
  model({ id: 'alpha/text-to-image', name: 'Alpha', modes: ['text2img'] }),
  model({
    id: 'alpha/image-to-image',
    name: 'Alpha edit',
    modes: ['img2img'],
    roles: { prompt: 'prompt', references: { key: 'image_url', array: false, max: 1 } },
  }),
  model({
    id: 'ideogram/v3-edit',
    name: 'Ideogram edit',
    modes: ['img2img', 'inpaint'],
    roles: {
      prompt: 'prompt',
      references: { key: 'image_url', array: false, max: 1 },
      mask: { key: 'mask_url', array: false },
    },
  }),
  model({ id: 'kling/v2', name: 'Kling', kind: 'video', modes: ['text2video'] }),
];

afterEach(() => setRegistryForTests(null));

describe('выборка по режиму', () => {
  it('возвращает только модели, обслуживающие режим', () => {
    setRegistryForTests(FIXTURE);
    expect(getModelsForMode('inpaint').map((m) => m.id)).toEqual(['ideogram/v3-edit']);
    expect(getModelsForMode('img2img').map((m) => m.id)).toEqual([
      'alpha/image-to-image',
      'ideogram/v3-edit',
    ]);
  });

  it('сортирует по семейству, затем по имени', () => {
    setRegistryForTests(FIXTURE);
    expect(getModelsForMode('text2img').map((m) => m.id)).toEqual([
      'alpha/text-to-image',
      'zebra/text-to-image',
    ]);
  });
});

describe('доступные режимы', () => {
  it('не содержит режим, для которого нет моделей', () => {
    setRegistryForTests(FIXTURE);
    expect(getAvailableModes()).toEqual(['text2img', 'img2img', 'inpaint', 'text2video']);
  });
});

describe('модель по умолчанию', () => {
  it('первая по идентификатору среди моделей режима', () => {
    setRegistryForTests(FIXTURE);
    expect(getDefaultModelId('text2img')).toBe('alpha/text-to-image');
  });

  it('undefined, когда моделей режима нет', () => {
    setRegistryForTests(FIXTURE);
    expect(getDefaultModelId('img2video')).toBeUndefined();
  });
});

describe('семейства', () => {
  it('не смешивает изображения и видео', () => {
    setRegistryForTests(FIXTURE);
    expect(getFamilies('video')).toEqual(['kling']);
    expect(getFamilies('image')).toEqual(['alpha', 'ideogram', 'zebra']);
  });
});

describe('поиск по идентификатору', () => {
  it('находит и не находит', () => {
    setRegistryForTests(FIXTURE);
    expect(getModelById('kling/v2')?.kind).toBe('video');
    expect(getModelById('нет такой')).toBeUndefined();
  });
});

describe('разбор записи', () => {
  it('принимает корректную запись', () => {
    expect(parseModel(FIXTURE[0])?.id).toBe('zebra/text-to-image');
  });

  it('отвергает неизвестный режим', () => {
    expect(parseModel({ ...FIXTURE[0], modes: ['text2audio'] })).toBeNull();
  });

  it('отвергает неизвестную форму записи схемы', () => {
    expect(parseModel({ ...FIXTURE[0], schema: { x: { type: 'slider' } } })).toBeNull();
  });

  it('отвергает запись без роли промпта', () => {
    expect(parseModel({ ...FIXTURE[0], roles: {} })).toBeNull();
  });

  it('отвергает неполную роль референса', () => {
    expect(
      parseModel({ ...FIXTURE[0], roles: { prompt: 'prompt', references: { key: 'image_url' } } }),
    ).toBeNull();
  });

  it('отвергает не объект', () => {
    expect(parseModel('строка')).toBeNull();
    expect(parseModel(null)).toBeNull();
  });
});

describe('реестр в репозитории', () => {
  it('целиком проходит разбор — сломанная перегенерация видна тестом', () => {
    setRegistryForTests(null);
    const all = getAllModels();
    const raw = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      JSON.stringify(require('../electron/data/kie-models.json')),
    ) as unknown[];
    expect(all.length).toBe(raw.length);
    expect(all.length).toBeGreaterThan(50);
  });

  it('у каждой модели есть хотя бы один режим и роль промпта', () => {
    setRegistryForTests(null);
    for (const m of getAllModels()) {
      expect(m.modes.length, m.id).toBeGreaterThan(0);
      expect(m.roles.prompt, m.id).toBe('prompt');
    }
  });

  it('ключи с ролью не дублируются в схеме', () => {
    setRegistryForTests(null);
    for (const m of getAllModels()) {
      expect(m.schema[m.roles.prompt], m.id).toBeUndefined();
      if (m.roles.references) expect(m.schema[m.roles.references.key], m.id).toBeUndefined();
      if (m.roles.mask) expect(m.schema[m.roles.mask.key], m.id).toBeUndefined();
    }
  });

  it('правку по маске обслуживает ровно одна модель', () => {
    // Маску объявляют три модели Ideogram, но две требуют ещё и референс персонажа
    // отдельным обязательным полем, а слот исходника в приложении один (замер 12).
    setRegistryForTests(null);
    const withMask = getAllModels().filter((m) => m.roles.mask);
    expect(withMask.map((m) => m.id)).toEqual(['ideogram/v3-edit']);
    expect(getModelsForMode('inpaint').map((m) => m.id)).toEqual(['ideogram/v3-edit']);
  });

  it('у каждого обязательного параметра есть запись в схеме', () => {
    setRegistryForTests(null);
    for (const m of getAllModels()) {
      for (const key of m.required) {
        expect(m.schema[key], `${m.id}: ${key}`).toBeDefined();
      }
    }
  });

  it('обязательный параметр никогда не свободный текст — его нечем заполнить', () => {
    setRegistryForTests(null);
    for (const m of getAllModels()) {
      for (const key of m.required) {
        expect(m.schema[key].type, `${m.id}: ${key}`).not.toBe('text');
      }
    }
  });
});
