import { useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGenerateStore } from '../store';
import { useCostStore } from '@/modules/cost/store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay } from '@/shared/lib/utils';

export function GenerateButton() {
  const prompt = useGenerateStore((s) => s.prompt);
  const selectedModelId = useGenerateStore((s) => s.selectedModelId);
  const mode = useGenerateStore((s) => s.mode);
  const aspectRatio = useGenerateStore((s) => s.aspectRatio);
  const imageSize = useGenerateStore((s) => s.imageSize);
  const seed = useGenerateStore((s) => s.seed);
  const negativePrompt = useGenerateStore((s) => s.negativePrompt);
  const styleTags = useGenerateStore((s) => s.styleTags);
  const isGenerating = useGenerateStore((s) => s.isGenerating);
  const setIsGenerating = useGenerateStore((s) => s.setIsGenerating);
  const setCurrentResult = useGenerateStore((s) => s.setCurrentResult);
  const setTranslatedPrompt = useGenerateStore((s) => s.setTranslatedPrompt);
  const pushPromptHistory = useGenerateStore((s) => s.pushPromptHistory);
  const currentEstimate = useCostStore((s) => s.currentEstimate);
  const setCurrentEstimate = useCostStore((s) => s.setCurrentEstimate);
  const addSessionCost = useCostStore((s) => s.addSessionCost);

  // Fetch cost estimate when model/size changes
  useEffect(() => {
    ipc.invoke('cost:estimate', selectedModelId).then(setCurrentEstimate).catch(() => {});
  }, [selectedModelId, imageSize, setCurrentEstimate]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    pushPromptHistory(prompt);

    try {
      const result = await ipc.invoke('generate:image', {
        prompt,
        negativePrompt: negativePrompt || undefined,
        modelId: selectedModelId,
        mode,
        aspectRatio,
        imageSize,
        seed: seed ?? undefined,
        styleTags: styleTags.length > 0 ? styleTags : undefined,
      });

      setCurrentResult(result);
      if (result.translatedPrompt) {
        setTranslatedPrompt(result.translatedPrompt);
      }
      if (result.costUsd > 0) {
        addSessionCost(result.costUsd);
      }
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, negativePrompt, selectedModelId, mode, aspectRatio, imageSize, seed, styleTags, isGenerating, setIsGenerating, pushPromptHistory, setCurrentResult, setTranslatedPrompt, addSessionCost]);

  // Use ref to avoid re-registering listeners on every state change
  const handleGenerateRef = useRef(handleGenerate);
  handleGenerateRef.current = handleGenerate;

  // Listen for Ctrl+Enter from PromptInput — register once
  useEffect(() => {
    const handler = () => handleGenerateRef.current();
    document.addEventListener('imagevibe:generate', handler);
    return () => document.removeEventListener('imagevibe:generate', handler);
  }, []);

  // Global keyboard shortcut — register once
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleGenerateRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  return (
    <div className="flex items-center gap-3">
      <motion.button
        onClick={handleGenerate}
        disabled={!canGenerate}
        whileHover={canGenerate ? { scale: 1.02 } : {}}
        whileTap={canGenerate ? { scale: 0.98 } : {}}
        className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${
          canGenerate
            ? 'bg-gradient-to-r from-aurora-blue to-aurora-purple text-white shadow-lg shadow-aurora-blue/25 hover:shadow-aurora-blue/40'
            : 'bg-glass text-text-tertiary cursor-not-allowed'
        }`}
      >
        {isGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Генерация...
          </span>
        ) : (
          <span>🎲 Генерировать</span>
        )}
      </motion.button>

      {/* Cost estimate */}
      {currentEstimate && currentEstimate.estimatedCost > 0 && (
        <div className="text-xs text-text-tertiary whitespace-nowrap">
          ~{formatCostDisplay(currentEstimate.estimatedCost)}
        </div>
      )}
    </div>
  );
}
