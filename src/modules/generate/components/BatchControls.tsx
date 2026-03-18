import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGenerateStore } from '../store';
import type { CanvasCard } from '../store';
import { useCostStore } from '@/modules/cost/store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay, randomSeed } from '@/shared/lib/utils';
import { useToastStore } from '@/shared/stores/toastStore';

let batchIdCounter = 0;

export function BatchControls() {
  const [batchCount, setBatchCount] = useState(4);
  const batchCountRef = useRef(batchCount);
  batchCountRef.current = batchCount;

  const currentEstimate = useCostStore((s) => s.currentEstimate);
  const batchCost = (currentEstimate?.estimatedCost ?? 0) * batchCount;

  const handleBatchGenerate = () => {
    const store = useGenerateStore.getState();
    if (!store.prompt.trim()) return;

    const count = batchCountRef.current;
    store.pushPromptHistory(store.prompt);

    // Build cards with guaranteed unique IDs
    const cards: CanvasCard[] = [];
    for (let i = 0; i < count; i++) {
      batchIdCounter++;
      cards.push({
        id: `batch-${Date.now()}-${batchIdCounter}-${i}`,
        status: 'generating',
        prompt: store.prompt,
        modelId: store.selectedModelId,
        aspectRatio: store.aspectRatio,
        imageSize: store.imageSize,
        startedAt: Date.now(),
      });
    }

    // Single atomic store update
    store.addCanvasCards(cards);

    // Get source image base64 if in img2img/inpaint mode
    let sourceImageBase64: string | undefined;
    if (store.sourceImageData && store.mode !== 'text2img') {
      sourceImageBase64 = store.sourceImageData.startsWith('data:')
        ? store.sourceImageData.replace(/^data:image\/\w+;base64,/, '')
        : undefined;
    }

    // Get mask base64 for inpaint mode
    const maskBase64 = store.mode === 'inpaint' && store.maskData ? store.maskData : undefined;

    // Submit each to the queue
    for (const card of cards) {
      ipc.invoke('queue:submit', {
        prompt: store.prompt,
        negativePrompt: store.negativePrompt || undefined,
        modelId: store.selectedModelId,
        mode: store.mode,
        aspectRatio: store.aspectRatio,
        imageSize: store.imageSize,
        seed: randomSeed(),
        styleTags: store.styleTags.length > 0 ? store.styleTags : undefined,
        sourceImageBase64,
        maskBase64,
        clientId: card.id,
      }).then((res) => {
        useGenerateStore.getState().updateCanvasCard(card.id, { queueItemId: res.queueItemId });
      }).catch(() => {
        useGenerateStore.getState().updateCanvasCard(card.id, {
          status: 'failed',
          error: 'Ошибка отправки в очередь',
        });
      });
    }

    useToastStore.getState().addToast({
      message: `${count} генераций добавлено в очередь`,
      type: 'info',
    });
  };

  const canBatch = useGenerateStore((s) => s.prompt.trim().length > 0);

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
        <span>×{batchCount}</span>
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
