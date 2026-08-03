import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RIVERFLOW_ENDPOINTS, FLUX_KLEIN_ENDPOINTS, GEMINI_ENDPOINTS } from './fixtures/catalog';
import { intersectSchemas } from '../electron/services/catalogSchema';

const models = new Map<string, unknown>();

vi.mock('../electron/services/modelCatalog', () => ({
  getModelById: (id: string) => models.get(id),
}));

function register(id: string, endpoints: typeof RIVERFLOW_ENDPOINTS) {
  models.set(id, {
    id,
    name: id,
    description: '',
    schema: intersectSchemas(endpoints),
    passthrough: [],
    pricing: endpoints[0].pricing,
    providerSlugs: endpoints.map((e) => e.provider_slug),
    category: 'quality',
    pricesLoaded: true,
  });
}

beforeEach(() => {
  models.clear();
  register('riverflow', RIVERFLOW_ENDPOINTS);
  register('flux', FLUX_KLEIN_ENDPOINTS);
  register('gemini', GEMINI_ENDPOINTS);
});

describe('estimateCost', () => {
  it('prices a resolution step from its own pricing row', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    expect(estimateCost('riverflow', { resolution: '4K' })).toMatchObject({ estimatedCost: 0.33, basis: 'point' });
    expect(estimateCost('riverflow', { resolution: '1K' })).toMatchObject({ estimatedCost: 0.15, basis: 'point' });
  });

  it('gives an upper bound for a megapixel price', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    const result = estimateCost('flux', { resolution: '1K' });
    expect(result.basis).toBe('upper-bound');
    expect(result.estimatedCost).toBeCloseTo(0.0147, 4);
  });

  it('declines to estimate a token price', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    expect(estimateCost('gemini', { resolution: '1K' })).toMatchObject({ estimatedCost: null, basis: 'unknown' });
  });

  it('returns null, not zero, for a model absent from the catalog', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    const result = estimateCost('nobody/nothing', { resolution: '1K' });
    expect(result.estimatedCost).toBeNull();
    expect(result.basis).toBe('unknown');
  });

  it('declines to estimate a megapixel model when no step is given', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    expect(estimateCost('flux', {})).toMatchObject({ estimatedCost: null, basis: 'unknown' });
  });

  it('never reports a pre-generation estimate as exact', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    for (const id of ['riverflow', 'flux', 'gemini']) {
      expect(estimateCost(id, { resolution: '1K' }).basis).not.toBe('exact');
    }
  });
});

describe('estimateCost with references', () => {
  it('adds the price of every reference image to the output image', async () => {
    // Riverflow: $0.15 per image, $0.20 per reference. img2img with a source and a mask
    // costs more than three times the figure the app shows today.
    const { estimateCost } = await import('../electron/services/costEstimator');
    expect(estimateCost('riverflow', { resolution: '1K' }, 2).estimatedCost).toBeCloseTo(0.55, 6);
  });

  it('counts no references when none are sent', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    expect(estimateCost('riverflow', { resolution: '1K' }, 0).estimatedCost).toBeCloseTo(0.15, 6);
  });

  it('keeps the whole sum unknown when the output price is unknown', async () => {
    // Gemini is billed per token: no pre-generation figure exists, and null never
    // collapses to zero.
    const { estimateCost } = await import('../electron/services/costEstimator');
    expect(estimateCost('gemini', {}, 2).estimatedCost).toBeNull();
  });

  it('derives megapixels from the pixel-form size when there is no resolution step', async () => {
    // FLUX declares no resolution; size in pixel form is the only size control it has.
    const { estimateCost } = await import('../electron/services/costEstimator');
    const estimate = estimateCost('flux', { size: '2048x2048' }, 0);
    expect(estimate.basis).toBe('upper-bound');
    expect(estimate.estimatedCost).toBeCloseTo(0.014 * 4.194304, 4);
  });

  it('makes the whole sum unknown when the output price is known but the reference price is not', async () => {
    // FLUX's fixture pricing has only an output_image row — no input_reference row at
    // all. img2img on FLUX must not silently fall back to the text2img figure; the sum
    // is unknown, not the output-only amount.
    const { estimateCost } = await import('../electron/services/costEstimator');
    const estimate = estimateCost('flux', { size: '2048x2048' }, 1);
    expect(estimate.estimatedCost).toBeNull();
    expect(estimate.basis).toBe('unknown');
  });
});

describe('estimateBatchCost', () => {
  it('multiplies a known price by the count', async () => {
    const { estimateBatchCost } = await import('../electron/services/costEstimator');
    expect(estimateBatchCost('riverflow', { resolution: '4K' }, 3)).toMatchObject({
      totalCost: 0.99,
      perImage: 0.33,
    });
  });

  it('stays null when the per-image price is unknown', async () => {
    const { estimateBatchCost } = await import('../electron/services/costEstimator');
    expect(estimateBatchCost('gemini', { resolution: '1K' }, 3)).toMatchObject({
      totalCost: null,
      perImage: null,
    });
  });
});
