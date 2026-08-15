import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileRefToPath, mimeForPath, readAsDataUrl } from '../electron/services/dataUrl';

describe('fileRefToPath', () => {
  it('обычный путь остаётся собой', () => {
    expect(fileRefToPath('C:/картинки/кот.png')).toBe('C:/картинки/кот.png');
  });

  it('ссылка из галереи разбирается в путь', () => {
    expect(fileRefToPath('local-file:///C:/картинки/кот.png')).toBe('C:/картинки/кот.png');
  });

  it('ссылка с URL-кодированием пробелов раскодируется', () => {
    expect(fileRefToPath('local-file:///C:/мои%20картинки/рыжий%20кот.png')).toBe(
      'C:/мои картинки/рыжий кот.png',
    );
  });

  it('путь Unix не теряет ведущий слэш', () => {
    expect(fileRefToPath('local-file:///home/user/кот.png')).toBe('/home/user/кот.png');
  });

  it('обычный file:// тоже принимается', () => {
    expect(fileRefToPath('file:///C:/a.png')).toBe('C:/a.png');
  });

  it('data-URL читать с диска нечего', () => {
    expect(() => fileRefToPath('data:image/png;base64,iVBOR')).toThrow(/уже data-URL/);
  });
});

describe('mimeForPath', () => {
  it('узнаёт поддерживаемые форматы', () => {
    expect(mimeForPath('a.png')).toBe('image/png');
    expect(mimeForPath('a.JPG')).toBe('image/jpeg');
    expect(mimeForPath('a.jpeg')).toBe('image/jpeg');
    expect(mimeForPath('a.webp')).toBe('image/webp');
  });

  it('не угадывает неизвестное расширение', () => {
    expect(() => mimeForPath('a.psd')).toThrow(/Неподдерживаемый формат/);
    expect(() => mimeForPath('файл_без_расширения')).toThrow(/Неподдерживаемый формат/);
  });
});

describe('readAsDataUrl', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'imagevibe-dataurl-'));
  });

  afterEach(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('читает файл, выбранный кнопкой «Обзор»', async () => {
    const filePath = path.join(dir, 'кот.png');
    await fs.promises.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(await readAsDataUrl(filePath)).toBe('data:image/png;base64,iVBORw==');
  });

  it('читает файл по ссылке из галереи', async () => {
    const filePath = path.join(dir, 'кот.png');
    await fs.promises.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const ref = `local-file:///${filePath.replace(/\\/g, '/')}`;
    expect(await readAsDataUrl(ref)).toBe('data:image/png;base64,iVBORw==');
  });

  it('data-URL возвращается как есть', async () => {
    expect(await readAsDataUrl('data:image/png;base64,iVBOR')).toBe('data:image/png;base64,iVBOR');
  });

  it('несуществующий файл — ошибка, а не пустой результат', async () => {
    await expect(readAsDataUrl(path.join(dir, 'нет.png'))).rejects.toThrow();
  });
});
