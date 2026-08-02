import { describe, it, expect } from 'vitest';
import {
  stepRank,
  rowsFor,
  selectRow,
  estimateOutputImage,
  bucketByPrice,
} from '../electron/services/catalogPricing';
import {
  RIVERFLOW_ENDPOINTS,
  FLUX_KLEIN_ENDPOINTS,
  SEEDREAM_ENDPOINTS,
  GEMINI_ENDPOINTS,
} from './fixtures/catalog';

const RIVERFLOW_PRICING = RIVERFLOW_ENDPOINTS[0].pricing;
const RIVERFLOW_STEPS = ['1K', '2K', '4K'];

describe('stepRank', () => {
  it('orders steps by pixels, not lexicographically', () => {
    expect(stepRank('512')).toBeLessThan(stepRank('1K'));
    expect(stepRank('1K')).toBeLessThan(stepRank('2K'));
    expect(stepRank('2K')).toBeLessThan(stepRank('4K'));
  });

  it('is case insensitive', () => {
    expect(stepRank('2k')).toBe(stepRank('2K'));
  });

  it('returns NaN for an unparseable step', () => {
    expect(Number.isNaN(stepRank('huge'))).toBe(true);
  });
});

describe('rowsFor', () => {
  it('keeps only the rows of the requested billable', () => {
    expect(rowsFor(RIVERFLOW_PRICING, 'output_image')).toHaveLength(3);
    expect(rowsFor(RIVERFLOW_PRICING, 'input_font')).toHaveLength(1);
    expect(rowsFor(RIVERFLOW_PRICING, 'nothing')).toEqual([]);
  });
});

describe('selectRow — flat set', () => {
  it('returns the only row regardless of the step', () => {
    const rows = rowsFor(SEEDREAM_ENDPOINTS[0].pricing, 'output_image');
    expect(selectRow(rows, '4K', ['1K', '2K', '4K'])?.cost_usd).toBe(0.04);
    expect(selectRow(rows, '1K', ['1K', '2K', '4K'])?.cost_usd).toBe(0.04);
  });

  it('returns the only row when no step is chosen', () => {
    const rows = rowsFor(FLUX_KLEIN_ENDPOINTS[0].pricing, 'output_image');
    expect(selectRow(rows, null, [])?.cost_usd).toBe(0.014);
  });
});

describe('selectRow — separated set', () => {
  const rows = rowsFor(RIVERFLOW_PRICING, 'output_image');

  it('matches a variant ignoring case', () => {
    expect(selectRow(rows, '4K', RIVERFLOW_STEPS)?.cost_usd).toBe(0.33);
    expect(selectRow(rows, '2K', RIVERFLOW_STEPS)?.cost_usd).toBe(0.15);
  });

  it('lets the row without a variant cover the lowest uncovered step', () => {
    const picked = selectRow(rows, '1K', RIVERFLOW_STEPS);
    expect(picked?.cost_usd).toBe(0.15);
    expect(picked?.variant).toBeUndefined();
  });

  it('refuses to cover a step that is neither matched nor the lowest uncovered', () => {
    const noVariantRows = [
      { billable: 'output_image', unit: 'image', cost_usd: 0.1 },
      { billable: 'output_image', unit: 'image', cost_usd: 0.4, variant: '4k' },
    ];
    expect(selectRow(noVariantRows, '1K', ['1K', '2K', '4K'])?.cost_usd).toBe(0.1);
    expect(selectRow(noVariantRows, '2K', ['1K', '2K', '4K'])).toBeNull();
  });

  it('returns null when the set has no row without a variant and none matches', () => {
    const allVariants = [
      { billable: 'output_image', unit: 'image', cost_usd: 0.1, variant: '1k' },
      { billable: 'output_image', unit: 'image', cost_usd: 0.4, variant: '4k' },
    ];
    expect(selectRow(allVariants, '2K', ['1K', '2K', '4K'])).toBeNull();
    expect(selectRow(allVariants, '1K', ['1K', '2K', '4K'])?.cost_usd).toBe(0.1);
  });

  it('returns null when no step is chosen', () => {
    expect(selectRow(rows, null, RIVERFLOW_STEPS)).toBeNull();
  });

  it('returns null when the endpoint declares no steps at all', () => {
    expect(selectRow(rows, '1K', [])).toBeNull();
  });

  it('returns null for an empty set', () => {
    expect(selectRow([], '1K', RIVERFLOW_STEPS)).toBeNull();
  });
});

