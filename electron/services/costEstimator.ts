import type { ImageSize } from '../../src/shared/types/models';
import type { CostEstimate } from '../../src/shared/types/ipc';

/**
 * Real benchmark-measured costs per model at 1K (1024x1024).
 * Based on actual OpenRouter API responses (March 2026).
 * Token-based models (Gemini, GPT) have variable costs — these are typical values.
 */
const BENCHMARK_COSTS_1K: Record<string, number> = {
  'black-forest-labs/flux.2-klein-4b': 0.017,
  'sourceful/riverflow-v2-fast': 0.02,
  'google/gemini-3.1-flash-image-preview': 0.068,
  'google/gemini-2.5-flash-image': 0.039,
  'black-forest-labs/flux.2-pro': 0.075,
  'black-forest-labs/flux.2-max': 0.16,
  'black-forest-labs/flux.2-flex': 0.20,
  'bytedance-seed/seedream-4.5': 0.04,
  'sourceful/riverflow-v2-pro': 0.06,
  'sourceful/riverflow-v2-max-preview': 0.08,
  'google/gemini-3-pro-image-preview': 0.137,
  'openai/gpt-5-image': 0.209,
  'openai/gpt-5-image-mini': 0.043,
};

/** Size multipliers relative to 1K */
const SIZE_MULTIPLIER: Record<ImageSize, number> = {
  '1K': 1.0,
  '2K': 2.5,  // ~2.5x for 4x pixels (not linear due to provider pricing)
  '4K': 6.0,  // ~6x for 16x pixels
};

/**
 * Estimate the cost of a generation before it happens.
 * Uses real benchmark data from OpenRouter API.
 */
export function estimateCost(
  modelId: string,
  imageSize: ImageSize = '1K',
): CostEstimate {
  const baseCost = BENCHMARK_COSTS_1K[modelId];

  if (baseCost === undefined) {
    return {
      estimatedCost: 0,
      confidence: 'approximate',
      modelPricing: {},
    };
  }

  const multiplier = SIZE_MULTIPLIER[imageSize] ?? 1.0;
  const estimatedCost = baseCost * multiplier;

  // Token-based models have variable costs
  const isTokenBased = modelId.startsWith('google/') || modelId.startsWith('openai/');

  return {
    estimatedCost: Math.round(estimatedCost * 1000000) / 1000000,
    confidence: isTokenBased ? 'approximate' : 'exact',
    modelPricing: {
      perImage: baseCost,
    },
  };
}

/** Estimate batch cost (N images) */
export function estimateBatchCost(
  modelId: string,
  imageSize: ImageSize,
  count: number,
): { totalCost: number; perImage: number } {
  const estimate = estimateCost(modelId, imageSize);
  return {
    totalCost: estimate.estimatedCost * count,
    perImage: estimate.estimatedCost,
  };
}
