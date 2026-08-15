import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { detectMedia, readImageSize } from '../electron/services/mediaBytes';

/** Настоящий однопиксельный PNG заданного размера. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const raw = Buffer.concat(
    Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3)])),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** JPEG с одним маркером SOF0 — минимум, достаточный для чтения размеров. */
function jpeg(width: number, height: number): Buffer {
  const sof = Buffer.alloc(11);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(9, 2); // длина сегмента
  sof[4] = 8; // точность
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 1;
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]), sof]);
}

function mp4(brand = 'isom'): Buffer {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from(brand, 'ascii'),
    Buffer.alloc(16),
  ]);
}

describe('detectMedia', () => {
  it('узнаёт PNG', () => {
    expect(detectMedia(png(2, 2))).toEqual({ kind: 'image', ext: 'png', mime: 'image/png' });
  });

  it('узнаёт JPEG', () => {
    expect(detectMedia(jpeg(4, 3))).toEqual({ kind: 'image', ext: 'jpg', mime: 'image/jpeg' });
  });

  it('узнаёт WebP', () => {
    const bytes = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.alloc(4),
      Buffer.from('WEBP', 'ascii'),
      Buffer.alloc(20),
    ]);
    expect(detectMedia(bytes)?.ext).toBe('webp');
  });

  it('узнаёт MP4 по боксу ftyp', () => {
    expect(detectMedia(mp4())).toEqual({ kind: 'video', ext: 'mp4', mime: 'video/mp4' });
  });

  it('отличает QuickTime от MP4', () => {
    expect(detectMedia(mp4('qt  '))?.ext).toBe('mov');
  });

  it('узнаёт WebM', () => {
    const bytes = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);
    expect(detectMedia(bytes)).toEqual({ kind: 'video', ext: 'webm', mime: 'video/webm' });
  });

  it('не признаёт медиа в мусоре', () => {
    expect(detectMedia(Buffer.from('<html>404 Not Found</html>', 'utf8'))).toBeNull();
  });

  it('не признаёт медиа в пустых байтах', () => {
    expect(detectMedia(Buffer.alloc(0))).toBeNull();
    expect(detectMedia(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

describe('readImageSize', () => {
  it('читает размеры PNG', () => {
    expect(readImageSize(png(1024, 768))).toEqual({ width: 1024, height: 768 });
  });

  it('читает размеры квадратного PNG', () => {
    expect(readImageSize(png(2, 2))).toEqual({ width: 2, height: 2 });
  });

  it('читает размеры JPEG', () => {
    expect(readImageSize(jpeg(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it('у видео размеров не читает', () => {
    expect(readImageSize(mp4())).toBeNull();
  });

  it('у мусора размеров не читает', () => {
    expect(readImageSize(Buffer.from('не картинка', 'utf8'))).toBeNull();
  });
});
