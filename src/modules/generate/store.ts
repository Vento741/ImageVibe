import { create } from 'zustand';
import type { GenerationMode, ModelCategory, ParamSchema } from '@/shared/types/models';
import type { GenerationParams, GenerationResult } from '@/shared/types/api';
import { applySchema } from '@/shared/lib/paramSchema';

/** A card on the canvas — either generating, completed, or failed */
export interface CanvasCard {
  id: string;
  queueItemId?: number;
  status: 'generating' | 'completed' | 'failed';
  prompt: string;
  modelId: string;
  params: GenerationParams;
  startedAt: number;
  result?: GenerationResult & { filePath?: string; imageId?: number };
  error?: string;
}

interface GenerateState {
  // Prompt
  prompt: string;
  translatedPrompt: string;
  negativePrompt: string;
  promptHistory: string[];
  promptHistoryIndex: number;

  // Model selection
  selectedCategory: ModelCategory;
  selectedModelId: string;

  // Parameters — protocol-keyed, built from the model's schema, not from named fields
  mode: GenerationMode;
  params: GenerationParams;
  styleTags: string[];

  // UI state
  isGenerating: boolean;
  uiMode: 'simple' | 'advanced';
  showTranslation: boolean;

  // Source image for img2img / inpaint
  sourceImageData: string | null;
  maskData: string | null; // base64 PNG mask (white=edit, black=keep)

  // Result (legacy — kept for compatibility)
  currentResult: (GenerationResult & { filePath?: string; imageId?: number }) | null;
  resultHistory: Array<GenerationResult & { filePath?: string; imageId?: number }>;

  // Canvas cards (new queue-based system)
  canvasCards: CanvasCard[];

  // Actions
  setPrompt: (prompt: string) => void;
  setTranslatedPrompt: (translated: string) => void;
  setNegativePrompt: (neg: string) => void;
  pushPromptHistory: (prompt: string) => void;
  undoPrompt: () => void;
  redoPrompt: () => void;
  setSelectedCategory: (category: ModelCategory) => void;
  setSelectedModelId: (modelId: string) => void;
  setMode: (mode: GenerationMode) => void;
  setParam: (key: string, value: string | number | boolean) => void;
  clearParam: (key: string) => void;
  syncParamsToSchema: (schema: Record<string, ParamSchema>) => void;
  setStyleTags: (tags: string[]) => void;
  toggleStyleTag: (tag: string) => void;
  setIsGenerating: (val: boolean) => void;
  setUiMode: (mode: 'simple' | 'advanced') => void;
  toggleUiMode: () => void;
  setShowTranslation: (val: boolean) => void;
  setCurrentResult: (result: GenerateState['currentResult']) => void;
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
  negativePrompt: '',
  promptHistory: [] as string[],
  promptHistoryIndex: -1,
  selectedCategory: 'fast' as ModelCategory,
  selectedModelId: '',
  mode: 'text2img' as GenerationMode,
  params: {} as GenerationParams,
  styleTags: [] as string[],
  isGenerating: false,
  uiMode: 'simple' as 'simple' | 'advanced',
  showTranslation: false,
  sourceImageData: null as string | null,
  maskData: null as string | null,
  currentResult: null as GenerateState['currentResult'],
  resultHistory: [] as Array<GenerationResult & { filePath?: string; imageId?: number }>,
  canvasCards: [] as CanvasCard[],
};

export const useGenerateStore = create<GenerateState>((set, get) => ({
  ...initialState,

  setPrompt: (prompt) => set({ prompt }),
  setTranslatedPrompt: (translatedPrompt) => set({ translatedPrompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),

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

  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setSelectedModelId: (selectedModelId) => set({ selectedModelId }),
  setMode: (mode) => set((s) => ({
    mode,
    maskData: mode !== 'inpaint' ? null : s.maskData,
  })),
  setParam: (key, value) => set((s) => ({ params: { ...s.params, [key]: value } })),

  clearParam: (key) => set((s) => {
    const next = { ...s.params };
    delete next[key];
    return { params: next };
  }),

  // Called when the selected model changes: drop what the new schema does not allow and
  // fill 'auto' where it offers it. A value that fell out is dropped, not replaced —
  // substituting the first allowed value would send something the user never chose.
  syncParamsToSchema: (schema) => set((s) => ({ params: applySchema(s.params, schema) })),

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
    if (result) {
      set((s) => {
        // An unknown id (null) never matches anything else unknown — two paid
        // generations without an x-generation-id header must both stay in history,
        // not collapse into one because null === null.
        const alreadyInHistory =
          result.generationId !== null &&
          s.resultHistory.some((r) => r.generationId === result.generationId);
        return {
          currentResult: result,
          resultHistory: alreadyInHistory
            ? s.resultHistory
            : [result, ...s.resultHistory].slice(0, 50),
        };
      });
    } else {
      set({ currentResult: result });
    }
  },

  addCanvasCard: (card) => set((s) => ({
    canvasCards: [card, ...s.canvasCards],
  })),

  addCanvasCards: (cards) => set((s) => ({
    canvasCards: [...cards, ...s.canvasCards],
  })),

  updateCanvasCard: (id, updates) => set((s) => ({
    canvasCards: s.canvasCards.map((c) => c.id === id ? { ...c, ...updates } : c),
  })),

  removeCanvasCard: (id) => set((s) => ({
    canvasCards: s.canvasCards.filter((c) => c.id !== id),
  })),

  reset: () => set(initialState),
}));
