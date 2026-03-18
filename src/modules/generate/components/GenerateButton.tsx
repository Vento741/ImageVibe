import { useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useGenerateStore } from '../store';
import { useCostStore } from '@/modules/cost/store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay, generateId } from '@/shared/lib/utils';
import { useToastStore } from '@/shared/stores/toastStore';

export function GenerateButton() {
  const prompt = useGenerateStore((s) => s.prompt);
  const selectedModelId = useGenerateStore((s) => s.selectedModelId);
  const mode = useGenerateStore((s) => s.mode);
  const aspectRatio = useGenerateStore((s) => s.aspectRatio);
  const imageSize = useGenerateStore((s) => s.imageSize);
  const seed = useGenerateStore((s) => s.seed);
  const negativePrompt = useGenerateStore((s) => s.negativePrompt);
  const styleTags = useGenerateStore((s) => s.styleTags);
  const pushPromptHistory = useGenerateStore((s) => s.pushPromptHistory);
  const addCanvasCard = useGenerateStore((s) => s.addCanvasCard);
  const currentEstimate = useCostStore((s) => s.currentEstimate);
  const setCurrentEstimate = useCostStore((s) => s.setCurrentEstimate);
  const addToast = useToastStore((s) => s.addToast);

  // Fetch cost estimate when model/size changes
  useEffect(() => {
    ipc.invoke('cost:estimate', selectedModelId, imageSize).then(setCurrentEstimate).catch(() => {});
  }, [selectedModelId, imageSize, setCurrentEstimate]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;

    pushPromptHistory(prompt);

    // Create a canvas card immediately (placeholder)
    const clientId = generateId();
    addCanvasCard({
      id: clientId,
      status: 'generating',
      prompt,
      modelId: selectedModelId,
      aspectRatio,
      imageSize,
      startedAt: Date.now(),
    });

    // Get source image base64 if in img2img/inpaint mode
    const { sourceImageData, maskData } = useGenerateStore.getState();
    let sourceImageBase64: string | undefined;
    if (sourceImageData && mode !== 'text2img') {
      sourceImageBase64 = sourceImageData.startsWith('data:')
        ? sourceImageData.replace(/^data:image\/\w+;base64,/, '')
        : undefined;
    }

    // Get mask base64 for inpaint mode
    const maskBase64 = mode === 'inpaint' && maskData ? maskData : undefined;

    // Submit to queue — fire and forget
    ipc.invoke('queue:submit', {
      prompt,
      negativePrompt: negativePrompt || undefined,
      modelId: selectedModelId,
      mode,
      aspectRatio,
      imageSize,
      seed: seed ?? undefined,
      styleTags: styleTags.length > 0 ? styleTags : undefined,
      sourceImageBase64,
      maskBase64,
      clientId,
    }).then((res) => {
      // Store the queue item ID on the card
      useGenerateStore.getState().updateCanvasCard(clientId, { queueItemId: res.queueItemId });
    }).catch((err) => {
      // If submission itself failed (e.g. no API key)
      useGenerateStore.getState().updateCanvasCard(clientId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Ошибка отправки в очередь',
      });
      addToast({ message: 'Ошибка генерации', type: 'error' });
    });
  }, [prompt, negativePrompt, selectedModelId, mode, aspectRatio, imageSize, seed, styleTags, pushPromptHistory, addCanvasCard, addToast]);

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

  const canGenerate = prompt.trim().length > 0;

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
        <span className="flex items-center justify-center gap-2">
          <Sparkles size={16} />
          Генерировать
        </span>
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
