import type { GenerationParams } from '../types/api';
import type { GenerationMode, ParamSchema } from '../types/models';

/**
 * Keys that never appear in the generic parameter record: they are driven by something
 * other than a schema control. input_references is filled from the mode (source image,
 * mask); n is not sent at all while batching stays sequential (spec, section 10).
 */
export const SKIPPED_KEYS: readonly string[] = ['input_references', 'n'];

/** The synthetic size parameter — declared by no model, but measured to work (spec 5.3). */
const SIZE_KEY = 'size';

/** True when the parameter exists at all. Absence means the model has no such parameter. */
export function hasParameter(schema: Record<string, ParamSchema>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(schema, key);
}

/** Allowed values of an enum parameter, or null when the key is absent or not an enum. */
export function enumValues(schema: Record<string, ParamSchema>, key: string): string[] | null {
  const entry = schema[key];
  if (!entry || entry.type !== 'enum') return null;
  return entry.values;
}

/** Bounds of a range parameter, or null when the key is absent or not a range. */
export function rangeOf(
  schema: Record<string, ParamSchema>,
  key: string,
): { min: number; max: number } | null {
  const entry = schema[key];
  if (!entry || entry.type !== 'range') return null;
  return { min: entry.min, max: entry.max };
}

export type ControlKind = 'enum' | 'counter' | 'input' | 'none';

/**
 * Which control the shape of a schema entry calls for.
 *
 * This deliberately differs from the table in the openrouter-model-registry skill,
 * section 4, which a sweep of all 38 catalog models contradicted twice (finding 11):
 * the 'boolean' form is not a toggle — its only key is seed, whose value is a number —
 * and a 0..1 range is not a toggle either, being a count of reference images.
 */
export function controlKindFor(entry: ParamSchema): ControlKind {
  if (entry.type === 'enum') return 'enum';
  if (entry.type === 'boolean') return 'input';
  return entry.min === entry.max ? 'none' : 'counter';
}

/** How many reference images the model accepts. Zero when it declares none. */
export function maxReferences(schema: Record<string, ParamSchema>): number {
  return rangeOf(schema, 'input_references')?.max ?? 0;
}

/**
 * Modes this model can actually serve. Inpaint needs two references — the source and
 * the mask — and 16 of 38 catalog models cap input_references at one (finding 11).
 */
export function availableModes(schema: Record<string, ParamSchema>): GenerationMode[] {
  const references = maxReferences(schema);
  const modes: GenerationMode[] = ['text2img'];
  if (references >= 1) modes.push('img2img');
  if (references >= 2) modes.push('inpaint');
  return modes;
}

/** True when the value is still allowed by the entry the schema declares for it. */
function valueFits(entry: ParamSchema, value: GenerationParams[string]): boolean {
  if (entry.type === 'enum') return typeof value === 'string' && entry.values.includes(value);
  if (entry.type === 'range') {
    return typeof value === 'number' && value >= entry.min && value <= entry.max;
  }
  // The boolean form declares no domain, so nothing can be judged out of it.
  return true;
}

/**
 * Bring a parameter record to a model's schema: drop what it does not allow.
 *
 * A value that fell out of the schema is dropped, not replaced with the first allowed
 * one — a substituted value is an invented default, and nothing the user did not choose
 * may be sent. An unset parameter simply is not sent, and the provider decides.
 *
 * This is the only step trusted at the point a request is actually sent: the schema
 * of a catalog record that has not finished loading its prices is the catalog-record
 * schema, not the cross-provider intersection (openrouter-model-registry, section 5),
 * so it must never be used to invent a value — only to reject one.
 */
export function filterToSchema(
  params: GenerationParams,
  schema: Record<string, ParamSchema>,
): GenerationParams {
  const out: GenerationParams = {};

  for (const [key, value] of Object.entries(params)) {
    if (SKIPPED_KEYS.includes(key)) continue;
    if (key === SIZE_KEY) {
      // size is declared by no model; it is offered exactly while there is no resolution
      if (!hasParameter(schema, 'resolution')) out[key] = value;
      continue;
    }
    const entry = schema[key];
    if (!entry) continue;
    if (controlKindFor(entry) === 'none') continue;
    if (valueFits(entry, value)) out[key] = value;
  }

  return out;
}

/**
 * Drop what the schema does not allow, then fill 'auto' where the schema offers it.
 *
 * The fill step is UI work: it is only safe once the schema is trustworthy, which the
 * caller must already have established (see filterToSchema). Used by the store to
 * settle the record after a model switch, behind the pricesLoaded gate.
 */
export function applySchema(
  params: GenerationParams,
  schema: Record<string, ParamSchema>,
): GenerationParams {
  const out = filterToSchema(params, schema);

  for (const [key, entry] of Object.entries(schema)) {
    if (SKIPPED_KEYS.includes(key)) continue;
    if (key in out) continue;
    if (entry.type === 'enum' && entry.values.includes('auto')) out[key] = 'auto';
  }

  return out;
}

/**
 * Pixel form of size, derived from the long side and the chosen aspect ratio so the two
 * cannot contradict each other. Sides are rounded to a multiple of 8, which providers
 * expect; an unknown or 'auto' ratio yields a square.
 */
export function sizeFor(longSide: number, aspectRatio: string | undefined): string {
  const round = (value: number) => Math.max(8, Math.round(value / 8) * 8);
  const roundedLongSide = round(longSide);
  const match = aspectRatio ? /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspectRatio) : null;
  if (!match) return `${roundedLongSide}x${roundedLongSide}`;

  const w = Number(match[1]);
  const h = Number(match[2]);

  return w >= h
    ? `${roundedLongSide}x${round((roundedLongSide * h) / w)}`
    : `${round((roundedLongSide * w) / h)}x${roundedLongSide}`;
}
