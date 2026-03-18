import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { AppConfig } from '../../src/shared/types/config';
import { DEFAULT_CONFIG } from '../../src/shared/types/config';

let config: AppConfig | null = null;

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath();

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const loaded = JSON.parse(raw) as Partial<AppConfig>;
      config = deepMerge(DEFAULT_CONFIG, loaded);
    } catch {
      config = { ...DEFAULT_CONFIG };
    }
  } else {
    config = { ...DEFAULT_CONFIG };
    // Set default images path
    config.storage.imagesPath = path.join(app.getPath('userData'), 'images');
  }

  // Ensure images directory exists
  if (config!.storage.imagesPath && !fs.existsSync(config!.storage.imagesPath)) {
    fs.mkdirSync(config!.storage.imagesPath, { recursive: true });
  }

  return config!;
}

export function getConfig(): AppConfig {
  if (!config) {
    return loadConfig();
  }
  return config;
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  config = deepMerge(getConfig(), partial) as AppConfig;
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return config!;
}

export function getActiveApiKey(): string | null {
  const cfg = getConfig();
  const active = cfg.apiKeys.find((k) => k.isActive);
  return active?.key ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }
  return result;
}
