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
  const params = useGenerateStore((s) => s.params);
  const styleTags = useGenerateStore((s) => s.styleTags);
  const pushPromptHistory = useGenerateStore((s) => s.pushPromptHistory);
  const addCanvasCard = useGenerateStore((s) => s.addCanvasCard);
  const currentEstimate = useCostStore((s) => s.currentEstimate);
  const setCurrentEstimate = useCostStore((s) => s.setCurrentEstimate);
  const addToast = useToastStore((s) => s.addToast);

  // Предварительной цены у kie.ai не существует: показывается медиана собственных
  // прошлых генераций этой моделью, и только она
  useEffect(() => {
    if (!selectedModelId) {
      setCurrentEstimate(null);
      return;
    }
    ipc.invoke('cost:estimate', selectedModelId).then(setCurrentEstimate).catch(() => {});
  }, [selectedModelId, setCurrentEstimate]);

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
      params,
      startedAt: Date.now(),
    });

    // Исходник и маска уже приведены к data-URL при выборе: путь к файлу и ссылка
    // local-file:// до сюда не доходят
    const current = useGenerateStore.getState();

    ipc.invoke('queue:submit', {
      prompt,
      modelId: selectedModelId,
      mode,
      params,
      styleTags: styleTags.length > 0 ? styleTags : undefined,
      sourceImageDataUrl: current.sourceImageData ?? undefined,
      maskDataUrl: mode === 'inpaint' ? (current.maskData ?? undefined) : undefined,
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
  }, [prompt, selectedModelId, mode, params, styleTags, pushPromptHistory, addCanvasCard, addToast]);

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

      {/* Цена поставщика неизвестна в принципе — показывается только своя история */}
      {currentEstimate !== null ? (
        <div
          className="text-xs text-text-tertiary whitespace-nowrap"
          title="Медиана ваших прошлых генераций этой моделью"
        >
          ≈{formatCostDisplay(currentEstimate)}
        </div>
      ) : (
        selectedModelId && (
          <div className="text-xs text-text-tertiary/70 whitespace-nowrap">
            Цена — после первой генерации
          </div>
        )
      )}
    </div>
  );
}
