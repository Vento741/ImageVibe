import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useGenerateStore } from '../store';
import { useCostStore } from '@/modules/cost/store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay, randomSeed } from '@/shared/lib/utils';

export function BatchControls() {
  const prompt = useGenerateStore((s) => s.prompt);
  const selectedModelId = useGenerateStore((s) => s.selectedModelId);
  const aspectRatio = useGenerateStore((s) => s.aspectRatio);
  const imageSize = useGenerateStore((s) => s.imageSize);
  const negativePrompt = useGenerateStore((s) => s.negativePrompt);
  const styleTags = useGenerateStore((s) => s.styleTags);
  const mode = useGenerateStore((s) => s.mode);
  const isGenerating = useGenerateStore((s) => s.isGenerating);
  const setIsGenerating = useGenerateStore((s) => s.setIsGenerating);
  const setCurrentResult = useGenerateStore((s) => s.setCurrentResult);
  const currentEstimate = useCostStore((s) => s.currentEstimate);
  const addSessionCost = useCostStore((s) => s.addSessionCost);
  const [batchCount, setBatchCount] = useState(4);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  const canBatch = prompt.trim().length > 0 && !isGenerating && !isBatchRunning;
  const batchCost = (currentEstimate?.estimatedCost ?? 0) * batchCount;

  const handleBatchGenerate = useCallback(async () => {
    if (!canBatch) return;
    setIsBatchRunning(true);
    setIsGenerating(true);

    try {
      for (let i = 0; i < batchCount; i++) {
        const result = await ipc.invoke('generate:image', {
          prompt,
          negativePrompt: negativePrompt || undefined,
          modelId: selectedModelId,
          mode,
          aspectRatio,
          imageSize,
          seed: randomSeed(),
          styleTags: styleTags.length > 0 ? styleTags : undefined,
        });

        setCurrentResult(result);
        if (result.costUsd > 0) {
          addSessionCost(result.costUsd);
        }
      }
    } catch (err) {
      console.error('Batch generation failed:', err);
    } finally {
      setIsBatchRunning(false);
      setIsGenerating(false);
    }
  }, [canBatch, batchCount, prompt, negativePrompt, selectedModelId, mode, aspectRatio, imageSize, styleTags, setIsGenerating, setCurrentResult, addSessionCost]);

  return (
    <div className="flex items-center gap-1.5">
      {/* Batch count selector */}
      <div className="flex items-center gap-0.5">
        {[2, 4, 8].map((count) => (
          <motion.button
            key={count}
            onClick={() => setBatchCount(count)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`px-1.5 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
              batchCount === count
                ? 'bg-aurora-purple/20 text-aurora-purple'
                : 'text-text-tertiary hover:bg-glass-hover'
            }`}
          >
            ×{count}
          </motion.button>
        ))}
      </div>

      {/* Batch generate button */}
      <motion.button
        onClick={handleBatchGenerate}
        disabled={!canBatch}
        whileHover={canBatch ? { scale: 1.02 } : {}}
        whileTap={canBatch ? { scale: 0.98 } : {}}
        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
          canBatch
            ? 'bg-aurora-purple/20 text-aurora-purple hover:bg-aurora-purple/30 border border-aurora-purple/30'
            : 'bg-glass text-text-tertiary cursor-not-allowed border border-transparent'
        }`}
        title={`Генерировать ${batchCount} вариаций`}
      >
        {isBatchRunning ? (
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 border border-aurora-purple/30 border-t-aurora-purple rounded-full animate-spin" />
            Batch...
          </span>
        ) : (
          <span>×{batchCount}</span>
        )}
      </motion.button>

      {/* Cost preview */}
      {batchCost > 0 && (
        <span className="text-[10px] text-text-tertiary">
          ~{formatCostDisplay(batchCost)}
        </span>
      )}
    </div>
  );
}
