import { describe, it, expect } from 'vitest';
import { controlKindFor, filterToSchema, hasParameter, enumValues } from '../src/shared/lib/kieParams';
import type { KieParamSchema } from '../src/shared/types/kie';

const ratio: KieParamSchema = { type: 'enum', values: ['1:1', '16:9'] };
const seed: KieParamSchema = { type: 'number', integer: true };
const scale: KieParamSchema = { type: 'number', integer: false };
const duration: KieParamSchema = { type: 'number', integer: true, min: 3, max: 15 };
const nsfw: KieParamSchema = { type: 'boolean' };
const negative: KieParamSchema = { type: 'text' };
const shortText: KieParamSchema = { type: 'text', maxLength: 10 };

describe('controlKindFor', () => {
  it('сопоставляет каждой форме свой контрол', () => {
    expect(controlKindFor(ratio)).toBe('enum');
    expect(controlKindFor(seed)).toBe('number');
    expect(controlKindFor(nsfw)).toBe('toggle');
    expect(controlKindFor(negative)).toBe('text');
  });
});

describe('hasParameter и enumValues', () => {
  it('различают отсутствие ключа и отсутствие перечисления', () => {
    const schema = { aspect_ratio: ratio, seed };
    expect(hasParameter(schema, 'aspect_ratio')).toBe(true);
    expect(hasParameter(schema, 'resolution')).toBe(false);
    expect(enumValues(schema, 'aspect_ratio')).toEqual(['1:1', '16:9']);
    expect(enumValues(schema, 'seed')).toBeNull();
    expect(enumValues(schema, 'resolution')).toBeNull();
  });
});

describe('filterToSchema', () => {
  it('пропускает значение из перечисления', () => {
    expect(filterToSchema({ aspect_ratio: '1:1' }, { aspect_ratio: ratio })).toEqual({
      aspect_ratio: '1:1',
    });
  });

  it('выбрасывает значение вне перечисления', () => {
    expect(filterToSchema({ aspect_ratio: '7:3' }, { aspect_ratio: ratio })).toEqual({});
  });

  it('выбрасывает значение перечисления неверного типа', () => {
    expect(filterToSchema({ aspect_ratio: 1 }, { aspect_ratio: ratio })).toEqual({});
  });

  it('пропускает целое там, где объявлено целое', () => {
    expect(filterToSchema({ seed: 42 }, { seed })).toEqual({ seed: 42 });
  });

  it('выбрасывает дробное там, где объявлено целое', () => {
    expect(filterToSchema({ seed: 4.5 }, { seed })).toEqual({});
  });

  it('пропускает дробное там, где целое не требуется', () => {
    expect(filterToSchema({ guidance_scale: 2.5 }, { guidance_scale: scale })).toEqual({
      guidance_scale: 2.5,
    });
  });

  it('выбрасывает число за границами диапазона', () => {
    expect(filterToSchema({ duration: 20 }, { duration })).toEqual({});
    expect(filterToSchema({ duration: 2 }, { duration })).toEqual({});
    expect(filterToSchema({ duration: 15 }, { duration })).toEqual({ duration: 15 });
  });

  it('различает булево значение и строку', () => {
    expect(filterToSchema({ nsfw_checker: true }, { nsfw_checker: nsfw })).toEqual({
      nsfw_checker: true,
    });
    expect(filterToSchema({ nsfw_checker: 'true' }, { nsfw_checker: nsfw })).toEqual({});
  });

  it('пропускает непустой текст и выбрасывает пустой', () => {
    expect(filterToSchema({ negative_prompt: 'blurry' }, { negative_prompt: negative })).toEqual({
      negative_prompt: 'blurry',
    });
    expect(filterToSchema({ negative_prompt: '' }, { negative_prompt: negative })).toEqual({});
  });

  it('выбрасывает текст длиннее объявленного предела', () => {
    expect(filterToSchema({ note: 'x'.repeat(11) }, { note: shortText })).toEqual({});
    expect(filterToSchema({ note: 'x'.repeat(10) }, { note: shortText })).toEqual({
      note: 'x'.repeat(10),
    });
  });

  it('выбрасывает ключ, которого нет в схеме', () => {
    // kie.ai принимает незнакомый ключ молча и берёт за задачу деньги (замер 3),
    // поэтому отсев здесь — единственное, что не даёт оплатить бесполезный параметр
    expect(filterToSchema({ bogus: 1 }, {})).toEqual({});
  });

  it('не подставляет значение по умолчанию', () => {
    const withDefault: KieParamSchema = { type: 'enum', values: ['1:1'], default: '1:1' };
    expect(filterToSchema({}, { aspect_ratio: withDefault })).toEqual({});
  });

  it('не заменяет недопустимое значение на допустимое', () => {
    const withDefault: KieParamSchema = { type: 'enum', values: ['1:1'], default: '1:1' };
    expect(filterToSchema({ aspect_ratio: '4:3' }, { aspect_ratio: withDefault })).toEqual({});
  });
});
