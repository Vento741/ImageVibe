/** Model category for UI grouping */
export type ModelCategory = 'fast' | 'quality' | 'smart';

/** Generation mode */
export type GenerationMode = 'text2img' | 'img2img' | 'inpaint' | 'upscale';

/** Image size presets */
export type ImageSize = '1K' | '2K' | '4K';

/** Aspect ratio options */
export type AspectRatio =
  | '1:1'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '3:2'
  | '2:3'
  | '21:9';

/** Pricing model type */
export type PricingType = 'per_image' | 'per_megapixel' | 'per_token';

/** What a model supports */
export interface ModelSupports {
  textToImage: boolean;
  imageToImage: boolean;
  inpainting: boolean;
  seed: boolean;
  aspectRatio: boolean;
  imageSize: boolean;
  negativePrompt: boolean;
  fontInputs: boolean;
  superResolution: boolean;
  extendedAspectRatios: boolean;
  textOutput: boolean;
  reasoning: boolean;
  multiImageComposition: boolean;
}

/** Pricing info for a model */
export interface ModelPricing {
  type: PricingType;
  /** Per-image flat cost (USD) */
  perImage?: number;
  /** Per-megapixel cost (USD) */
  perMegapixel?: number;
  /** Per input token cost (USD) */
  perPromptToken?: number;
  /** Per output token cost (USD) */
  perCompletionToken?: number;
  /** Per image output token cost (USD) — for LLM image models */
  perImageOutputToken?: number;
}

/** Available image sizes for a model */
export interface ModelSizes {
  '1K'?: { width: number; height: number };
  '2K'?: { width: number; height: number };
  '4K'?: { width: number; height: number };
}

/** A model definition */
export interface ImageModel {
  id: string;
  name: string;
  provider: string;
  category: ModelCategory;
  description: string;
  pricing: ModelPricing;
  supports: ModelSupports;
  sizes: ModelSizes;
  defaultAspectRatio: AspectRatio;
  defaultSize: ImageSize;
  maxImages?: number;
  hidden: boolean;
}

/** All 13 model IDs as const for type-safety */
export const MODEL_IDS = [
  'black-forest-labs/flux.2-max',
  'black-forest-labs/flux.2-pro',
  'black-forest-labs/flux.2-flex',
  'black-forest-labs/flux.2-klein-4b',
  'openai/gpt-5-image',
  'openai/gpt-5-image-mini',
  'google/gemini-3-pro-image-preview',
  'google/gemini-3.1-flash-image-preview',
  'google/gemini-2.5-flash-image',
  'bytedance-seed/seedream-4.5',
  'sourceful/riverflow-v2-pro',
  'sourceful/riverflow-v2-fast',
  'sourceful/riverflow-v2-max-preview',
] as const;

export type ModelId = (typeof MODEL_IDS)[number];
