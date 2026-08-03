import { useRef, useCallback, useEffect } from 'react';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import { getModelShortName } from '@/shared/lib/utils';
import { PromptActions } from './PromptActions';
import { PromptVersions } from './PromptVersions';
import { TranslationPreview } from './TranslationPreview';

function ModelName() {
  const modelId = useGenerateStore((s) => s.selectedModelId);
  return (
    <span className="text-[10px] text-text-tertiary/60 truncate max-w-[120px]">
      {getModelShortName(modelId)}
    </span>
  );
}

export function PromptInput() {
  const prompt = useGenerateStore((s) => s.prompt);
  const uiMode = useGenerateStore((s) => s.uiMode);
  const setPrompt = useGenerateStore((s) => s.setPrompt);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = prompt.length;
  const estimatedTokens = Math.ceil(charCount / 4);

  // Auto-resize prompt textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, [prompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // Will be handled by GenerateButton's keyboard shortcut
        document.dispatchEvent(new CustomEvent('imagevibe:generate'));
      }
    },
    []
  );

  return (
    <GlassPanel className="flex flex-col gap-2">
      <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider">
        Промпт
      </label>
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Опишите изображение..."
        className="w-full bg-transparent text-text-primary placeholder-text-tertiary resize-none outline-none text-sm leading-relaxed min-h-[60px]"
        rows={2}
      />

      <TranslationPreview />

      {/* Counter + model */}
      <div className="flex justify-between items-center text-xs text-text-tertiary">
        <span>{charCount} символов</span>
        <ModelName />
        <span>~{estimatedTokens} токенов</span>
      </div>

      {/* Prompt assistant actions and version history — advanced mode only */}
      {uiMode === 'advanced' && (
        <div className="flex items-center justify-between border-t border-glass-border pt-2 mt-1">
          <PromptActions />
          <PromptVersions />
        </div>
      )}
    </GlassPanel>
  );
}
