import type { OpenRouterResponse } from '../../src/shared/types/api';
import { getActiveApiKey, getConfig } from './configManager';
import { logger } from './logger';

/**
 * Работа с текстом через OpenRouter.
 *
 * Генерация изображений и видео переехала на kie.ai; здесь остались только перевод
 * промпта, обратный перевод, ассистент промпта и описание картинки промптом.
 */

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

/** Detect if text is in Russian */
export function isRussianText(text: string): boolean {
  const cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  return cyrillicCount / Math.max(text.length, 1) > 0.3;
}
