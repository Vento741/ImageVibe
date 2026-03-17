import type { ImageModel, ModelCategory } from '../../src/shared/types/models';

/** All 13 supported image generation models */
const MODELS: ImageModel[] = [
  // ═══ FAST ═══
  {
    id: 'black-forest-labs/flux.2-klein-4b',
    name: 'FLUX.2 Klein',
    provider: 'Black Forest Labs',
    category: 'fast',
    description: 'Самый быстрый и дешёвый FLUX. 4B параметров, идеально для черновиков.',
    pricing: { type: 'per_megapixel', perMegapixel: 0.014 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: false,
      seed: true, aspectRatio: true, imageSize: true,
      negativePrompt: false, fontInputs: false, superResolution: false,
      extendedAspectRatios: false, textOutput: false, reasoning: false,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'sourceful/riverflow-v2-fast',
    name: 'Riverflow V2 Fast',
    provider: 'Sourceful',
    category: 'fast',
    description: 'Быстрый Riverflow. Поддерживает шрифты и img2img.',
    pricing: { type: 'per_image', perImage: 0.02 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: false,
      seed: true, aspectRatio: true, imageSize: true,
      negativePrompt: true, fontInputs: true, superResolution: false,
      extendedAspectRatios: true, textOutput: false, reasoning: false,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'google/gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash',
    provider: 'Google',
    category: 'fast',
    description: 'Pro-качество на Flash скорости. Поддерживает редактирование и мультимодальность.',
    pricing: { type: 'per_token', perPromptToken: 0.0000005, perCompletionToken: 0.000003, perImageOutputToken: 0.00006 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: true,
      seed: true, aspectRatio: true, imageSize: false,
      negativePrompt: false, fontInputs: false, superResolution: false,
      extendedAspectRatios: false, textOutput: true, reasoning: false,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'google/gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    category: 'fast',
    description: 'Оригинальный Nano Banana. Бюджетный вариант Gemini.',
    pricing: { type: 'per_token', perPromptToken: 0.0000003, perCompletionToken: 0.0000025, perImageOutputToken: 0.000035 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: true,
      seed: true, aspectRatio: true, imageSize: false,
      negativePrompt: false, fontInputs: false, superResolution: false,
      extendedAspectRatios: false, textOutput: true, reasoning: false,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },

  // ═══ QUALITY ═══
  {
    id: 'black-forest-labs/flux.2-pro',
    name: 'FLUX.2 Pro',
    provider: 'Black Forest Labs',
    category: 'quality',
    description: 'Продакшн баланс скорости и качества. Отличные результаты за разумную цену.',
    pricing: { type: 'per_megapixel', perMegapixel: 0.03 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: false,
      seed: true, aspectRatio: true, imageSize: true,
      negativePrompt: false, fontInputs: false, superResolution: false,
      extendedAspectRatios: false, textOutput: false, reasoning: false,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
      '4K': { width: 4096, height: 4096 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'black-forest-labs/flux.2-max',
    name: 'FLUX.2 Max',
    provider: 'Black Forest Labs',
    category: 'quality',
    description: 'Лучший в линейке FLUX. Максимальное качество генерации.',
    pricing: { type: 'per_megapixel', perMegapixel: 0.07 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: false,
      seed: true, aspectRatio: true, imageSize: true,
      negativePrompt: false, fontInputs: false, superResolution: false,
      extendedAspectRatios: false, textOutput: false, reasoning: false,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
      '4K': { width: 4096, height: 4096 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'black-forest-labs/flux.2-flex',
    name: 'FLUX.2 Flex',
    provider: 'Black Forest Labs',
    category: 'quality',
    description: 'Лучший текст/типографика. Мульти-референс изображения.',
    pricing: { type: 'per_megapixel', perMegapixel: 0.06 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: false,
      seed: true, aspectRatio: true, imageSize: true,
      negativePrompt: false, fontInputs: false, superResolution: false,
      extendedAspectRatios: false, textOutput: false, reasoning: false,
      multiImageComposition: true,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
      '4K': { width: 4096, height: 4096 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'bytedance-seed/seedream-4.5',
    name: 'Seedream 4.5',
    provider: 'ByteDance',
    category: 'quality',
    description: 'Портреты, мелкий текст, мульти-композиция. Отличное качество за $0.04.',
    pricing: { type: 'per_image', perImage: 0.04 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: false,
      seed: true, aspectRatio: true, imageSize: true,
      negativePrompt: true, fontInputs: false, superResolution: false,
      extendedAspectRatios: true, textOutput: false, reasoning: false,
      multiImageComposition: true,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'sourceful/riverflow-v2-pro',
    name: 'Riverflow V2 Pro',
    provider: 'Sourceful',
    category: 'quality',
    description: 'SOTA качество, поддержка шрифтов, super resolution, до 4K.',
    pricing: { type: 'per_image', perImage: 0.15 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: false,
      seed: true, aspectRatio: true, imageSize: true,
      negativePrompt: true, fontInputs: true, superResolution: true,
      extendedAspectRatios: true, textOutput: false, reasoning: false,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
      '4K': { width: 4096, height: 4096 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'sourceful/riverflow-v2-max-preview',
    name: 'Riverflow V2 Max',
    provider: 'Sourceful',
    category: 'quality',
    description: 'Превью максимального качества Riverflow.',
    pricing: { type: 'per_image', perImage: 0.075 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: false,
      seed: true, aspectRatio: true, imageSize: true,
      negativePrompt: true, fontInputs: true, superResolution: true,
      extendedAspectRatios: true, textOutput: false, reasoning: false,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },

  // ═══ SMART ═══
  {
    id: 'google/gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro',
    provider: 'Google',
    category: 'smart',
    description: '2K/4K генерация, локальные правки, до 5 субъектов. Самый умный Gemini.',
    pricing: { type: 'per_token', perPromptToken: 0.000002, perCompletionToken: 0.00012 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: true,
      seed: true, aspectRatio: true, imageSize: true,
      negativePrompt: false, fontInputs: false, superResolution: false,
      extendedAspectRatios: false, textOutput: true, reasoning: false,
      multiImageComposition: true,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
      '4K': { width: 4096, height: 4096 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'openai/gpt-5-image',
    name: 'GPT-5 Image',
    provider: 'OpenAI',
    category: 'smart',
    description: 'Рассуждения + генерация. 400K контекст, мультимодальность.',
    pricing: { type: 'per_token', perPromptToken: 0.00001, perImageOutputToken: 0.00004 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: true,
      seed: false, aspectRatio: true, imageSize: true,
      negativePrompt: false, fontInputs: false, superResolution: false,
      extendedAspectRatios: false, textOutput: true, reasoning: true,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
  {
    id: 'openai/gpt-5-image-mini',
    name: 'GPT-5 Image Mini',
    provider: 'OpenAI',
    category: 'smart',
    description: 'Быстрее и дешевле GPT-5 Image. Отличный баланс ум/скорость.',
    pricing: { type: 'per_token', perPromptToken: 0.0000025, perImageOutputToken: 0.000008 },
    supports: {
      textToImage: true, imageToImage: true, inpainting: true,
      seed: false, aspectRatio: true, imageSize: true,
      negativePrompt: false, fontInputs: false, superResolution: false,
      extendedAspectRatios: false, textOutput: true, reasoning: true,
      multiImageComposition: false,
    },
    sizes: {
      '1K': { width: 1024, height: 1024 },
      '2K': { width: 2048, height: 2048 },
    },
    defaultAspectRatio: '1:1',
    defaultSize: '1K',
    hidden: false,
  },
];

/** Get all models */
export function getAllModels(): ImageModel[] {
  return MODELS.filter((m) => !m.hidden);
}

/** Get model by ID */
export function getModelById(id: string): ImageModel | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Get models by category */
export function getModelsByCategory(category: ModelCategory): ImageModel[] {
  return MODELS.filter((m) => m.category === category && !m.hidden);
}

/** Get category metadata */
export function getCategoryMeta(category: ModelCategory): { name: string; icon: string } {
  const meta: Record<ModelCategory, { name: string; icon: string }> = {
    fast: { name: 'Быстрые', icon: '⚡' },
    quality: { name: 'Качественные', icon: '🎨' },
    smart: { name: 'Умные', icon: '🧠' },
  };
  return meta[category];
}

/** Get all categories with their models */
export function getGroupedModels(): Array<{
  category: ModelCategory;
  name: string;
  icon: string;
  models: ImageModel[];
}> {
  const categories: ModelCategory[] = ['fast', 'quality', 'smart'];
  return categories.map((cat) => ({
    category: cat,
    ...getCategoryMeta(cat),
    models: getModelsByCategory(cat),
  }));
}

/** Get the default model */
export function getDefaultModel(): ImageModel {
  return MODELS.find((m) => m.id === 'black-forest-labs/flux.2-pro')!;
}
