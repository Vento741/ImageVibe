/** Model category for UI grouping */
export type ModelCategory = 'fast' | 'quality' | 'smart';

/** Generation mode */
export type GenerationMode = 'text2img' | 'img2img' | 'inpaint';

/** One entry of supported_parameters, as returned by the API */
export type ParamSchema =
  | { type: 'enum'; values: string[] }
  | { type: 'range'; min: number; max: number }
  | { type: 'boolean' };

/** One row of the pricing array of an endpoint record */
export interface PricingRow {
  billable: string;
  unit: string;
  cost_usd: number;
  variant?: string;
}

/** A record of GET /api/v1/images/models */
export interface CatalogRecord {
  id: string;
  name: string;
  description: string;
  created: number;
  architecture: { input_modalities: string[]; output_modalities: string[] };
  supported_parameters: Record<string, ParamSchema>;
  supports_streaming: boolean;
  /** URL path to the endpoints resource, not the endpoints themselves */
  endpoints: string;
}

/** One provider entry of GET /api/v1/images/models/{id}/endpoints */
export interface EndpointRecord {
  provider_name: string;
  provider_slug: string;
  provider_tag: string;
  supported_parameters: Record<string, ParamSchema>;
  allowed_passthrough_parameters: string[];
  supports_streaming: boolean;
  pricing: PricingRow[];
}
