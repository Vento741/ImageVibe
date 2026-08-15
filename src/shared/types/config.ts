/** Кому принадлежит ключ. Генерация идёт через kie.ai, текст — через OpenRouter. */
export type ApiProvider = 'kie' | 'openrouter';

/** API key entry */
export interface ApiKeyConfig {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
  /** Отсутствие означает OpenRouter: так читаются ключи, заведённые до переезда */
  provider?: ApiProvider;
}

/** Full app configuration */
export interface AppConfig {
  apiKeys: ApiKeyConfig[];
  promptAssistant: {
    model: string;
    autoTranslate: boolean;
    translateDebounceMs: number;
  };
  ui: {
    mode: 'simple' | 'advanced';
    theme: 'aurora-dark';
  };
  costTracking: {
    enabled: boolean;
    showEstimate: boolean;
    showBalance: boolean;
    balanceRefreshSeconds: number;
  };
  storage: {
    imagesPath: string;
  };
  export: {
    defaultFormat: 'png' | 'jpeg' | 'webp';
    jpegQuality: number;
    embedMetadata: boolean;
  };
  debug: {
    enabled: boolean;
  };
}

/** Default config values */
export const DEFAULT_CONFIG: AppConfig = {
  apiKeys: [],
  promptAssistant: {
    model: 'google/gemini-3.1-flash-lite-preview',
    autoTranslate: true,
    translateDebounceMs: 800,
  },
  ui: {
    mode: 'simple',
    theme: 'aurora-dark',
  },
  costTracking: {
    enabled: true,
    showEstimate: true,
    showBalance: true,
    balanceRefreshSeconds: 60,
  },
  storage: {
    imagesPath: '',
  },
  export: {
    defaultFormat: 'png',
    jpegQuality: 85,
    embedMetadata: true,
  },
  debug: {
    enabled: false,
  },
};
