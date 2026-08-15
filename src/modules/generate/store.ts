import { create } from 'zustand';
import type { KieMode, KieModel, KieParams } from '@/shared/types/kie';
import type { QueueResult } from '@/shared/types/ipc';
import { applyModel } from '@/shared/lib/kieParams';

/** A card on the canvas — either generating, completed, or failed */
export interface CanvasCard {
  id: string;
  queueItemId?: number;
  status: 'generating' | 'completed' | 'failed';
  prompt: string;
  modelId: string;
  params: KieParams;
  startedAt: number;
  result?: QueueResult;
  error?: string;
}

/**
 * Модель, обслуживающая режим.
 *
 * Режим у kie.ai — свойство модели, а не параметр запроса, поэтому переключение режима
 * меняет список моделей. Текущая модель сохраняется, если она этот режим умеет; иначе
 * берётся первая доступная. Пусто — значит для режима моделей нет вовсе.
 */
export function resolveModelForMode(
  models: KieModel[],
  currentId: string,
  mode: KieMode,
): string {
  const current = models.find((m) => m.id === currentId);
  if (current?.modes.includes(mode)) return currentId;

  return (
    models
      .filter((m) => m.modes.includes(mode))
      .map((m) => m.id)
      .sort((a, b) => a.localeCompare(b))[0] ?? ''
  );
}

interface GenerateState {
  // Prompt
  prompt: string;
  translatedPrompt: string;
  promptHistory: string[];
  promptHistoryIndex: number;

  // Model selection
  selectedModelId: string;

  /** Режим — свойство выбранной модели и фильтр списка моделей */
  mode: KieMode;
  /** Параметры по именам из схемы модели */
  params: KieParams;
  styleTags: string[];

  // UI state
  isGenerating: boolean;
  uiMode: 'simple' | 'advanced';
  showTranslation: boolean;

  /** Исходник: всегда data-URL — путь и ссылка на файл до API не доходят */
  sourceImageData: string | null;
  maskData: string | null;

  currentResult: QueueResult | null;
  resultHistory: QueueResult[];

  canvasCards: CanvasCard[];

  // Actions
  setPrompt: (prompt: string) => void;
  setTranslatedPrompt: (translated: string) => void;
  pushPromptHistory: (prompt: string) => void;
  undoPrompt: () => void;
  redoPrompt: () => void;
  setSelectedModelId: (modelId: string) => void;
  setMode: (mode: KieMode) => void;
  /** Переключить режим, подобрав модель, которая его обслуживает */
  switchMode: (mode: KieMode, models: KieModel[]) => void;
  setParam: (key: string, value: string | number | boolean) => void;
  clearParam: (key: string) => void;
  /** Привести параметры к схеме модели: выбросить лишнее, предзаполнить обязательное */
  syncParamsToModel: (model: KieModel) => void;
  setStyleTags: (tags: string[]) => void;
  toggleStyleTag: (tag: string) => void;
  setIsGenerating: (val: boolean) => void;
  setUiMode: (mode: 'simple' | 'advanced') => void;
  toggleUiMode: () => void;
  setShowTranslation: (val: boolean) => void;
  setCurrentResult: (result: QueueResult | null) => void;
  setSourceImageData: (data: string | null) => void;
  setMaskData: (data: string | null) => void;
  addCanvasCard: (card: CanvasCard) => void;
  addCanvasCards: (cards: CanvasCard[]) => void;
  updateCanvasCard: (id: string, updates: Partial<CanvasCard>) => void;
  removeCanvasCard: (id: string) => void;
  reset: () => void;
}

const initialState = {
  prompt: '',
  translatedPrompt: '',
  promptHistory: [] as string[],
  promptHistoryIndex: -1,
  selectedModelId: '',
  mode: 'text2img' as KieMode,
  params: {} as KieParams,
  styleTags: [] as string[],
  isGenerating: false,
  uiMode: 'simple' as 'simple' | 'advanced',
  showTranslation: false,
  sourceImageData: null as string | null,
  maskData: null as string | null,
  currentResult: null as QueueResult | null,
  resultHistory: [] as QueueResult[],
  canvasCards: [] as CanvasCard[],
};

