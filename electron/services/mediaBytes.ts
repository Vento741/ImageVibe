/**
 * Разбор байтов результата генерации.
 *
 * Чистые функции без файловой системы и без electron: результат приходит с чужого
 * хоста, и то, что он не оказался картинкой, должно выясняться до записи на диск.
 * Байты, не распознанные как медиа, — это отказ задачи, а не файл.
 */

export interface MediaKind {
  kind: 'image' | 'video';
  ext: string;
  mime: string;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

function startsWith(bytes: Buffer, signature: Buffer): boolean {
  return bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature);
}

/** Вид медиа по сигнатуре файла. null — не распознано. */
export function detectMedia(bytes: Buffer): MediaKind | null {
  if (startsWith(bytes, PNG)) return { kind: 'image', ext: 'png', mime: 'image/png' };
  if (startsWith(bytes, JPEG)) return { kind: 'image', ext: 'jpg', mime: 'image/jpeg' };

  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { kind: 'image', ext: 'webp', mime: 'image/webp' };
  }

  // MP4 и MOV начинаются боксом ftyp со смещения 4; сам размер бокса стоит перед ним
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12);
    return brand.startsWith('qt')
      ? { kind: 'video', ext: 'mov', mime: 'video/quicktime' }
      : { kind: 'video', ext: 'mp4', mime: 'video/mp4' };
  }

  if (startsWith(bytes, WEBM)) return { kind: 'video', ext: 'webm', mime: 'video/webm' };

  return null;
}

/** Размеры PNG из заголовка IHDR. */
function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Размеры JPEG из первого маркера SOFn. */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    // SOF0..SOF15, кроме DHT (c4), JPGA (c8) и DAC (cc) — они не кадры
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }

    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }

  return null;
}

/** Размеры WebP: простой, без потерь и расширенный. */
function webpSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const format = bytes.toString('ascii', 12, 16);

  if (format === 'VP8 ') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }

  if (format === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (format === 'VP8X') {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }

  return null;
}

/**
 * Размеры изображения из заголовка файла. null — прочитать не удалось.
 *
 * Читается именно у полученного файла, а не берётся из запрошенных параметров:
 * поставщик не обязан соблюдать запрошенный размер, и замеры это подтверждали.
 */
export function readImageSize(bytes: Buffer): { width: number; height: number } | null {
  const media = detectMedia(bytes);
  if (!media || media.kind !== 'image') return null;

  const size =
    media.ext === 'png' ? pngSize(bytes) : media.ext === 'jpg' ? jpegSize(bytes) : webpSize(bytes);

  if (!size || size.width <= 0 || size.height <= 0) return null;
  return size;
}
