import type {
  GenerationRequest,
  GenerationResult,
  OpenRouterResponse,
  OpenRouterCredits,
  OpenRouterGenerationInfo,
  OpenRouterContentPart,
} from '../../src/shared/types/api';
import { getModelById } from './modelRegistry';
import { getActiveApiKey, getConfig } from './configManager';

const BASE_URL = 'https://openrouter.ai/api/v1';

/** Headers for OpenRouter requests */
function getHeaders(): Record<string, string> {
  const apiKey = getActiveApiKey();
  if (!apiKey) throw new Error('API ключ не настроен');
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://imagevibe.app',
    'X-Title': 'ImageVibe',
  };
}

/** Generate an image via OpenRouter */
export async function generateImage(request: GenerationRequest): Promise<GenerationResult> {
  const startTime = Date.now();
  const model = getModelById(request.modelId);
  if (!model) throw new Error(`Модель не найдена: ${request.modelId}`);

  // Build the prompt — use translated if available
  const effectivePrompt = request.translatedPrompt || request.prompt;

  // Build messages array
  const messages: Array<{ role: string; content: string | OpenRouterContentPart[] }> = [];

  if (request.mode === 'img2img' && request.sourceImageBase64) {
    // img2img: include source image
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: effectivePrompt },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${request.sourceImageBase64}` },
        },
      ],
    });
  } else if (request.mode === 'inpaint' && request.sourceImageBase64 && request.maskBase64) {
    // Inpaint: include source + mask
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: effectivePrompt },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${request.sourceImageBase64}` },
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${request.maskBase64}` },
        },
      ],
    });
  } else {
    // text2img
    messages.push({ role: 'user', content: effectivePrompt });
  }

  // Build request body
  const body: Record<string, unknown> = {
    model: request.modelId,
    messages,
  };

  // Add modalities for image output
  if (model.supports.textOutput) {
    body.modalities = ['image', 'text'];
  } else {
    body.modalities = ['image'];
  }

  // Add image_config if model supports it
  const imageConfig: Record<string, unknown> = {};
  if (model.supports.aspectRatio && request.aspectRatio) {
    imageConfig.aspect_ratio = request.aspectRatio;
  }
  if (model.supports.imageSize && request.imageSize) {
    const sizes = model.sizes[request.imageSize];
    if (sizes) {
      imageConfig.image_size = `${sizes.width}x${sizes.height}`;
    }
  }
  if (model.supports.seed && request.seed !== undefined) {
    body.seed = request.seed;
  }
  if (Object.keys(imageConfig).length > 0) {
    body.image_config = imageConfig;
  }

  // Add negative prompt if supported
  if (model.supports.negativePrompt && request.negativePrompt) {
    // Add as system message for models that support it
    messages.unshift({
      role: 'system',
      content: `Negative prompt: ${request.negativePrompt}`,
    });
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const message = errorData?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Ошибка API: ${message}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const generationId = data.id;

  // Log response structure for debugging
  console.log('[OpenRouter] Response id:', generationId, 'choices:', data.choices?.length);
  if (data.choices?.[0]) {
    const msg = data.choices[0].message;
    const c = msg.content;
    const imgs = msg.images;
    console.log('[OpenRouter] Content type:', typeof c, Array.isArray(c) ? `array[${c.length}]` : '');
    console.log('[OpenRouter] Images field:', imgs ? `array[${imgs.length}]` : 'absent');
    if (imgs && Array.isArray(imgs)) {
      imgs.forEach((img, i) => console.log(`[OpenRouter]   image[${i}]:`, img.type, 'image_url' in img ? img.image_url?.url?.substring(0, 80) + '...' : ''));
    }
    if (typeof c === 'string') {
      console.log('[OpenRouter] Content preview:', c.substring(0, 120));
    }
  }

  // Extract image from response
  const imageBase64 = await extractImageFromResponse(data);
  if (!imageBase64) {
    throw new Error('Не удалось извлечь изображение из ответа API');
  }

  const generationTimeMs = Date.now() - startTime;

  return {
    imageBase64,
    generationId,
    modelId: request.modelId,
    prompt: request.prompt,
    translatedPrompt: request.translatedPrompt,
    negativePrompt: request.negativePrompt,
    seed: request.seed,
    width: model.sizes[request.imageSize]?.width ?? 1024,
    height: model.sizes[request.imageSize]?.height ?? 1024,
    costUsd: 0, // Will be filled by cost tracker
    costSource: 'estimated',
    generationTimeMs,
    tokensInput: data.usage?.prompt_tokens,
    tokensOutput: data.usage?.completion_tokens,
  };
}

/** Extract base64 image data from OpenRouter response */
async function extractImageFromResponse(response: OpenRouterResponse): Promise<string | null> {
  const choice = response.choices?.[0];
  if (!choice) return null;

  // Check message.images array FIRST (OpenRouter image generation format)
  const images = choice.message.images;
  if (images && Array.isArray(images) && images.length > 0) {
    for (const img of images) {
      if (img.type === 'image_url' && 'image_url' in img) {
        const url = img.image_url.url;
        if (url.startsWith('data:image/')) {
          const base64 = url.split(',')[1];
          if (base64) return base64.replace(/\s/g, '');
        }
        if (url.startsWith('http')) {
          return await fetchImageAsBase64(url);
        }
        if (/^[A-Za-z0-9+/=]{100,}$/.test(url)) {
          return url;
        }
      }
    }
  }

  // Fallback: check content field
  const content = choice.message.content;

  // String content
  if (typeof content === 'string') {
    // data URI
    const dataUriMatch = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=\s]+)/);
    if (dataUriMatch) return dataUriMatch[1].replace(/\s/g, '');

    // Raw base64 (long string of base64 chars)
    const trimmed = content.trim();
    if (/^[A-Za-z0-9+/=\s]{100,}$/.test(trimmed)) {
      return trimmed.replace(/\s/g, '');
    }

    // URL to an image
    if (trimmed.startsWith('http') && /\.(png|jpg|jpeg|webp)/i.test(trimmed)) {
      return await fetchImageAsBase64(trimmed);
    }

    // Might contain a URL embedded in text
    const urlMatch = trimmed.match(/https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp)[^\s"']*/i);
    if (urlMatch) {
      return await fetchImageAsBase64(urlMatch[0]);
    }

    return null;
  }

  // Array content — look for image_url or image parts
  if (Array.isArray(content)) {
    for (const part of content) {
      // Standard image_url format
      if (part.type === 'image_url' && 'image_url' in part) {
        const url = part.image_url.url;
        if (url.startsWith('data:image/')) {
          const base64 = url.split(',')[1];
          if (base64) return base64.replace(/\s/g, '');
        }
        if (url.startsWith('http')) {
          return await fetchImageAsBase64(url);
        }
        // Might be raw base64 without data: prefix
        if (/^[A-Za-z0-9+/=]{100,}$/.test(url)) {
          return url;
        }
      }

      // Some models use type: "image" with base64 directly
      if (part.type === 'image' && 'source' in part) {
        const src = (part as Record<string, unknown>).source as Record<string, unknown>;
        if (src?.type === 'base64' && typeof src.data === 'string') {
          return src.data as string;
        }
      }
    }
  }

  return null;
}

/** Fetch an image URL and convert to base64 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    console.log('[OpenRouter] Fetching image URL:', url.substring(0, 100));
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
  } catch (err) {
    console.error('[OpenRouter] Failed to fetch image:', err);
    return null;
  }
}

/** Translate text RU→EN using Gemini Flash Lite */
export async function translatePrompt(text: string): Promise<string> {
  const config = getConfig();
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: config.promptAssistant.model,
      messages: [
        {
          role: 'system',
          content: 'You are a translator. Translate the following text from Russian to English. Return ONLY the translation, nothing else. If the text is already in English, return it as-is.',
        },
        { role: 'user', content: text },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    }),
  });

  if (!response.ok) throw new Error('Ошибка перевода');
  const data = (await response.json()) as OpenRouterResponse;
  return (data.choices[0]?.message.content as string)?.trim() || text;
}

/** Use AI to generate/enhance/rephrase a prompt */
export async function promptAssist(
  input: string,
  action: 'generate' | 'enhance' | 'rephrase'
): Promise<string> {
  const config = getConfig();

  const systemPrompts: Record<string, string> = {
    generate:
      'You are an expert AI image prompt writer. Based on the user\'s brief description, create a detailed, vivid prompt for image generation in English. Include style, lighting, composition details. Return ONLY the prompt text.',
    enhance:
      'You are an expert AI image prompt enhancer. Take the user\'s prompt and make it more detailed and effective for AI image generation. Add quality tags, style details, and composition guidance. Keep the original intent. Return ONLY the enhanced prompt in English.',
    rephrase:
      'You are an expert AI image prompt writer. Rephrase the user\'s prompt with different wording while keeping the same meaning and intent. Return ONLY the rephrased prompt in English.',
  };

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: config.promptAssistant.model,
      messages: [
        { role: 'system', content: systemPrompts[action] },
        { role: 'user', content: input },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error('Ошибка промпт-ассистента');
  const data = (await response.json()) as OpenRouterResponse;
  return (data.choices[0]?.message.content as string)?.trim() || input;
}

/** Generate a prompt from an image */
export async function promptFromImage(imageBase64: string): Promise<string> {
  const config = getConfig();
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: config.promptAssistant.model,
      messages: [
        {
          role: 'system',
          content: 'Describe this image in detail as an AI image generation prompt. Include subject, style, colors, lighting, composition. Return ONLY the prompt text in English.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image as a prompt:' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  if (!response.ok) throw new Error('Ошибка описания изображения');
  const data = (await response.json()) as OpenRouterResponse;
  return (data.choices[0]?.message.content as string)?.trim() || '';
}

/** Fetch account credits/balance */
export async function fetchCredits(): Promise<{ totalCredits: number; totalUsage: number; balance: number }> {
  const response = await fetch(`${BASE_URL}/credits`, {
    headers: getHeaders(),
  });

  if (!response.ok) throw new Error('Не удалось получить баланс');
  const data = (await response.json()) as OpenRouterCredits;
  return {
    totalCredits: data.data.total_credits,
    totalUsage: data.data.total_usage,
    balance: data.data.total_credits - data.data.total_usage,
  };
}

/** Fetch actual cost of a specific generation */
export async function fetchGenerationCost(generationId: string): Promise<number> {
  const response = await fetch(`${BASE_URL}/generation?id=${generationId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) return 0;
  const data = (await response.json()) as OpenRouterGenerationInfo;
  return data.data?.total_cost ?? 0;
}

/** Fetch generation cost with retry (cost may not be immediately available) */
export async function fetchGenerationCostWithRetry(
  generationId: string,
  maxRetries = 3
): Promise<number> {
  for (let i = 0; i < maxRetries; i++) {
    const cost = await fetchGenerationCost(generationId);
    if (cost > 0) return cost;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (i + 1)));
  }
  return 0;
}

/** Detect if text is in Russian */
export function isRussianText(text: string): boolean {
  const cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  return cyrillicCount / Math.max(text.length, 1) > 0.3;
}
