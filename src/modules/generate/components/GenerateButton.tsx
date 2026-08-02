import { useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useGenerateStore } from '../store';
import { useCostStore } from '@/modules/cost/store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay, generateId } from '@/shared/lib/utils';
import { useToastStore } from '@/shared/stores/toastStore';
import type { GenerationParams } from '@/shared/types/api';

export function GenerateButton() {
  const prompt = useGenerateStore((s) => s.prompt);
  const selectedModelId = useGenerateStore((s) => s.selectedModelId);
  const mode = useGenerateStore((s) => s.mode);
  const aspectRatio = useGenerateStore((s) => s.aspectRatio);
  const imageSize = useGenerateStore((s) => s.imageSize);
  const seed = useGenerateStore((s) => s.seed);
  const negativePrompt = useGenerateStore((s) => s.negativePrompt);
  const styleTags = useGenerateStore((s) => s.styleTags);
  const hasSourceImage = useGenerateStore((s) => !!s.sourceImageData);
  const hasMask = useGenerateStore((s) => !!s.maskData);
  const pushPromptHistory = useGenerateStore((s) => s.pushPromptHistory);
  const addCanvasCard = useGenerateStore((s) => s.addCanvasCard);
  const currentEstimate = useCostStore((s) => s.currentEstimate);
  const setCurrentEstimate = useCostStore((s) => s.setCurrentEstimate);
  const addToast = useToastStore((s) => s.addToast);

  // Same shape queue:submit sends (bridge from task 2; task 4 replaces it with the
  // params record from the store, and this call site does not change then).
  const params: GenerationParams = {
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(imageSize ? { resolution: imageSize } : {}),
    ...(seed !== null ? { seed } : {}),
  };
  // Reference images this request will send: the source, plus the mask when inpainting.
  const referenceCount =
    mode !== 'text2img' && hasSourceImage ? (mode === 'inpaint' && hasMask ? 2 : 1) : 0;

  // Fetch cost estimate when model/params change, and again once catalog prices arrive —
  // a cold cache can have models but no endpoints yet, in which case the first estimate
  // comes back unknown and nothing else would ever re-trigger it.
  useEffect(() => {
    const fetchEstimate = () => {
      ipc.invoke('cost:estimate', selectedModelId, params, referenceCount)
        .then(setCurrentEstimate).catch(() => {});
    };
    fetchEstimate();
    return ipc.on('catalog:updated', fetchEstimate);
  }, [selectedModelId, JSON.stringify(params), referenceCount, setCurrentEstimate]);

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
      modelId: selectedModelId,
      mode,
      params: {
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(imageSize ? { resolution: imageSize } : {}),
        ...(seed !== null ? { seed } : {}),
      },
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

  const canGenerate = prompt.trim().length > 0 && selectedModelId.trim().length > 0;

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

      {/* Cost estimate — when it's unknown, say why instead of showing nothing */}
      {currentEstimate && currentEstimate.estimatedCost !== null && (
        <div className="text-xs text-text-tertiary whitespace-nowrap">
          {currentEstimate.basis === 'upper-bound' ? '≤' : '~'}
          {formatCostDisplay(currentEstimate.estimatedCost)}
        </div>
      )}
      {currentEstimate && currentEstimate.estimatedCost === null && currentEstimate.reason && (
        <div
          className="text-xs text-text-tertiary/70 whitespace-nowrap truncate max-w-[220px]"
          title={currentEstimate.reason}
        >
          Цена неизвестна: {currentEstimate.reason}
        </div>
      )}
    </div>
  );
}
