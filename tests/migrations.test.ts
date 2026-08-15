import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import os from 'os';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.mock('../electron/services/logger', () => ({ logger: { log: () => {} } }));

import { getMigrations } from '../electron/services/database';

/**
 * better-sqlite3 в проекте пересобран под Electron и в тестовом Node не грузится —
 * поэтому SQL миграций прогоняется через встроенный `node:sqlite`. Это проверяет ровно
 * то, что рискованно: сами запросы, порядок их применения и сохранность данных.
 */
function applyUpTo(version: number): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
  for (const migration of getMigrations()) {
    if (migration.version > version) break;
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version);
  }
  return db;
}

function columns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
}

const LATEST = 5;

describe('набор миграций', () => {
  it('версии идут подряд и не переписываются задним числом', () => {
    const versions = getMigrations().map((m) => m.version);
    expect(versions).toEqual([1, 2, 3, 4, 5]);
  });

  it('применяется целиком на чистой базе', () => {
    const db = applyUpTo(LATEST);
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number };
    expect(row.v).toBe(LATEST);
  });
});

describe('версия 5', () => {
  it('заводит колонки видео', () => {
    const db = applyUpTo(LATEST);
    expect(columns(db, 'images')).toEqual(expect.arrayContaining(['media_kind', 'duration_ms']));
  });

  it('заводит идентификатор задачи в очереди', () => {
    const db = applyUpTo(LATEST);
    expect(columns(db, 'generation_queue')).toEqual(
      expect.arrayContaining(['task_id', 'media_kind']),
    );
  });

  it('новая запись по умолчанию считается изображением', () => {
    const db = applyUpTo(LATEST);
    db.prepare(
      'INSERT INTO images (file_path, prompt, model_id, mode, params) VALUES (?,?,?,?,?)',
    ).run('a.png', 'кот', 'x/y', 'text2img', '{}');

    const row = db.prepare('SELECT media_kind, duration_ms FROM images').get() as {
      media_kind: string;
      duration_ms: number | null;
    };
    expect(row.media_kind).toBe('image');
    expect(row.duration_ms).toBeNull();
  });

  it('видеозапись хранится рядом с изображениями', () => {
    const db = applyUpTo(LATEST);
    db.prepare(
      'INSERT INTO images (file_path, prompt, model_id, mode, params, media_kind, duration_ms) VALUES (?,?,?,?,?,?,?)',
    ).run('клип.mp4', 'кот бежит', 'kling/v2', 'text2video', '{}', 'video', 5000);

    const row = db.prepare("SELECT * FROM images WHERE media_kind = 'video'").get() as {
      duration_ms: number;
      prompt: string;
    };
    expect(row.duration_ms).toBe(5000);
    expect(row.prompt).toBe('кот бежит');
  });

  it('у встроенных пресетов больше нет модели', () => {
    const db = applyUpTo(LATEST);
    const withModel = db
      .prepare('SELECT COUNT(*) AS n FROM presets WHERE is_builtin = 1 AND model_id IS NOT NULL')
      .get() as { n: number };
    const total = db.prepare('SELECT COUNT(*) AS n FROM presets WHERE is_builtin = 1').get() as {
      n: number;
    };

    expect(total.n).toBeGreaterThan(0);
    expect(withModel.n).toBe(0);
  });

  it('параметры встроенных пресетов не тронуты', () => {
    const db = applyUpTo(LATEST);
    const row = db
      .prepare("SELECT params FROM presets WHERE is_builtin = 1 AND params LIKE '%16:9%'")
      .get() as { params: string } | undefined;
    expect(row?.params).toBe('{"aspect_ratio":"16:9"}');
  });
});

describe('переход с версии 4 на 5', () => {
  function withDataAtV4(): DatabaseSync {
    const db = applyUpTo(4);
    db.prepare(
      'INSERT INTO images (file_path, prompt, translated_prompt, model_id, mode, params, is_favorite) VALUES (?,?,?,?,?,?,?)',
    ).run(
      'старое.png',
      'рыжий кот на подоконнике',
      'ginger cat',
      'black-forest-labs/flux.2-pro',
      'text2img',
      '{"aspect_ratio":"1:1"}',
      1,
    );
    db.prepare(
      'INSERT INTO presets (name, model_id, params, is_builtin) VALUES (?,?,?,?)',
    ).run('Мой пресет', 'openrouter/моя-модель', '{"aspect_ratio":"4:3"}', 0);
    return db;
  }

  function migrateTo5(db: DatabaseSync): void {
    const fifth = getMigrations().find((m) => m.version === 5);
    if (!fifth) throw new Error('нет миграции 5');
    db.exec(fifth.sql);
  }

  it('сохраняет изображения и избранное', () => {
    const db = withDataAtV4();
    migrateTo5(db);

    const row = db.prepare('SELECT * FROM images').get() as Record<string, unknown>;
    expect(row.prompt).toBe('рыжий кот на подоконнике');
    expect(row.is_favorite).toBe(1);
    expect(row.media_kind).toBe('image');
  });

  it('не переписывает историю: старые записи хранят модель, которой были сделаны', () => {
    const db = withDataAtV4();
    migrateTo5(db);

    const row = db.prepare('SELECT model_id FROM images').get() as { model_id: string };
    expect(row.model_id).toBe('black-forest-labs/flux.2-pro');
  });

  it('не трогает пользовательские пресеты', () => {
    const db = withDataAtV4();
    migrateTo5(db);

    const row = db
      .prepare('SELECT model_id, params FROM presets WHERE is_builtin = 0')
      .get() as { model_id: string; params: string };
    expect(row.model_id).toBe('openrouter/моя-модель');
    expect(row.params).toBe('{"aspect_ratio":"4:3"}');
  });

  it('полнотекстовый поиск переживает миграцию', () => {
    const db = withDataAtV4();
    migrateTo5(db);

    const found = db
      .prepare("SELECT rowid FROM images_fts WHERE images_fts MATCH 'подоконнике'")
      .all();
    expect(found).toHaveLength(1);
  });

  it('поиск продолжает работать по записям, добавленным после миграции', () => {
    const db = withDataAtV4();
    migrateTo5(db);
    db.prepare(
      'INSERT INTO images (file_path, prompt, model_id, mode, params, media_kind) VALUES (?,?,?,?,?,?)',
    ).run('клип.mp4', 'заснеженная деревня', 'kling/v2', 'text2video', '{}', 'video');

    const found = db
      .prepare("SELECT rowid FROM images_fts WHERE images_fts MATCH 'деревня'")
      .all();
    expect(found).toHaveLength(1);
  });
});
