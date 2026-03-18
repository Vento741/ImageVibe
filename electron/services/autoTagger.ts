import { getDatabase } from './database';

/** Tag extraction rules — patterns matched against the translated (English) prompt */
const TAG_RULES: Array<{ pattern: RegExp; tag: string }> = [
  // Subjects
  { pattern: /\b(cat|kitten|feline)\b/i, tag: 'животные' },
  { pattern: /\b(dog|puppy|canine)\b/i, tag: 'животные' },
  { pattern: /\b(animal|creature|wildlife)\b/i, tag: 'животные' },
  { pattern: /\b(bird|eagle|parrot|owl)\b/i, tag: 'животные' },
  { pattern: /\b(horse|unicorn)\b/i, tag: 'животные' },
  { pattern: /\b(portrait|face|headshot|person|man|woman|girl|boy)\b/i, tag: 'портрет' },
  { pattern: /\b(landscape|mountain|ocean|sea|forest|nature|valley)\b/i, tag: 'пейзаж' },
  { pattern: /\b(city|building|street|urban|architecture|skyline)\b/i, tag: 'город' },
  { pattern: /\b(car|vehicle|motorcycle|truck)\b/i, tag: 'транспорт' },
  { pattern: /\b(food|dish|meal|cooking|kitchen)\b/i, tag: 'еда' },
  { pattern: /\b(robot|mech|android|cyborg)\b/i, tag: 'робот' },
  { pattern: /\b(space|planet|galaxy|astronaut|cosmic|nebula)\b/i, tag: 'космос' },
  { pattern: /\b(flower|garden|botanical|plant)\b/i, tag: 'природа' },

  // Styles
  { pattern: /\b(anime|manga|cel[- ]shading)\b/i, tag: 'аниме' },
  { pattern: /\b(photo|realistic|dslr|camera|photograph)\b/i, tag: 'фото' },
  { pattern: /\b(concept[- ]art|fantasy|magic|medieval)\b/i, tag: 'фэнтези' },
  { pattern: /\b(sci[- ]fi|futuristic|cyberpunk|neon)\b/i, tag: 'sci-fi' },
  { pattern: /\b(pixel[- ]art|retro|8[- ]bit)\b/i, tag: 'пиксель-арт' },
  { pattern: /\b(watercolor|oil[- ]painting|impressionist)\b/i, tag: 'живопись' },
  { pattern: /\b(3d|render|blender|cinema4d)\b/i, tag: '3D' },
  { pattern: /\b(sketch|drawing|pencil|charcoal)\b/i, tag: 'скетч' },
  { pattern: /\b(abstract|geometric|minimal)\b/i, tag: 'абстракция' },
  { pattern: /\b(steampunk)\b/i, tag: 'стимпанк' },
  { pattern: /\b(horror|dark|creepy|gothic)\b/i, tag: 'хоррор' },
  { pattern: /\b(cute|kawaii|chibi|adorable)\b/i, tag: 'милое' },

  // Quality
  { pattern: /\b(4k|8k|uhd|high[- ]resolution)\b/i, tag: 'HD' },
];

/**
 * Extract tags from a prompt text.
 * Returns an array of unique Russian tag strings.
 */
export function extractTags(prompt: string): string[] {
  const tags = new Set<string>();

  for (const rule of TAG_RULES) {
    if (rule.pattern.test(prompt)) {
      tags.add(rule.tag);
    }
  }

  return Array.from(tags);
}

/**
 * Save extracted tags for an image.
 * Also accepts additional tags from style selections.
 */
export function saveImageTags(
  imageId: number,
  prompt: string,
  styleTags: string[] = [],
  mode?: string
): void {
  const db = getDatabase();

  // Extract auto-tags from prompt
  const autoTags = extractTags(prompt);

  // Add mode as a tag
  if (mode) {
    autoTags.push(mode);
  }

  // Insert auto-tags
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO image_tags (image_id, tag, source) VALUES (?, ?, ?)'
  );

  const insertAll = db.transaction(() => {
    for (const tag of autoTags) {
      stmt.run(imageId, tag, 'auto');
    }
    for (const tag of styleTags) {
      stmt.run(imageId, tag, 'style');
    }
  });

  insertAll();
}

/**
 * Get all tags for an image.
 */
export function getImageTags(imageId: number): Array<{ tag: string; source: string }> {
  const db = getDatabase();
  return db.prepare(
    'SELECT tag, source FROM image_tags WHERE image_id = ?'
  ).all(imageId) as Array<{ tag: string; source: string }>;
}

/**
 * Get popular tags with counts.
 */
export function getPopularTags(limit = 20): Array<{ tag: string; count: number }> {
  const db = getDatabase();
  return db.prepare(
    'SELECT tag, COUNT(*) as count FROM image_tags GROUP BY tag ORDER BY count DESC LIMIT ?'
  ).all(limit) as Array<{ tag: string; count: number }>;
}
