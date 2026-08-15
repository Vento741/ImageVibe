import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — скрипт сборки написан на JavaScript и типов не имеет
import { extractOpenApi, openApiToModel, parseIndex } from '../scripts/build-kie-registry.mjs';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

const IMG2IMG = fixture('kie-openapi-sample.md'); // flux-2/pro-image-to-image
const TEXT2IMG = fixture('kie-openapi-text2img.md'); // flux-2/pro-text-to-image
const INPAINT = fixture('kie-openapi-inpaint.md'); // ideogram/v3-edit
const NONPROMPT = fixture('kie-openapi-nonprompt.md'); // recraft/remove-background

const imageMeta = { kind: 'image' as const, docUrl: 'https://docs.kie.ai/market/x.md' };

describe('extractOpenApi', () => {
  it('вынимает OpenAPI из реальной страницы документации', () => {
    const doc = extractOpenApi(IMG2IMG);
    expect(doc.openapi).toBe('3.0.1');
    expect(doc.paths['/api/v1/jobs/createTask'].post).toBeDefined();
  });

  it('возвращает null, когда блока нет', () => {
    expect(extractOpenApi('# Заголовок\n\nникакого yaml здесь нет')).toBeNull();
  });
});

describe('openApiToModel — изображение с референсом', () => {
  const model = openApiToModel(extractOpenApi(IMG2IMG), imageMeta);

  it('определяет идентификатор, семейство и вид', () => {
    expect(model.id).toBe('flux-2/pro-image-to-image');
    expect(model.family).toBe('flux-2');
    expect(model.kind).toBe('image');
  });

  it('назначает роль референса по имени ключа и его maxItems', () => {
    expect(model.roles.references).toEqual({ key: 'input_urls', array: true, max: 8 });
    expect(model.roles.prompt).toBe('prompt');
    expect(model.roles.mask).toBeUndefined();
  });

  it('даёт только режим с картинкой, потому что референс обязателен', () => {
    expect(model.modes).toEqual(['img2img']);
  });

  it('убирает ключи с ролью из схемы', () => {
    expect(model.schema.input_urls).toBeUndefined();
    expect(model.schema.prompt).toBeUndefined();
  });

  it('переносит перечисления с их доменами и значением по умолчанию', () => {
    expect(model.schema.aspect_ratio.type).toBe('enum');
    expect(model.schema.aspect_ratio.values).toContain('auto');
    expect(model.schema.resolution).toEqual({
      type: 'enum',
      values: ['1K', '2K'],
      default: '1K',
    });
  });

  it('переносит переключатель, вынесенный в x-apidog-refs', () => {
    expect(model.schema.nsfw_checker.type).toBe('boolean');
  });
});

describe('openApiToModel — изображение без референса', () => {
  const model = openApiToModel(extractOpenApi(TEXT2IMG), imageMeta);

  it('даёт базовый режим', () => {
    expect(model.id).toBe('flux-2/pro-text-to-image');
    expect(model.modes).toEqual(['text2img']);
    expect(model.roles.references).toBeUndefined();
  });
});

describe('openApiToModel — модель с маской', () => {
  const model = openApiToModel(extractOpenApi(INPAINT), imageMeta);

  it('назначает роль маски и добавляет режим правки области', () => {
    expect(model.id).toBe('ideogram/v3-edit');
    expect(model.roles.mask?.key).toBe('mask_url');
    expect(model.modes).toContain('inpaint');
    expect(model.schema.mask_url).toBeUndefined();
  });
});

describe('openApiToModel — негенеративная модель', () => {
  it('отсеивается по отсутствию промпта', () => {
    expect(openApiToModel(extractOpenApi(NONPROMPT), imageMeta)).toBeNull();
  });
});

describe('openApiToModel — страница не про createTask', () => {
  it('возвращает null', () => {
    expect(openApiToModel({ paths: { '/other': { post: {} } } }, imageMeta)).toBeNull();
  });
});

describe('openApiToModel — видео', () => {
  const videoMeta = { kind: 'video' as const, docUrl: 'https://docs.kie.ai/market/v.md' };

  it('использует видео-режимы', () => {
    const doc = extractOpenApi(TEXT2IMG);
    const model = openApiToModel(doc, videoMeta);
    expect(model.modes).toEqual(['text2video']);
    expect(model.kind).toBe('video');
  });
});

describe('parseIndex', () => {
  it('отбирает только разделы изображений и видео', () => {
    const text = [
      '- [Getting Started](https://docs.kie.ai/1973359m0.md): ',
      '- Image    Models > Flux-2 [Flux-2 - Pro Text to Image](https://docs.kie.ai/market/flux2/pro-text-to-image.md): ',
      '- Video Models > Kling [Kling v2](https://docs.kie.ai/market/kling/v2.md): ',
      '- Chat  Models > Claude [Claude](https://docs.kie.ai/market/claude/claude-opus-5.md): ',
      '- Music Models > ElevenLabs [TTS](https://docs.kie.ai/market/elevenlabs/tts.md): ',
    ].join('\n');

    expect(parseIndex(text)).toEqual([
      { kind: 'image', docUrl: 'https://docs.kie.ai/market/flux2/pro-text-to-image.md' },
      { kind: 'video', docUrl: 'https://docs.kie.ai/market/kling/v2.md' },
    ]);
  });
});
