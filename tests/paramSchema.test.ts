import { describe, it, expect } from 'vitest';
import {
  controlKindFor,
  rangeOf,
  maxReferences,
  availableModes,
  applySchema,
  sizeFor,
} from '../src/shared/lib/paramSchema';
import type { ParamSchema } from '../src/shared/types/models';

describe('controlKindFor', () => {
  it('renders an enum as a segmented control', () => {
    expect(controlKindFor({ type: 'enum', values: ['1K', '2K'] })).toBe('enum');
  });

  it('renders no control for a degenerate range', () => {
    // Measured: n is {min:1,max:1} for 17 of 38 catalog models — the common case
    expect(controlKindFor({ type: 'range', min: 1, max: 1 })).toBe('none');
  });

  it('renders a counter for a real range', () => {
    expect(controlKindFor({ type: 'range', min: 0, max: 100 })).toBe('counter');
  });

  it('renders a counter, not a toggle, for a 0..1 range', () => {
    // Measured (finding 11): the only key with these bounds is input_references, and it
    // is a count of reference images, not a flag. The skill's "0..1 means toggle" rule
    // has no correct application on the live catalog.
    expect(controlKindFor({ type: 'range', min: 0, max: 1 })).toBe('counter');
  });

  it('renders an input, not a toggle, for the boolean form', () => {
    // Measured (finding 11): the only key of this form is seed, whose value is a number.
    // The form means "supported, domain not declared" — not "the value is boolean".
    expect(controlKindFor({ type: 'boolean' })).toBe('input');
  });
});

describe('rangeOf', () => {
  it('returns the bounds of a range entry', () => {
    const schema: Record<string, ParamSchema> = { n: { type: 'range', min: 1, max: 6 } };
    expect(rangeOf(schema, 'n')).toEqual({ min: 1, max: 6 });
  });

  it('returns null for a key that is not a range', () => {
    const schema: Record<string, ParamSchema> = { seed: { type: 'boolean' } };
    expect(rangeOf(schema, 'seed')).toBeNull();
  });

  it('returns null for an absent key', () => {
    expect(rangeOf({}, 'n')).toBeNull();
  });
});

describe('maxReferences / availableModes', () => {
  it('offers only text2img when the model declares no references', () => {
    expect(maxReferences({})).toBe(0);
    expect(availableModes({})).toEqual(['text2img']);
  });

  it('offers img2img but not inpaint at one reference', () => {
    // Measured: 16 of 38 models cap input_references at 1 — a mask cannot fit
    const schema: Record<string, ParamSchema> = {
      input_references: { type: 'range', min: 0, max: 1 },
    };
    expect(availableModes(schema)).toEqual(['text2img', 'img2img']);
  });

  it('offers inpaint from two references, because the mask is the second one', () => {
    const schema: Record<string, ParamSchema> = {
      input_references: { type: 'range', min: 0, max: 3 },
    };
    expect(availableModes(schema)).toEqual(['text2img', 'img2img', 'inpaint']);
  });
});

describe('applySchema', () => {
  const schema: Record<string, ParamSchema> = {
    aspect_ratio: { type: 'enum', values: ['1:1', '16:9', 'auto'] },
    resolution: { type: 'enum', values: ['1K', '2K'] },
    output_compression: { type: 'range', min: 0, max: 100 },
    seed: { type: 'boolean' },
    n: { type: 'range', min: 1, max: 6 },
    input_references: { type: 'range', min: 0, max: 4 },
  };

  it('drops a key the new schema does not declare', () => {
    expect(applySchema({ quality: 'high' }, schema)).not.toHaveProperty('quality');
  });

  it('drops a value that fell out of the enum instead of substituting one', () => {
    // Substituting the first allowed value would be an invented default; the spec
    // forbids sending anything the user did not choose.
    expect(applySchema({ resolution: '4K' }, schema)).not.toHaveProperty('resolution');
  });

  it('keeps a value that is still allowed', () => {
    expect(applySchema({ resolution: '2K' }, schema).resolution).toBe('2K');
  });

  it('drops a number outside the declared range', () => {
    expect(applySchema({ output_compression: 250 }, schema)).not.toHaveProperty('output_compression');
  });

  it('keeps any value for the boolean form, whose domain is not declared', () => {
    expect(applySchema({ seed: 12345 }, schema).seed).toBe(12345);
  });

  it('fills auto where the enum declares it and nothing was chosen', () => {
    expect(applySchema({}, schema).aspect_ratio).toBe('auto');
  });

  it('does not invent a value where the enum has no auto', () => {
    expect(applySchema({}, schema)).not.toHaveProperty('resolution');
  });

  it('never carries n or input_references, which are not generic controls', () => {
    const out = applySchema({ n: 4, input_references: 2 }, schema);
    expect(out).not.toHaveProperty('n');
    expect(out).not.toHaveProperty('input_references');
  });

  it('keeps size only while the model declares no resolution', () => {
    expect(applySchema({ size: '2048x2048' }, schema)).not.toHaveProperty('size');
    const noResolution: Record<string, ParamSchema> = { aspect_ratio: schema.aspect_ratio };
    expect(applySchema({ size: '2048x2048' }, noResolution).size).toBe('2048x2048');
  });
});

describe('sizeFor', () => {
  it('makes a square when the aspect ratio is square', () => {
    expect(sizeFor(2048, '1:1')).toBe('2048x2048');
  });

  it('puts the long side on the width for a landscape ratio', () => {
    expect(sizeFor(2048, '16:9')).toBe('2048x1152');
  });

  it('puts the long side on the height for a portrait ratio', () => {
    expect(sizeFor(2048, '9:16')).toBe('1152x2048');
  });

  it('falls back to a square when the ratio is unknown or auto', () => {
    expect(sizeFor(1024, 'auto')).toBe('1024x1024');
    expect(sizeFor(1024, undefined)).toBe('1024x1024');
  });

  it('rounds the long side to a multiple of 8', () => {
    expect(sizeFor(1010, '1:1')).toBe('1008x1008');
  });
});