describe('estimateOutputImage', () => {
  it('gives a point estimate for a per-image price', () => {
    const result = estimateOutputImage({
      pricing: SEEDREAM_ENDPOINTS[0].pricing,
      step: '1K',
      declaredSteps: ['1K', '2K', '4K'],
      megapixels: 1.049,
    });
    expect(result).toMatchObject({ amountUsd: 0.04, basis: 'point' });
  });

  it('gives a point estimate per resolution step', () => {
    const result = estimateOutputImage({
      pricing: RIVERFLOW_PRICING,
      step: '4K',
      declaredSteps: RIVERFLOW_STEPS,
      megapixels: null,
    });
    expect(result).toMatchObject({ amountUsd: 0.33, basis: 'point' });
  });

  it('gives only an upper bound for a megapixel price', () => {
    const result = estimateOutputImage({
      pricing: FLUX_KLEIN_ENDPOINTS[0].pricing,
      step: null,
      declaredSteps: [],
      megapixels: 4.194,
    });
    expect(result.basis).toBe('upper-bound');
    expect(result.amountUsd).toBeCloseTo(0.0587, 4);
  });

  it('cannot estimate a megapixel price without known dimensions', () => {
    const result = estimateOutputImage({
      pricing: FLUX_KLEIN_ENDPOINTS[0].pricing,
      step: null,
      declaredSteps: [],
      megapixels: null,
    });
    expect(result).toMatchObject({ amountUsd: null, basis: 'unknown' });
  });

  it('cannot estimate a token price before generation', () => {
    const result = estimateOutputImage({
      pricing: GEMINI_ENDPOINTS[0].pricing,
      step: null,
      declaredSteps: [],
      megapixels: 1.049,
    });
    expect(result).toMatchObject({ amountUsd: null, basis: 'unknown' });
  });

  it('reports unknown for an empty pricing array', () => {
    const result = estimateOutputImage({
      pricing: [],
      step: '1K',
      declaredSteps: ['1K'],
      megapixels: 1.049,
    });
    expect(result).toMatchObject({ amountUsd: null, basis: 'unknown' });
  });

  it('never returns zero as a stand-in for an unknown price', () => {
    const result = estimateOutputImage({
      pricing: [],
      step: null,
      declaredSteps: [],
      megapixels: null,
    });
    expect(result.amountUsd).not.toBe(0);
  });
});

describe('bucketByPrice', () => {
  it('splits models into three buckets by tertiles', () => {
    const buckets = bucketByPrice([
      { id: 'a', price: 0.01 },
      { id: 'b', price: 0.02 },
      { id: 'c', price: 0.05 },
      { id: 'd', price: 0.1 },
      { id: 'e', price: 0.2 },
      { id: 'f', price: 0.4 },
    ]);
    expect(buckets.a).toBe('fast');
    expect(buckets.f).toBe('smart');
    expect(new Set(Object.values(buckets)).size).toBe(3);
  });

  it('puts models of unknown price into the middle bucket', () => {
    const buckets = bucketByPrice([
      { id: 'a', price: 0.01 },
      { id: 'b', price: 0.4 },
      { id: 'unknown', price: null },
    ]);
    expect(buckets.unknown).toBe('quality');
  });

  it('puts everything into the middle bucket when no price is known', () => {
    const buckets = bucketByPrice([
      { id: 'a', price: null },
      { id: 'b', price: null },
    ]);
    expect(buckets).toEqual({ a: 'quality', b: 'quality' });
  });

  it('handles an empty catalog', () => {
    expect(bucketByPrice([])).toEqual({});
  });
});
