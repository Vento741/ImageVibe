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
    expect(estimateCost('riverflow', '4K')).toMatchObject({ estimatedCost: 0.33, basis: 'point' });
    expect(estimateCost('riverflow', '1K')).toMatchObject({ estimatedCost: 0.15, basis: 'point' });
  });

  it('gives an upper bound for a megapixel price', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    const result = estimateCost('flux', '1K');
    expect(result.basis).toBe('upper-bound');
    expect(result.estimatedCost).toBeCloseTo(0.0147, 4);
  });

  it('declines to estimate a token price', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    expect(estimateCost('gemini', '1K')).toMatchObject({ estimatedCost: null, basis: 'unknown' });
  });

  it('returns null, not zero, for a model absent from the catalog', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    const result = estimateCost('nobody/nothing', '1K');
    expect(result.estimatedCost).toBeNull();
    expect(result.basis).toBe('unknown');
  });

  it('declines to estimate a megapixel model when no step is given', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    expect(estimateCost('flux')).toMatchObject({ estimatedCost: null, basis: 'unknown' });
  });

  it('never reports a pre-generation estimate as exact', async () => {
    const { estimateCost } = await import('../electron/services/costEstimator');
    for (const id of ['riverflow', 'flux', 'gemini']) {
      expect(estimateCost(id, '1K').basis).not.toBe('exact');
    }
  });
});

describe('estimateBatchCost', () => {
  it('multiplies a known price by the count', async () => {
    const { estimateBatchCost } = await import('../electron/services/costEstimator');
    expect(estimateBatchCost('riverflow', '4K', 3)).toMatchObject({
      totalCost: 0.99,
      perImage: 0.33,
    });
  });

  it('stays null when the per-image price is unknown', async () => {
    const { estimateBatchCost } = await import('../electron/services/costEstimator');
    expect(estimateBatchCost('gemini', '1K', 3)).toMatchObject({
      totalCost: null,
      perImage: null,
    });
  });
});
