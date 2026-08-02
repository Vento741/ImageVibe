import type {
  GenerationRequest,
  GenerationResult,
  OpenRouterResponse,
  OpenRouterCredits,
  OpenRouterGenerationInfo,
  OpenRouterContentPart,
} from '../../src/shared/types/api';
import sharp from 'sharp';
import { getModelById } from './modelCatalog';
import { hasParameter, enumValues } from './catalogSchema';
import { getActiveApiKey, getConfig } from './configManager';
import { logger } from './logger';

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

/**
 * Ceiling for a generation call. Measured: a high-quality generation took 156 s, and the
 * former 2-minute limit aborted successful generations that were already billed. The API
 * exposes no latency field, so this is a client-side guard against a hung socket — the
 * normal way to stop a generation is user cancellation.
 */
const GENERATE_TIMEOUT_MS = 600_000;

/** Generate an image via OpenRouter */
export async function generateImage(
  request: GenerationRequest,
  externalSignal?: AbortSignal,
): Promise<GenerationResult> {
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
    // Inpaint: source + mask. Without an explicit explanation the model ignores the mask
    // entirely and edits the wrong region — measured, the result came out inverted.
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            `${effectivePrompt}\n\n` +
            'The first image is the source. The second image is a binary mask for it: ' +
            'edit only the areas that are white in the mask, and keep every area that is ' +
            'black in the mask pixel for pixel identical to the source. Return the full ' +
            'image at the same size.',
        },
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

  // Text alongside the image only when the catalog record says the model outputs text
  const outputsText = model.outputModalities.includes('text');
  body.modalities = outputsText ? ['image', 'text'] : ['image'];

  // Parameters the model actually declares — nothing is sent on a guess
  const imageConfig: Record<string, unknown> = {};

  const aspectValues = enumValues(model.schema, 'aspect_ratio');
  if (aspectValues && request.aspectRatio && aspectValues.includes(request.aspectRatio)) {
    imageConfig.aspect_ratio = request.aspectRatio;
  }

  const resolutionValues = enumValues(model.schema, 'resolution');
  if (resolutionValues && request.imageSize && resolutionValues.includes(request.imageSize)) {
    imageConfig.image_size = request.imageSize;
  }
  // else: the model declares no resolution parameter. The Size control is hidden for such
  // models (ParamsPanel), so request.imageSize here is never the user's choice — it is
  // whatever was last picked for a *different* model, stuck in the store. Sending it as a
  // pixel form (as this branch used to) forwards that stale value, not a real intent; measured
  // on a live model, it also overshoots the provider's megapixel cap and the call fails outright.
  // A pixel-form size control for these models is a real, separate feature to design and
  // surface deliberately — not a byproduct of a stuck value falling through unconditionally.

  if (hasParameter(model.schema, 'seed') && request.seed !== undefined) {
    body.seed = request.seed;
  }

  if (Object.keys(imageConfig).length > 0) {
    body.image_config = imageConfig;
  }

  logger.log('generation', 'info', `API запрос: ${request.modelId}`, {
    mode: request.mode,
    aspectRatio: request.aspectRatio,
    imageSize: request.imageSize,
  });

  // AbortController for timeout + external cancellation
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

  // If external signal is provided, forward its abort to our controller
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new Error('Генерация отменена');
    }
    const onExternalAbort = () => controller.abort();
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    controller.signal.addEventListener('abort', () => {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      if (externalSignal?.aborted) {
        logger.log('generation', 'warn', 'Генерация отменена пользователем', { modelId: request.modelId });
        throw new Error('Генерация отменена');
      }
      logger.log('generation', 'error', `Таймаут API (${GENERATE_TIMEOUT_MS / 1000}с)`, { modelId: request.modelId });
      throw new Error(`Превышено время ожидания ответа от API (${GENERATE_TIMEOUT_MS / 1000} сек)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const message = errorData?.error?.message || `HTTP ${response.status}`;
    logger.log('generation', 'error', `Ошибка API: ${message}`, { modelId: request.modelId, status: response.status });
    throw new Error(`Ошибка API: ${message}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const generationId = data.id;

  // Extract image from response
  const imageBase64 = await extractImageFromResponse(data);
  if (!imageBase64) {
    throw new Error('Не удалось извлечь изображение из ответа API');
  }

  const generationTimeMs = Date.now() - startTime;

  logger.log('generation', 'info', `Готово за ${generationTimeMs}мс`, {
    modelId: request.modelId,
    generationId,
    generationTimeMs,
  });

  // Actual size of the result — a size parameter is not proof of what came back, and there
  // is no per-model size table left to guess from (see catalog schema for why). Parsing can
  // fail on an unsupported/truncated/corrupt image; by the time we get here the generation
  // already succeeded and, per the all-or-nothing billing rule, is already paid for — a
  // parse failure must not throw away that result, only leave its size unknown.
  let width: number | undefined;
  let height: number | undefined;
  try {
    const metadata = await sharp(Buffer.from(imageBase64, 'base64')).metadata();
    width = metadata.width;
    height = metadata.height;
  } catch (err) {
    logger.log('generation', 'warn', 'Не удалось измерить размеры изображения', {
      modelId: request.modelId,
      generationId,
      error: String(err),
    });
  }

  return {
    imageBase64,
    generationId,
    modelId: request.modelId,
    prompt: request.prompt,
    translatedPrompt: request.translatedPrompt,
    negativePrompt: request.negativePrompt,
    seed: request.seed,
    width: width ?? 0,
    height: height ?? 0,
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
      if ((part as Record<string, unknown>).type === 'image' && 'source' in part) {
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
  logger.log('api', 'info', 'Translating prompt RU→EN', { length: text.length });
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

  if (!response.ok) {
    logger.log('api', 'error', 'Translation RU→EN failed', { status: response.status });
    throw new Error('Ошибка перевода');
  }
  const data = (await response.json()) as OpenRouterResponse;
  const result = (data.choices[0]?.message.content as string)?.trim() || text;
  logger.log('api', 'info', 'Translation RU→EN completed');
  return result;
}

/** Translate text EN→RU using Gemini Flash Lite */
export async function translateToRussian(text: string): Promise<string> {
  const config = getConfig();
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: config.promptAssistant.model,
      messages: [
        {
          role: 'system',
          content: 'You are a translator. Translate the following text from English to Russian. Return ONLY the translation, nothing else. If the text is already in Russian, return it as-is.',
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
  logger.log('api', 'info', `Prompt assist: ${action}`, { inputLength: input.length });
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

  if (!response.ok) {
    logger.log('api', 'error', `Prompt assist (${action}) failed`, { status: response.status });
    throw new Error('Ошибка промпт-ассистента');
  }
  const data = (await response.json()) as OpenRouterResponse;
  logger.log('api', 'info', `Prompt assist (${action}) completed`);
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
  logger.log('api', 'debug', 'Fetching account credits');
  const response = await fetch(`${BASE_URL}/credits`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    logger.log('api', 'error', 'Failed to fetch credits', { status: response.status });
    throw new Error('Не удалось получить баланс');
  }
  const data = (await response.json()) as OpenRouterCredits;
  return {
    totalCredits: data.data.total_credits,
    totalUsage: data.data.total_usage,
    balance: data.data.total_credits - data.data.total_usage,
  };
}

/**
 * Fetch actual cost of a specific generation.
 * null means the cost could not be determined (network failure, non-ok response, no
 * usage field yet) — it is not the same as a genuine zero reported by the API.
 */
export async function fetchGenerationCost(generationId: string): Promise<number | null> {
  try {
    const response = await fetch(`${BASE_URL}/generation?id=${generationId}`, {
      headers: getHeaders(),
    });
    if (!response.ok) return null;
    const raw = await response.json();
    // API may return object directly or wrapped in { data: ... }
    const info = raw.data ?? raw;
    return typeof info.usage === 'number' ? info.usage : null;
  } catch {
    return null;
  }
}

/** Fetch full generation info for benchmarking */
export async function fetchGenerationInfo(generationId: string): Promise<OpenRouterGenerationInfo | null> {
  try {
    const url = `${BASE_URL}/generation?id=${generationId}`;
    const headers = getHeaders();
    console.log(`[benchmark] fetching: ${url}`);
    const response = await fetch(url, { headers });
    console.log(`[benchmark] response status: ${response.status}`);
    if (!response.ok) {
      const errText = await response.text();
      console.log(`[benchmark] error body: ${errText}`);
      return null;
    }
    const raw = await response.json();
    console.log(`[benchmark] raw keys: ${Object.keys(raw).join(', ')}`);
    console.log(`[benchmark] raw.usage=${raw.usage}, raw.data=${JSON.stringify(raw.data)?.slice(0, 200)}`);
    // API may return the object directly or wrapped in { data: ... }
    const info = (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) ? raw.data : raw;
    console.log(`[benchmark] resolved: usage=${info.usage}, model=${info.model}, gen_time=${info.generation_time}`);
    return info as OpenRouterGenerationInfo;
  } catch (err) {
    console.log(`[benchmark] fetch error: ${err}`);
    return null;
  }
}

/**
 * Fetch generation cost with retry (cost may not be immediately available).
 * Retries only while the cost is undetermined (null); a genuine value — including a
 * real zero — returns immediately. Returns null, not 0, if every retry stays undetermined.
 */
export async function fetchGenerationCostWithRetry(
  generationId: string,
  maxRetries = 3
): Promise<number | null> {
  for (let i = 0; i < maxRetries; i++) {
    const cost = await fetchGenerationCost(generationId);
    if (cost !== null) return cost;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (i + 1)));
  }
  return null;
}

/** Detect if text is in Russian */
export function isRussianText(text: string): boolean {
  const cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  return cyrillicCount / Math.max(text.length, 1) > 0.3;
}
