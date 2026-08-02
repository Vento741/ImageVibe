import type { GenerationParams } from '../../src/shared/types/api';
import type { CostEstimate } from '../../src/shared/types/ipc';
import { enumValues } from './catalogSchema';
import { estimateBillable, estimateOutputImage } from './catalogPricing';
import { getModelById } from './modelCatalog';

/** '1K' -> 1024. A step names the side of the square in thousands of pixels. */
function stepToPixels(step: string): number | null {
  const match = /^(\d+)(k)?$/i.exec(step.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] ? value * 1024 : value;
}

/** Megapixels of the output, from the resolution step or the pixel-form size. */
function megapixelsFor(params: GenerationParams): number | null {
  const size = params.size;
  if (typeof size === 'string') {
    const match = /^(\d+)x(\d+)$/i.exec(size.trim());
    if (match) return (Number(match[1]) * Number(match[2])) / 1_000_000;
  }
  const step = params.resolution;
  if (typeof step !== 'string') return null;
  const side = stepToPixels(step);
  return side === null ? null : (side * side) / 1_000_000;
}

/**
 * Estimate what a generation will cost, from the pricing rows of the live catalog.
 * Always approximate: the exact figure arrives in usage.cost of the generation itself.
 */
export function estimateCost(
  modelId: string,
  params: GenerationParams,
  referenceCount = 0,
): CostEstimate {
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
  const step = typeof params.resolution === 'string' && declaredSteps.length > 0
    ? params.resolution
    : null;

  const output = estimateOutputImage({
    pricing: model.pricing,
    step,
    declaredSteps,
    megapixels: megapixelsFor(params),
  });

  if (output.amountUsd === null || referenceCount === 0) {
    return {
      estimatedCost: output.amountUsd,
      basis: output.basis,
      reason: output.reason,
      pricing: output.rows,
    };
  }

  const perReference = estimateBillable(model.pricing, 'input_reference');
  if (perReference === null) {
    // The model declares references but not their price — the total is not knowable,
    // and an output-only figure would understate it.
    return {
      estimatedCost: null,
      basis: 'unknown',
      reason: 'цена референсных изображений не объявлена',
      pricing: output.rows,
    };
  }

  return {
    estimatedCost: output.amountUsd + perReference * referenceCount,
    basis: output.basis,
    reason: output.reason,
    pricing: output.rows,
  };
}

/** Estimate a batch of N images. Unknown stays unknown — it does not collapse to zero. */
export function estimateBatchCost(
  modelId: string,
  params: GenerationParams,
  count: number,
  referenceCount = 0,
): { totalCost: number | null; perImage: number | null; basis: CostEstimate['basis'] } {
  const estimate = estimateCost(modelId, params, referenceCount);
  if (estimate.estimatedCost === null) {
    return { totalCost: null, perImage: null, basis: estimate.basis };
  }
  return {
    totalCost: estimate.estimatedCost * count,
    perImage: estimate.estimatedCost,
    basis: estimate.basis,
  };
}
