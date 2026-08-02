import type { GenerationMode } from './models';

/** Values of normalised generation parameters, keyed by OpenRouter protocol names */
export type GenerationParams = Record<string, string | number | boolean>;

/** Request to generate an image */
export interface GenerationRequest {
  prompt: string;
  translatedPrompt?: string;
  modelId: string;
  mode: GenerationMode;
  /** Protocol-keyed values; only what the model declares is sent */
  params: GenerationParams;
  sourceImageBase64?: string;
  maskBase64?: string;
  styleTags?: string[];
}

/** Result from a generation */
export interface GenerationResult {
  imageBase64: string;
  /** From the x-generation-id response header; null when the header is absent */
  generationId: string | null;
  modelId: string;
  prompt: string;
  translatedPrompt?: string;
  params: GenerationParams;
  width: number;
  height: number;
  /** null when the cost is not known — never a substitute zero */
  costUsd: number | null;
  costSource: 'actual' | 'estimated' | 'unknown';
  generationTimeMs: number;
  tokensInput?: number;
  tokensOutput?: number;
}

/** Response of POST /api/v1/images */
export interface ImagesResponse {
  created: number;
  data: Array<{ b64_json: string; media_type: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
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
