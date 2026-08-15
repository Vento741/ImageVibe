import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'node:zlib';

let imagesDir: string;

vi.mock('electron', () => ({ shell: { openPath: () => {} } }));
vi.mock('sharp', () => ({ default: () => ({}) }));
vi.mock('../electron/services/configManager', () => ({
  getConfig: () => ({ storage: { imagesPath: imagesDir } }),
}));

function png(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat([
    Buffer.concat([Buffer.from([0]), Buffer.alloc(6)]),
    Buffer.concat([Buffer.from([0]), Buffer.alloc(6)]),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(16),
]);

beforeEach(async () => {
  imagesDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'imagevibe-media-'));
  vi.resetModules();
});

afterEach(async () => {
  await fs.promises.rm(imagesDir, { recursive: true, force: true });
});

async function storage() {
  return import('../electron/services/fileStorage');
}

describe('saveMedia', () => {
  it('кладёт изображение с расширением по сигнатуре', async () => {
    const { saveMedia } = await storage();
    const filePath = saveMedia(png(), null);
    expect(path.extname(filePath)).toBe('.png');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('кладёт видео с расширением по сигнатуре', async () => {
    const { saveMedia } = await storage();
    const filePath = saveMedia(MP4, null);
    expect(path.extname(filePath)).toBe('.mp4');
    expect(fs.readFileSync(filePath).equals(MP4)).toBe(true);
  });

  it('нераспознанные байты не попадают на диск', async () => {
    // Чужой хост может вернуть страницу ошибки вместо файла — записать её под именем
    // картинки значит завести в галерее битую запись, которая выглядит настоящей
    const { saveMedia } = await storage();
    expect(() => saveMedia(Buffer.from('<html>404</html>', 'utf8'), null)).toThrow(
      /не распознан/i,
    );
    expect(fs.readdirSync(imagesDir)).toHaveLength(0);
  });

  it('внедряет метаданные в PNG', async () => {
    const { saveMedia } = await storage();
    const { readMetadata } = await import('../electron/services/pngMetadata');
    const filePath = saveMedia(png(), { prompt: 'рыжий кот', model: 'z-image' });
    expect(readMetadata(fs.readFileSync(filePath))).toMatchObject({
      prompt: 'рыжий кот',
      model: 'z-image',
    });
  });

  it('не пытается внедрить метаданные в видео — механизм к mp4 неприменим', async () => {
    const { saveMedia } = await storage();
    const filePath = saveMedia(MP4, { prompt: 'кот бежит' });
    expect(fs.readFileSync(filePath).equals(MP4)).toBe(true);
  });

  it('даёт разные имена соседним файлам', async () => {
    const { saveMedia } = await storage();
    const a = saveMedia(png(), null);
    const b = saveMedia(png(), null);
    expect(a).not.toBe(b);
    expect(fs.readdirSync(imagesDir)).toHaveLength(2);
  });
});
