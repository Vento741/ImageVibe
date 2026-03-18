import type { AspectRatio, ImageSize, ModelId } from './models';

/** Request to generate an image */
export interface GenerationRequest {
  prompt: string;
  translatedPrompt?: string;
  negativePrompt?: string;
  modelId: ModelId | string;
  mode: 'text2img' | 'img2img' | 'inpaint' | 'upscale';
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  seed?: number;
  sourceImageBase64?: string;
  maskBase64?: string;
  styleTags?: string[];
  /** Riverflow-specific */
  fontInputs?: string[];
  superResolution?: boolean;
}

/** Result from a generation */
export interface GenerationResult {
  imageBase64: string;
  generationId: string;
  modelId: string;
  prompt: string;
  translatedPrompt?: string;
  negativePrompt?: string;
  seed?: number;
  width: number;
  height: number;
  costUsd: number;
  costSource: 'actual' | 'estimated';
  generationTimeMs: number;
  tokensInput?: number;
  tokensOutput?: number;
}

/** OpenRouter chat completion request body */
export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  modalities?: string[];
  max_tokens?: number;
  temperature?: number;
  seed?: number;
  image_config?: {
    aspect_ratio?: string;
    image_size?: string;
    num_images?: number;
  };
}

/** OpenRouter message */
export interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | OpenRouterContentPart[];
}

/** Multimodal content part */
export type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** OpenRouter chat completion response */
export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string | OpenRouterContentPart[];
      /** Image generation results — separate from content */
      images?: OpenRouterContentPart[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** OpenRouter generation cost query response */
export interface OpenRouterGenerationInfo {
  id: number;
  generation_id: string;
  model: string;
  provider_name: string;
  generation_time: number;
  tokens_prompt: number;
  tokens_completion: number;
  native_tokens_prompt: number;
  native_tokens_completion: number;
  native_tokens_completion_images: number;
  usage: number; // actual cost in USD
  created_at: string;
  // Nested format fallback
  data?: {
    total_cost?: number;
    usage?: number;
  };
}

/** OpenRouter credits response */
export interface OpenRouterCredits {
  data: {
    total_credits: number;
    total_usage: number;
  };
}

/** OpenRouter error response */
export interface OpenRouterError {
  error: {
    code: number;
    message: string;
    metadata?: Record<string, unknown>;
  };
}

/** Translation request */
export interface TranslationRequest {
  text: string;
  from: 'ru' | 'auto';
  to: 'en';
}

/** Prompt assistant action */
export type PromptAction =
  | 'generate'
  | 'enhance'
  | 'rephrase'
  | 'from_image';
