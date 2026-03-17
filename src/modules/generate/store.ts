import { create } from 'zustand';
import type { AspectRatio, ImageSize, GenerationMode, ModelCategory } from '@/shared/types/models';
import type { GenerationResult } from '@/shared/types/api';

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

  // Parameters
  mode: GenerationMode;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  seed: number | null;
  styleTags: string[];

  // UI state
  isGenerating: boolean;
  uiMode: 'simple' | 'advanced';
  showTranslation: boolean;

  // Result
  currentResult: (GenerationResult & { filePath?: string; imageId?: number }) | null;
  resultHistory: Array<GenerationResult & { filePath?: string; imageId?: number }>;

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
  setAspectRatio: (ratio: AspectRatio) => void;
  setImageSize: (size: ImageSize) => void;
  setSeed: (seed: number | null) => void;
  randomizeSeed: () => void;
  setStyleTags: (tags: string[]) => void;
  toggleStyleTag: (tag: string) => void;
  setIsGenerating: (val: boolean) => void;
  setUiMode: (mode: 'simple' | 'advanced') => void;
  toggleUiMode: () => void;
  setShowTranslation: (val: boolean) => void;
  setCurrentResult: (result: GenerateState['currentResult']) => void;
  reset: () => void;
}

const initialState = {
  prompt: '',
  translatedPrompt: '',
  negativePrompt: '',
  promptHistory: [] as string[],
  promptHistoryIndex: -1,
  selectedCategory: 'quality' as ModelCategory,
  selectedModelId: 'black-forest-labs/flux.2-pro',
  mode: 'text2img' as GenerationMode,
  aspectRatio: '1:1' as AspectRatio,
  imageSize: '1K' as ImageSize,
  seed: null as number | null,
  styleTags: [] as string[],
  isGenerating: false,
  uiMode: 'simple' as 'simple' | 'advanced',
  showTranslation: false,
  currentResult: null as GenerateState['currentResult'],
  resultHistory: [] as Array<GenerationResult & { filePath?: string; imageId?: number }>,
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
      promptHistory: [...promptHistory, prompt],
      promptHistoryIndex: promptHistory.length,
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
  setMode: (mode) => set({ mode }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setImageSize: (imageSize) => set({ imageSize }),
  setSeed: (seed) => set({ seed }),
  randomizeSeed: () => set({ seed: Math.floor(Math.random() * 2147483647) }),

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

  setCurrentResult: (result) => {
    if (result) {
      set((s) => ({
        currentResult: result,
        resultHistory: [result, ...s.resultHistory].slice(0, 50),
      }));
    } else {
      set({ currentResult: result });
    }
  },

  reset: () => set(initialState),
}));
