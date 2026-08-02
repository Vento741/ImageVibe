import type { ModelCategory, PricingRow } from '../../src/shared/types/models';

/** Order a resolution step by pixels: '512' -> 512, '2K' -> 2048. */
export function stepRank(step: string): number {
  const match = /^(\d+)(k)?$/i.exec(step.trim());
  if (!match) return Number.NaN;
  const value = Number(match[1]);
  return match[2] ? value * 1024 : value;
}

/** Rows describing one billable entity. Different billables sum, they do not compete. */
export function rowsFor(pricing: PricingRow[], billable: string): PricingRow[] {
  return pricing.filter((row) => row.billable === billable);
}

/**
 * The pricing row that provably covers `step`, or null.
 * `declaredSteps` are the values of supported_parameters.resolution of the same endpoint.
 */
export function selectRow(
  rows: PricingRow[],
  step: string | null,
  declaredSteps: string[],
): PricingRow | null {
  if (rows.length === 0) return null;

  const separated = rows.some((row) => row.variant);
  if (!separated) return rows[0];

  if (step === null) return null;
  const wanted = step.toLowerCase();

  const matched = rows.find((row) => row.variant?.toLowerCase() === wanted);
  if (matched) return matched;

  const base = rows.find((row) => !row.variant);
  if (!base || declaredSteps.length === 0) return null;

  const covered = new Set(
    rows.filter((row) => row.variant).map((row) => row.variant!.toLowerCase()),
  );
  const uncovered = declaredSteps
    .filter((declared) => !covered.has(declared.toLowerCase()))
    .sort((a, b) => stepRank(a) - stepRank(b));

  if (uncovered.length === 0) return null;
  return uncovered[0].toLowerCase() === wanted ? base : null;
}

export interface PriceEstimate {
  /** null means the price cannot be derived — never substitute zero */
  amountUsd: number | null;
  /** 'point' — a per-image price; 'upper-bound' — a megapixel rate, measured to overstate */
  basis: 'point' | 'upper-bound' | 'unknown';
  reason?: string;
  /** the rows the estimate was derived from, as returned by the API */
  rows: PricingRow[];
}

/**
 * Estimate what the output image of one generation costs.
 * Every pre-generation estimate is approximate — exact cost arrives in usage.cost.
 */
export function estimateOutputImage(input: {
  pricing: PricingRow[];
  step: string | null;
  declaredSteps: string[];
  megapixels: number | null;
}): PriceEstimate {
  const rows = rowsFor(input.pricing, 'output_image');
  if (rows.length === 0) {
    return {
      amountUsd: null,
      basis: 'unknown',
      reason: 'у эндпоинта нет строк pricing для выходного изображения',
      rows: [],
    };
  }

  const row = selectRow(rows, input.step, input.declaredSteps);
  if (!row) {
    return {
      amountUsd: null,
      basis: 'unknown',
      reason: 'ни одна строка pricing не покрывает выбранную ступень',
      rows,
    };
  }

  if (row.unit === 'image') {
    return { amountUsd: row.cost_usd, basis: 'point', rows };
  }

  if (row.unit === 'megapixel') {
    if (input.megapixels === null) {
      return {
        amountUsd: null,
        basis: 'unknown',
        reason: 'размер изображения неизвестен до генерации',
        rows,
      };
    }
    return { amountUsd: row.cost_usd * input.megapixels, basis: 'upper-bound', rows };
  }

  return {
    amountUsd: null,
    basis: 'unknown',
    reason: `пересчёт для единицы «${row.unit}» до генерации невозможен`,
    rows,
  };
}

/**
 * Price of one unit of a billable other than the output image — a reference image, a
 * font input. Different billables sum; they do not compete for the same row.
 * null when the endpoint declares no such billable, or declares it in a unit that
 * cannot be resolved before the generation.
 */
export function estimateBillable(pricing: PricingRow[], billable: string): number | null {
  const rows = rowsFor(pricing, billable);
  if (rows.length === 0) return null;
  const row = rows[0];
  return row.unit === 'image' ? row.cost_usd : null;
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.floor((sorted.length - 1) * q)];
}

/**
 * Split the catalog into three price buckets by tertiles of the observed prices.
 * Boundaries come from the live catalog, so a new model sorts itself without a code change.
 */
export function bucketByPrice(
  entries: Array<{ id: string; price: number | null }>,
): Record<string, ModelCategory> {
  const out: Record<string, ModelCategory> = {};
  const known = entries
    .map((entry) => entry.price)
    .filter((price): price is number => price !== null)
    .sort((a, b) => a - b);

  if (known.length === 0) {
    for (const entry of entries) out[entry.id] = 'quality';
    return out;
  }

  const low = quantile(known, 1 / 3);
  const high = quantile(known, 2 / 3);

  for (const entry of entries) {
    if (entry.price === null) out[entry.id] = 'quality';
    else if (entry.price <= low) out[entry.id] = 'fast';
    else if (entry.price <= high) out[entry.id] = 'quality';
    else out[entry.id] = 'smart';
  }

  return out;
}
