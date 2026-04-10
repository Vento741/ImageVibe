import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { logger } from './logger';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'imagevibe.db');
  logger.log('database', 'info', `Initializing database at ${dbPath}`);
  db = new Database(dbPath);

  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -64000'); // 64MB

  runMigrations(db);
  logger.log('database', 'info', 'Database initialized successfully');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  const currentVersion = db.prepare(
    'SELECT COALESCE(MAX(version), 0) as version FROM schema_version'
  ).get() as { version: number };

  const migrations = getMigrations();

  const applyMigration = db.transaction((version: number, sql: string) => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
  });

  for (const migration of migrations) {
    if (migration.version > currentVersion.version) {
      logger.log('database', 'info', `Applying migration v${migration.version}`);
      try {
        applyMigration(migration.version, migration.sql);
      } catch (err) {
        logger.log('database', 'error', `Migration v${migration.version} failed`, { error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    }
  }
}

interface Migration {
  version: number;
  sql: string;
}

function getMigrations(): Migration[] {
  return [
    {
      version: 1,
      sql: `
        -- Core images table
        CREATE TABLE images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL,
          prompt TEXT NOT NULL,
          translated_prompt TEXT,
          negative_prompt TEXT,
          model_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          params TEXT NOT NULL,
          source_image_path TEXT,
          width INTEGER,
          height INTEGER,
          file_size INTEGER,
          is_favorite INTEGER DEFAULT 0,
          preset_id INTEGER,
          cost_usd REAL,
          generation_time_ms INTEGER,
          generation_id TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Collections
        CREATE TABLE collections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          cover_image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE collection_images (
          collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
          image_id INTEGER REFERENCES images(id) ON DELETE CASCADE,
          added_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (collection_id, image_id)
        );

        -- Favorite prompts
        CREATE TABLE favorite_prompts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          prompt TEXT NOT NULL UNIQUE,
          style_tags TEXT,
          use_count INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          last_used_at TEXT DEFAULT (datetime('now'))
        );

        -- Custom styles
        CREATE TABLE custom_styles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          suffix TEXT NOT NULL,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Generation costs
        CREATE TABLE generation_costs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
          generation_id TEXT,
          model_id TEXT NOT NULL,
          cost_usd REAL NOT NULL DEFAULT 0,
          cost_type TEXT DEFAULT 'image',
          tokens_input INTEGER DEFAULT 0,
          tokens_output INTEGER DEFAULT 0,
          cost_source TEXT DEFAULT 'actual',
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Budget config (singleton)
        CREATE TABLE budget_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          daily_limit REAL,
          weekly_limit REAL,
          monthly_limit REAL,
          warning_threshold REAL DEFAULT 0.8,
          hard_stop INTEGER DEFAULT 0,
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Presets
        CREATE TABLE presets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          icon TEXT DEFAULT '🎨',
          model_id TEXT,
          params TEXT NOT NULL,
          style_tags TEXT,
          negative_prompt TEXT,
          is_builtin INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Negative prompt templates
        CREATE TABLE negative_prompt_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          category TEXT,
          is_builtin INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0
        );

        -- Generation queue
        CREATE TABLE generation_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          prompt TEXT NOT NULL,
          translated_prompt TEXT,
          model_id TEXT NOT NULL,
          params TEXT NOT NULL,
          negative_prompt TEXT,
          batch_group_id TEXT,
          status TEXT DEFAULT 'pending',
          result_image_id INTEGER REFERENCES images(id),
          error_message TEXT,
          estimated_cost REAL,
          actual_cost REAL,
          priority INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          started_at TEXT,
          completed_at TEXT
        );

        -- Comparisons
        CREATE TABLE comparisons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          image_a_id INTEGER REFERENCES images(id),
          image_b_id INTEGER REFERENCES images(id),
          winner TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Image tags
        CREATE TABLE image_tags (
          image_id INTEGER REFERENCES images(id) ON DELETE CASCADE,
          tag TEXT NOT NULL,
          source TEXT DEFAULT 'auto',
          PRIMARY KEY (image_id, tag)
        );

        -- Smart folders
        CREATE TABLE smart_folders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          icon TEXT DEFAULT '📁',
          filter_config TEXT NOT NULL,
          is_builtin INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Prompt templates
        CREATE TABLE prompt_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT,
          template TEXT NOT NULL,
          example_prompt TEXT,
          use_count INTEGER DEFAULT 0,
          is_builtin INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Full-text search
        CREATE VIRTUAL TABLE images_fts USING fts5(
          prompt, translated_prompt, negative_prompt,
          content=images, content_rowid=id
        );

        -- Triggers to keep FTS in sync
        CREATE TRIGGER images_fts_insert AFTER INSERT ON images BEGIN
          INSERT INTO images_fts(rowid, prompt, translated_prompt, negative_prompt)
          VALUES (new.id, new.prompt, new.translated_prompt, new.negative_prompt);
        END;

        CREATE TRIGGER images_fts_delete AFTER DELETE ON images BEGIN
          INSERT INTO images_fts(images_fts, rowid, prompt, translated_prompt, negative_prompt)
          VALUES ('delete', old.id, old.prompt, old.translated_prompt, old.negative_prompt);
        END;

        CREATE TRIGGER images_fts_update AFTER UPDATE ON images BEGIN
          INSERT INTO images_fts(images_fts, rowid, prompt, translated_prompt, negative_prompt)
          VALUES ('delete', old.id, old.prompt, old.translated_prompt, old.negative_prompt);
          INSERT INTO images_fts(rowid, prompt, translated_prompt, negative_prompt)
          VALUES (new.id, new.prompt, new.translated_prompt, new.negative_prompt);
        END;

        -- Indexes
        CREATE INDEX idx_images_model ON images(model_id);
        CREATE INDEX idx_images_created ON images(created_at);
        CREATE INDEX idx_images_favorite ON images(is_favorite);
        CREATE INDEX idx_images_mode ON images(mode);
        CREATE INDEX idx_images_preset ON images(preset_id);
        CREATE INDEX idx_costs_created ON generation_costs(created_at);
        CREATE INDEX idx_costs_model ON generation_costs(model_id);
        CREATE INDEX idx_costs_type ON generation_costs(cost_type);
        CREATE INDEX idx_image_tags_tag ON image_tags(tag);
        CREATE INDEX idx_queue_status ON generation_queue(status);
        CREATE INDEX idx_queue_batch ON generation_queue(batch_group_id);

        -- Seed budget config
        INSERT INTO budget_config (id, warning_threshold, hard_stop) VALUES (1, 0.8, 0);
      `,
    },
    {
      version: 2,
      sql: `
        -- Builtin presets
        INSERT INTO presets (name, icon, model_id, params, style_tags, negative_prompt, is_builtin, sort_order) VALUES
        ('Быстрый черновик', '⚡', 'black-forest-labs/flux.2-klein-4b', '{"aspectRatio":"1:1","imageSize":"1K"}', '[]', '', 1, 0),
        ('Фотопортрет', '📸', 'black-forest-labs/flux.2-pro', '{"aspectRatio":"1:1","imageSize":"1K"}', '["photorealistic","sharp focus"]', 'blurry, cartoon, deformed', 1, 1),
        ('Аниме персонаж', '🎌', 'bytedance-seed/seedream-4.5', '{"aspectRatio":"1:1","imageSize":"1K"}', '["anime","vibrant"]', 'photorealistic, 3d render', 1, 2),
        ('Концепт-арт', '🎨', 'black-forest-labs/flux.2-max', '{"aspectRatio":"16:9","imageSize":"1K"}', '["concept art","highly detailed"]', 'photo, realistic', 1, 3),
        ('Типографика', '🔤', 'black-forest-labs/flux.2-flex', '{"aspectRatio":"1:1","imageSize":"1K"}', '["clean text"]', 'blurry text, illegible', 1, 4),
        ('Продуктовое фото', '🛍', 'google/gemini-3-pro-image-preview', '{"aspectRatio":"1:1","imageSize":"1K"}', '["professional"]', 'cluttered background', 1, 5),
        ('Умная генерация', '🧠', 'openai/gpt-5-image-mini', '{"aspectRatio":"1:1","imageSize":"1K"}', '[]', '', 1, 6),
        ('Бюджетный', '💰', 'google/gemini-3.1-flash-image-preview', '{"aspectRatio":"1:1","imageSize":"1K"}', '[]', '', 1, 7);

        -- Builtin negative prompt templates
        INSERT INTO negative_prompt_templates (name, prompt, category, is_builtin, sort_order) VALUES
        ('Базовый', 'blurry, low quality, deformed, watermark, text, logo', 'base', 1, 0),
        ('Портреты', 'blurry, low quality, deformed, watermark, bad anatomy, extra fingers, mutated hands, poorly drawn face', 'portrait', 1, 1),
        ('Пейзажи', 'blurry, low quality, people, buildings, urban, text, watermark', 'landscape', 1, 2),
        ('Аниме', 'photorealistic, 3d, western, blurry, low quality, deformed', 'anime', 1, 3),
        ('Фото', 'cartoon, anime, illustration, painting, drawing, low quality, blurry', 'photo', 1, 4),
        ('Максимум', 'blurry, low quality, deformed, watermark, text, logo, bad anatomy, extra fingers, mutated hands, poorly drawn face, duplicate, morbid, out of frame, cropped, worst quality, low resolution, jpeg artifacts', 'all', 1, 5);

        -- Builtin smart folders
        INSERT INTO smart_folders (name, icon, filter_config, is_builtin, sort_order) VALUES
        ('Избранное', '⭐', '{"isFavorite":true}', 1, 0),
        ('Портреты', '👤', '{"tags":["портрет"]}', 1, 1),
        ('Пейзажи', '🏔', '{"tags":["пейзаж"]}', 1, 2),
        ('Аниме', '🎌', '{"tags":["аниме"]}', 1, 3);
      `,
    },
    {
      version: 3,
      sql: `
        -- Cache for Russian translation of prompts
        ALTER TABLE images ADD COLUMN prompt_ru TEXT;
      `,
    },
  ];
}
