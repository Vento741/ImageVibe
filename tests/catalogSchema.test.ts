import { describe, it, expect } from 'vitest';
import {
  intersectSchemas,
  intersectPassthrough,
  enumValues,
  hasParameter,
} from '../electron/services/catalogSchema';
import {
  GEMINI_ENDPOINTS,
  RIVERFLOW_ENDPOINTS,
  FLUX_KLEIN_ENDPOINTS,
  DIVERGING_ENDPOINTS,
} from './fixtures/catalog';

describe('intersectSchemas', () => {
  it('returns the schema unchanged for a single endpoint', () => {
    const merged = intersectSchemas(RIVERFLOW_ENDPOINTS);
    expect(enumValues(merged, 'resolution')).toEqual(['1K', '2K', '4K']);
  });

  it('keeps identical schemas of two providers intact', () => {
    const merged = intersectSchemas(GEMINI_ENDPOINTS);
    expect(enumValues(merged, 'aspect_ratio')).toHaveLength(10);
  });

  it('narrows an enum to the values every provider accepts', () => {
    const merged = intersectSchemas(DIVERGING_ENDPOINTS);
    expect(enumValues(merged, 'resolution')).toEqual(['1K', '2K']);
  });

  it('narrows a range to the bounds every provider accepts', () => {
    const merged = intersectSchemas(DIVERGING_ENDPOINTS);
    expect(merged.input_references).toEqual({ type: 'range', min: 0, max: 3 });
  });

  it('drops a key that one provider does not declare', () => {
    const merged = intersectSchemas(DIVERGING_ENDPOINTS);
    expect(hasParameter(merged, 'seed')).toBe(false);
  });

  it('returns an empty schema when there are no endpoints', () => {
    expect(intersectSchemas([])).toEqual({});
  });
});

describe('hasParameter', () => {
  it('reports a parameter the model declares', () => {
    const merged = intersectSchemas(FLUX_KLEIN_ENDPOINTS);
    expect(hasParameter(merged, 'seed')).toBe(true);
  });

  it('reports absence of resolution for a model without it', () => {
    const merged = intersectSchemas(FLUX_KLEIN_ENDPOINTS);
    expect(hasParameter(merged, 'resolution')).toBe(false);
  });
});

describe('enumValues', () => {
  it('returns null for a key that is not an enum', () => {
    const merged = intersectSchemas(FLUX_KLEIN_ENDPOINTS);
    expect(enumValues(merged, 'seed')).toBeNull();
  });

  it('returns null for an absent key', () => {
    const merged = intersectSchemas(FLUX_KLEIN_ENDPOINTS);
    expect(enumValues(merged, 'resolution')).toBeNull();
  });
});

describe('intersectPassthrough', () => {
  it('keeps only names every provider allows', () => {
    expect(intersectPassthrough(DIVERGING_ENDPOINTS)).toEqual(['steps']);
  });

  it('returns an empty list when there are no endpoints', () => {
    expect(intersectPassthrough([])).toEqual([]);
  });
});
