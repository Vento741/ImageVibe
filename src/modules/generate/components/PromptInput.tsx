import { useRef, useCallback } from 'react';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import { PromptActions } from './PromptActions';
import { PromptVersions } from './PromptVersions';
import { TranslationPreview } from './TranslationPreview';
import { NegativePromptTemplates } from './NegativePromptTemplates';

export function PromptInput() {
  const prompt = useGenerateStore((s) => s.prompt);
  const negativePrompt = useGenerateStore((s) => s.negativePrompt);
  const uiMode = useGenerateStore((s) => s.uiMode);
  const setPrompt = useGenerateStore((s) => s.setPrompt);
  const setNegativePrompt = useGenerateStore((s) => s.setNegativePrompt);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = prompt.length;
  const estimatedTokens = Math.ceil(charCount / 4);

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
        className="w-full bg-transparent text-text-primary placeholder-text-tertiary resize-none outline-none text-sm leading-relaxed min-h-[80px] max-h-[200px]"
        rows={3}
      />

      <TranslationPreview />

      {/* Negative prompt — advanced mode only */}
      {uiMode === 'advanced' && (
        <div className="border-t border-glass-border pt-2 mt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-tertiary font-medium">
              Не включать (negative)
            </label>
            <NegativePromptTemplates />
          </div>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="blurry, deformed, low quality..."
            className="w-full bg-transparent text-text-primary placeholder-text-tertiary resize-none outline-none text-xs leading-relaxed mt-1 min-h-[40px] max-h-[80px]"
            rows={2}
          />
        </div>
      )}

      {/* Counter */}
      <div className="flex justify-between text-xs text-text-tertiary">
        <span>{charCount} символов</span>
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
