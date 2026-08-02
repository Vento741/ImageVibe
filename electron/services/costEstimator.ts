import type { CostEstimate } from '../../src/shared/types/ipc';
import { enumValues } from './catalogSchema';
import { estimateOutputImage } from './catalogPricing';
import { getModelById } from './modelCatalog';

/** '1K' -> 1024. A step names the side of the square in thousands of pixels. */
function stepToPixels(step: string): number | null {
  const match = /^(\d+)(k)?$/i.exec(step.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] ? value * 1024 : value;
}

function megapixelsFor(step: string | undefined): number | null {
  if (!step) return null;
  const side = stepToPixels(step);
  if (side === null) return null;
  return (side * side) / 1_000_000;
}

/**
 * Estimate what a generation will cost, from the pricing rows of the live catalog.
 * Always approximate: the exact figure arrives in usage.cost after the generation.
 */
export function estimateCost(modelId: string, imageSize?: string): CostEstimate {
  const model = getModelById(modelId);
  if (!model) {
    return {
      estimatedCost: null,
      basis: 'unknown',
      reason: 'модель отсутствует в каталоге',
      pricing: [],
    };
  }

  const declaredSteps = enumValues(model.schema, 'resolution') ?? [];
  const step = imageSize && declaredSteps.length > 0 ? imageSize : null;

  const estimate = estimateOutputImage({
    pricing: model.pricing,
    step,
    declaredSteps,
    megapixels: megapixelsFor(imageSize),
  });

  return {
    estimatedCost: estimate.amountUsd,
    basis: estimate.basis,
    reason: estimate.reason,
    pricing: estimate.rows,
  };
}

/** Estimate a batch of N images. Unknown stays unknown — it does not collapse to zero. */
export function estimateBatchCost(
  modelId: string,
  imageSize: string | undefined,
  count: number,
): { totalCost: number | null; perImage: number | null; basis: CostEstimate['basis'] } {
  const estimate = estimateCost(modelId, imageSize);
  if (estimate.estimatedCost === null) {
    return { totalCost: null, perImage: null, basis: estimate.basis };
  }
  return {
    totalCost: estimate.estimatedCost * count,
    perImage: estimate.estimatedCost,
    basis: estimate.basis,
  };
}
