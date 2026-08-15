import fs from 'fs/promises';
import path from 'path';

/**
 * Превращение ссылки на локальный файл в data-URL.
 *
 * Исходное изображение попадает в интерфейс тремя путями: перетаскиванием (сразу
 * data-URL), кнопкой «Обзор» (голый путь к файлу) и отправкой из галереи (ссылка
 * `local-file://`). Точки отправки принимают только data-URL, поэтому два пути из трёх
 * молча теряли исходник — режим «фото в фото» вырождался в генерацию по одному тексту
 * за полную цену. Переезд на kie.ai делает починку неизбежной: сервису нужен URL, и
 * файл всё равно приходится прочитать с диска.
 */

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Путь к файлу из ссылки любого из трёх видов. */
export function fileRefToPath(ref: string): string {
  if (ref.startsWith('data:')) {
    throw new Error('Это уже data-URL, читать с диска нечего');
  }

  if (ref.startsWith('local-file://') || ref.startsWith('file://')) {
    const withoutScheme = ref.replace(/^(local-)?file:\/\//, '');
    // Windows-путь приходит как /C:/… — ведущий слэш лишний
    const decoded = decodeURIComponent(withoutScheme);
    return /^\/[a-zA-Z]:/.test(decoded) ? decoded.slice(1) : decoded;
  }

  return ref;
}

/** MIME по расширению. Неизвестное расширение — отказ, а не догадка. */
export function mimeForPath(filePath: string): string {
  const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()];
  if (!mime) {
    throw new Error(`Неподдерживаемый формат изображения: ${path.extname(filePath) || 'без расширения'}`);
  }
  return mime;
}

/** Прочитать файл и вернуть полный data-URL. Чтение асинхронное — main-поток не блокируется. */
export async function readAsDataUrl(ref: string): Promise<string> {
  if (ref.startsWith('data:')) return ref;

  const filePath = fileRefToPath(ref);
  const mime = mimeForPath(filePath);
  const bytes = await fs.readFile(filePath);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}
