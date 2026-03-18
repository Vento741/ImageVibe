/** Stored image record */
export interface DBImage {
  id: number;
  file_path: string;
  prompt: string;
  translated_prompt: string | null;
  negative_prompt: string | null;
  model_id: string;
  mode: string;
  params: string; // JSON
  source_image_path: string | null;
  width: number;
  height: number;
  file_size: number;
  is_favorite: number;
  preset_id: number | null;
  cost_usd: number | null;
  generation_time_ms: number | null;
  generation_id: string | null;
  created_at: string;
}

/** Collection record */
export interface DBCollection {
  id: number;
  name: string;
  description: string | null;
  cover_image_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Collection-image junction */
export interface DBCollectionImage {
  collection_id: number;
  image_id: number;
  added_at: string;
}

/** Favorite prompt */
export interface DBFavoritePrompt {
  id: number;
  prompt: string;
  style_tags: string | null; // JSON array
  use_count: number;
  created_at: string;
  last_used_at: string;
}

/** Generation cost record */
export interface DBGenerationCost {
  id: number;
  image_id: number | null;
  generation_id: string | null;
  model_id: string;
  cost_usd: number;
  cost_type: 'image' | 'prompt_ai' | 'translate';
  tokens_input: number;
  tokens_output: number;
  cost_source: 'actual' | 'estimated';
  created_at: string;
}

/** Budget configuration (singleton) */
export interface DBBudgetConfig {
  id: 1;
  daily_limit: number | null;
  weekly_limit: number | null;
  monthly_limit: number | null;
  warning_threshold: number;
  hard_stop: number;
  updated_at: string;
}

/** Preset record */
export interface DBPreset {
  id: number;
  name: string;
  icon: string;
  model_id: string | null;
  params: string; // JSON
  style_tags: string | null; // JSON array
  negative_prompt: string | null;
  is_builtin: number;
  sort_order: number;
  created_at: string;
}

/** Negative prompt template */
export interface DBNegativePromptTemplate {
  id: number;
  name: string;
  prompt: string;
  category: string | null;
  is_builtin: number;
  sort_order: number;
}

/** Generation queue item */
export interface DBQueueItem {
  id: number;
  prompt: string;
  translated_prompt: string | null;
  model_id: string;
  params: string; // JSON
  negative_prompt: string | null;
  batch_group_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result_image_id: number | null;
  error_message: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Comparison record */
export interface DBComparison {
  id: number;
  image_a_id: number;
  image_b_id: number;
  winner: 'a' | 'b' | null;
  created_at: string;
}

/** Image tag */
export interface DBImageTag {
  image_id: number;
  tag: string;
  source: 'auto' | 'manual' | 'style';
}

/** Smart folder */
export interface DBSmartFolder {
  id: number;
  name: string;
  icon: string;
  filter_config: string; // JSON
  is_builtin: number;
  sort_order: number;
  created_at: string;
}

/** Prompt template */
export interface DBPromptTemplate {
  id: number;
  name: string;
  category: string | null;
  template: string;
  example_prompt: string | null;
  use_count: number;
  is_builtin: number;
  created_at: string;
}

/** Custom style */
export interface DBCustomStyle {
  id: number;
  name: string;
  suffix: string;
  sort_order: number;
  created_at: string;
}