export const useGenerateStore = create<GenerateState>((set, get) => ({
  ...initialState,

  setPrompt: (prompt) => set({ prompt }),
  setTranslatedPrompt: (translatedPrompt) => set({ translatedPrompt }),

  pushPromptHistory: (prompt) => {
    const { promptHistory } = get();
    if (promptHistory[promptHistory.length - 1] === prompt) return;
    set({
      promptHistory: [...promptHistory, prompt].slice(-100),
      promptHistoryIndex: Math.min(promptHistory.length, 99),
    });
  },

  undoPrompt: () => {
    const { promptHistory, promptHistoryIndex } = get();
    const newIndex = Math.max(0, promptHistoryIndex - 1);
    if (promptHistory[newIndex]) {
      set({ prompt: promptHistory[newIndex], promptHistoryIndex: newIndex });
    }
  },

  redoPrompt: () => {
    const { promptHistory, promptHistoryIndex } = get();
    const newIndex = Math.min(promptHistory.length - 1, promptHistoryIndex + 1);
    if (promptHistory[newIndex]) {
      set({ prompt: promptHistory[newIndex], promptHistoryIndex: newIndex });
    }
  },

  setSelectedModelId: (selectedModelId) => set({ selectedModelId }),

  setMode: (mode) =>
    set((s) => ({ mode, maskData: mode !== 'inpaint' ? null : s.maskData })),

  switchMode: (mode, models) =>
    set((s) => ({
      mode,
      selectedModelId: resolveModelForMode(models, s.selectedModelId, mode),
      maskData: mode !== 'inpaint' ? null : s.maskData,
    })),

  setParam: (key, value) => set((s) => ({ params: { ...s.params, [key]: value } })),

  clearParam: (key) =>
    set((s) => {
      const next = { ...s.params };
      delete next[key];
      return { params: next };
    }),

  // Вызывается при смене модели: значение, выпавшее из схемы, выбрасывается, а не
  // заменяется допустимым — подстановка отправила бы то, чего пользователь не выбирал.
  // Предзаполняются только обязательные параметры: без них сервис отвергает запрос.
  syncParamsToModel: (model) => set((s) => ({ params: applyModel(s.params, model) })),

  setStyleTags: (styleTags) => set({ styleTags }),
  toggleStyleTag: (tag) => {
    const { styleTags } = get();
    if (styleTags.includes(tag)) {
      set({ styleTags: styleTags.filter((t) => t !== tag) });
    } else {
      set({ styleTags: [...styleTags, tag] });
    }
  },

  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setUiMode: (uiMode) => set({ uiMode }),
  toggleUiMode: () => set((s) => ({ uiMode: s.uiMode === 'simple' ? 'advanced' : 'simple' })),
  setShowTranslation: (showTranslation) => set({ showTranslation }),
  setSourceImageData: (sourceImageData) => set({ sourceImageData, maskData: null }),
  setMaskData: (maskData) => set({ maskData }),

  setCurrentResult: (result) => {
    if (!result) {
      set({ currentResult: null });
      return;
    }
    set((s) => ({
      currentResult: result,
      // Номер записи в галерее уникален всегда, в отличие от идентификатора задачи,
      // которого у восстановленной записи может не быть
      resultHistory: s.resultHistory.some((r) => r.imageId === result.imageId)
        ? s.resultHistory
        : [result, ...s.resultHistory].slice(0, 50),
    }));
  },

  addCanvasCard: (card) => set((s) => ({ canvasCards: [card, ...s.canvasCards] })),
  addCanvasCards: (cards) => set((s) => ({ canvasCards: [...cards, ...s.canvasCards] })),

  updateCanvasCard: (id, updates) =>
    set((s) => ({
      canvasCards: s.canvasCards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  removeCanvasCard: (id) =>
    set((s) => ({ canvasCards: s.canvasCards.filter((c) => c.id !== id) })),

  reset: () => set(initialState),
}));
