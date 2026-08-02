import type { CatalogRecord, EndpointRecord } from '../../src/shared/types/models';

/** google/gemini-2.5-flash-image — two providers, identical schemas, token pricing */
export const GEMINI_ENDPOINTS: EndpointRecord[] = [
  {
    provider_name: 'Google AI Studio',
    provider_slug: 'google-ai-studio',
    provider_tag: 'google-ai-studio',
    supported_parameters: {
      aspect_ratio: { type: 'enum', values: ['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'] },
      n: { type: 'range', min: 1, max: 1 },
      input_references: { type: 'range', min: 0, max: 3 },
    },
    allowed_passthrough_parameters: ['cachedContent'],
    supports_streaming: false,
    pricing: [
      { billable: 'input_image', unit: 'token', cost_usd: 0.0000003 },
      { billable: 'output_image', unit: 'token', cost_usd: 0.00003 },
    ],
  },
  {
    provider_name: 'Google Vertex',
    provider_slug: 'google-vertex/global',
    provider_tag: 'google-vertex/global',
    supported_parameters: {
      aspect_ratio: { type: 'enum', values: ['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'] },
      n: { type: 'range', min: 1, max: 1 },
      input_references: { type: 'range', min: 0, max: 3 },
    },
    allowed_passthrough_parameters: ['cachedContent'],
    supports_streaming: false,
    pricing: [
      { billable: 'input_image', unit: 'token', cost_usd: 0.0000003 },
      { billable: 'output_image', unit: 'token', cost_usd: 0.00003 },
    ],
  },
];

/** sourceful/riverflow-v2-pro — resolution steps, separated pricing set, extra billables */
export const RIVERFLOW_ENDPOINTS: EndpointRecord[] = [
  {
    provider_name: 'Sourceful',
    provider_slug: 'sourceful',
    provider_tag: 'sourceful',
    supported_parameters: {
      resolution: { type: 'enum', values: ['1K', '2K', '4K'] },
      aspect_ratio: { type: 'enum', values: ['1:1', '16:9', '9:16'] },
      n: { type: 'range', min: 1, max: 1 },
      input_references: { type: 'range', min: 0, max: 8 },
    },
    allowed_passthrough_parameters: ['font_inputs', 'style'],
    supports_streaming: false,
    pricing: [
      { billable: 'output_image', unit: 'image', cost_usd: 0.15 },
      { billable: 'output_image', unit: 'image', cost_usd: 0.15, variant: '2k' },
      { billable: 'output_image', unit: 'image', cost_usd: 0.33, variant: '4k' },
      { billable: 'input_font', unit: 'image', cost_usd: 0.03 },
      { billable: 'input_reference', unit: 'image', cost_usd: 0.2 },
    ],
  },
];

/** black-forest-labs/flux.2-klein-4b — megapixel pricing, no resolution parameter */
export const FLUX_KLEIN_ENDPOINTS: EndpointRecord[] = [
  {
    provider_name: 'Black Forest Labs',
    provider_slug: 'black-forest-labs',
    provider_tag: 'black-forest-labs',
    supported_parameters: {
      aspect_ratio: { type: 'enum', values: ['1:1','4:3','3:4','3:2','2:3','16:9','9:16','21:9','auto'] },
      output_format: { type: 'enum', values: ['png', 'jpeg'] },
      n: { type: 'range', min: 1, max: 1 },
      input_references: { type: 'range', min: 0, max: 8 },
      seed: { type: 'boolean' },
    },
    allowed_passthrough_parameters: ['steps', 'guidance', 'safety_tolerance'],
    supports_streaming: false,
    pricing: [{ billable: 'output_image', unit: 'megapixel', cost_usd: 0.014 }],
  },
];

/** bytedance-seed/seedream-4.5 — resolution steps but a flat pricing set */
export const SEEDREAM_ENDPOINTS: EndpointRecord[] = [
  {
    provider_name: 'Seed',
    provider_slug: 'seed',
    provider_tag: 'seed',
    supported_parameters: {
      resolution: { type: 'enum', values: ['1K', '2K', '4K'] },
      aspect_ratio: { type: 'enum', values: ['1:1', '16:9', '9:16'] },
      n: { type: 'range', min: 1, max: 1 },
      input_references: { type: 'range', min: 0, max: 10 },
      seed: { type: 'boolean' },
    },
    allowed_passthrough_parameters: [],
    supports_streaming: false,
    pricing: [{ billable: 'output_image', unit: 'image', cost_usd: 0.04 }],
  },
];

/** Two providers whose schemas disagree — synthetic, to test intersection */
export const DIVERGING_ENDPOINTS: EndpointRecord[] = [
  {
    provider_name: 'Provider A',
    provider_slug: 'a',
    provider_tag: 'a',
    supported_parameters: {
      resolution: { type: 'enum', values: ['1K', '2K', '4K'] },
      seed: { type: 'boolean' },
      input_references: { type: 'range', min: 0, max: 8 },
    },
    allowed_passthrough_parameters: ['steps', 'guidance'],
    supports_streaming: false,
    pricing: [{ billable: 'output_image', unit: 'image', cost_usd: 0.1 }],
  },
  {
    provider_name: 'Provider B',
    provider_slug: 'b',
    provider_tag: 'b',
    supported_parameters: {
      resolution: { type: 'enum', values: ['1K', '2K'] },
      input_references: { type: 'range', min: 0, max: 3 },
    },
    allowed_passthrough_parameters: ['steps'],
    supports_streaming: false,
    pricing: [{ billable: 'output_image', unit: 'image', cost_usd: 0.12 }],
  },
];

/** A catalog record, shape verified against the live API */
export const CATALOG_SAMPLE: CatalogRecord = {
  id: 'microsoft/mai-image-2.5-pro',
  name: 'Microsoft: MAI-Image-2.5 Pro',
  description: 'Microsoft image generation model.',
  created: 1784827701,
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] },
  supported_parameters: {
    aspect_ratio: { type: 'enum', values: ['1:1','4:3','3:4','16:9','9:16','3:2','2:3','auto'] },
    n: { type: 'range', min: 1, max: 1 },
    input_references: { type: 'range', min: 0, max: 1 },
  },
  supports_streaming: false,
  endpoints: '/api/v1/images/models/microsoft/mai-image-2.5-pro/endpoints',
};
