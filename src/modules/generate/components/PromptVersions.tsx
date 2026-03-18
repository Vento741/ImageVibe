import { useGenerateStore } from '../store';

export function PromptVersions() {
  const promptHistory = useGenerateStore((s) => s.promptHistory);
  const promptHistoryIndex = useGenerateStore((s) => s.promptHistoryIndex);
  const undoPrompt = useGenerateStore((s) => s.undoPrompt);
  const redoPrompt = useGenerateStore((s) => s.redoPrompt);

  if (promptHistory.length <= 1) return null;

  const canUndo = promptHistoryIndex > 0;
  const canRedo = promptHistoryIndex < promptHistory.length - 1;

  return (
    <div className="flex items-center gap-1 text-xs text-text-tertiary">
      <span>↩</span>
      <button
        onClick={undoPrompt}
        disabled={!canUndo}
        className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
          canUndo ? 'hover:bg-glass-hover text-text-secondary' : 'opacity-30 cursor-not-allowed'
        }`}
        title="Отменить (Ctrl+Z)"
      >
        ←
      </button>
      <span className="text-[10px]">
        v{promptHistoryIndex + 1}/{promptHistory.length}
      </span>
      <button
        onClick={redoPrompt}
        disabled={!canRedo}
        className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
          canRedo ? 'hover:bg-glass-hover text-text-secondary' : 'opacity-30 cursor-not-allowed'
        }`}
        title="Повторить (Ctrl+Shift+Z)"
      >
        →
      </button>
    </div>
  );
}
