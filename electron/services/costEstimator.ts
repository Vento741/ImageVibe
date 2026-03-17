import type { ImageSize } from '../../src/shared/types/models';
import type { CostEstimate } from '../../src/shared/types/ipc';
import { getModelById } from './modelRegistry';

/** Megapixel counts for each image size */
const SIZE_MEGAPIXELS: Record<ImageSize, number> = {
  '1K': 1.0,    // 1024×1024 = ~1MP
  '2K': 4.0,    // 2048×2048 = ~4MP
  '4K': 16.0,   // 4096×4096 = ~16MP
};

/** Estimated output tokens for image generation by LLM models */
const ESTIMATED_IMAGE_OUTPUT_TOKENS = 1120;
const ESTIMATED_PROMPT_TOKENS = 150;

/**
 * Estimate the cost of a generation before it happens.
 * Used to show the user "~$0.03" before they click Generate.
 */
export function estimateCost(
  modelId: string,
  imageSize: ImageSize = '1K',
): CostEstimate {
  const model = getModelById(modelId);
  if (!model) {
    return {
      estimatedCost: 0,
      confidence: 'approximate',
      modelPricing: {},
    };
  }

  const pricing = model.pricing;
  let estimatedCost = 0;
  let confidence: 'exact' | 'approximate' = 'exact';

  switch (pricing.type) {
    case 'per_image': {
      estimatedCost = pricing.perImage ?? 0;
      break;
    }
    case 'per_megapixel': {
      const mp = SIZE_MEGAPIXELS[imageSize] ?? 1.0;
      estimatedCost = (pricing.perMegapixel ?? 0) * mp;
      break;
    }
    case 'per_token': {
      // Token-based models (Gemini, GPT) — estimate based on typical usage
      const promptCost = (pricing.perPromptToken ?? 0) * ESTIMATED_PROMPT_TOKENS;
      const outputTokenCost = pricing.perImageOutputToken ?? pricing.perCompletionToken ?? 0;
      const outputCost = outputTokenCost * ESTIMATED_IMAGE_OUTPUT_TOKENS;
      estimatedCost = promptCost + outputCost;
      confidence = 'approximate';
      break;
    }
  }

  return {
    estimatedCost: Math.round(estimatedCost * 1000000) / 1000000, // 6 decimal precision
    confidence,
    modelPricing: {
      perImage: pricing.perImage,
      perMegapixel: pricing.perMegapixel,
      perToken: pricing.perPromptToken,
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
