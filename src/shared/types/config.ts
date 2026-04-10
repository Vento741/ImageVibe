import type { AspectRatio, ImageSize } from './models';

/** API key entry */
export interface ApiKeyConfig {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
}

/** Full app configuration */
export interface AppConfig {
  apiKeys: ApiKeyConfig[];
  promptAssistant: {
    model: string;
    autoTranslate: boolean;
    translateDebounceMs: number;
  };
  defaultParams: {
    aspectRatio: AspectRatio;
    imageSize: ImageSize;
    seed: number | null;
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
  defaultParams: {
    aspectRatio: '1:1',
    imageSize: '1K',
    seed: null,
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
