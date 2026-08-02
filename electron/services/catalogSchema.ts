import type { EndpointRecord, ParamSchema } from '../../src/shared/types/models';

export { hasParameter, enumValues } from '../../src/shared/lib/paramSchema';

/** Narrow two schemas of the same key to what both providers accept. */
function intersectPair(a: ParamSchema, b: ParamSchema): ParamSchema | null {
  if (a.type === 'boolean' && b.type === 'boolean') return a;
  if (a.type === 'enum' && b.type === 'enum') {
    const values = a.values.filter((v) => b.values.includes(v));
    return values.length > 0 ? { type: 'enum', values } : null;
  }
  if (a.type === 'range' && b.type === 'range') {
    const min = Math.max(a.min, b.min);
    const max = Math.min(a.max, b.max);
    return max >= min ? { type: 'range', min, max } : null;
  }
  return null;
}

/**
 * The schema safe to offer when the provider is not pinned: what every endpoint of the
 * model accepts. Showing the union would offer values one provider rejects.
 */
export function intersectSchemas(endpoints: EndpointRecord[]): Record<string, ParamSchema> {
  if (endpoints.length === 0) return {};
  const [first, ...rest] = endpoints;
  const out: Record<string, ParamSchema> = {};

  for (const [key, schema] of Object.entries(first.supported_parameters)) {
    let merged: ParamSchema | null = schema;
    for (const endpoint of rest) {
      const other = endpoint.supported_parameters[key];
      if (!other || !merged) {
        merged = null;
        break;
      }
      merged = intersectPair(merged, other);
    }
    if (merged) out[key] = merged;
  }

  return out;
}

/** Passthrough names every provider of the model allows. */
export function intersectPassthrough(endpoints: EndpointRecord[]): string[] {
  if (endpoints.length === 0) return [];
  return endpoints[0].allowed_passthrough_parameters.filter((name) =>
    endpoints.every((endpoint) => endpoint.allowed_passthrough_parameters.includes(name)),
  );
}
