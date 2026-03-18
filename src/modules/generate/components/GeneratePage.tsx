import { useState, useCallback, useRef, useEffect } from 'react';
import { PromptInput } from './PromptInput';
import { StyleTags } from './StyleTags';
import { ParamsPanel } from './ParamsPanel';
import { Canvas } from './Canvas';
import { GenerateButton } from './GenerateButton';
import { BatchControls } from './BatchControls';
import { ModeSelector } from './ModeSelector';
import { SourceImage } from './SourceImage';
import { Zap } from 'lucide-react';
import { useGenerateStore } from '../store';
import { PresetSelector } from '@/modules/presets/components/PresetSelector';
import { QueuePanel } from '@/modules/queue/components/QueuePanel';
import { Tooltip } from '@/shared/components/ui/Tooltip';

export function GeneratePage() {
  const uiMode = useGenerateStore((s) => s.uiMode);
  const toggleUiMode = useGenerateStore((s) => s.toggleUiMode);
  const [panelWidth, setPanelWidth] = useState(320);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [panelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(260, Math.min(600, startWidth.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="flex h-full">
      {/* Left Panel — Prompt & Params */}
      <div
        className="min-w-0 flex flex-col gap-3 overflow-y-auto overflow-x-hidden pr-1 shrink-0"
        style={{ width: panelWidth }}
      >
        {/* Mode toggle */}
        <Tooltip text={`${uiMode === 'simple' ? 'Расширенный' : 'Простой'} режим (Ctrl+Shift+M)`}>
          <button
            onClick={toggleUiMode}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer w-full ${
              uiMode === 'advanced'
                ? 'bg-aurora-purple/15 text-aurora-purple border border-aurora-purple/25'
                : 'glass-panel text-text-secondary hover:text-text-primary animate-mode-pulse'
            }`}
          >
            <Zap size={14} />
            {uiMode === 'advanced' ? 'Расширенный режим' : 'Простой режим'}
          </button>
        </Tooltip>

        <PresetSelector />
        {uiMode === 'advanced' && <ModeSelector />}
        <PromptInput />
        <StyleTags />
        {uiMode === 'advanced' && <SourceImage />}
        {uiMode === 'advanced' && <ParamsPanel />}
        <div className="flex flex-col gap-2">
          <GenerateButton />
          {uiMode === 'advanced' && <BatchControls />}
        </div>
        {uiMode === 'advanced' && <QueuePanel />}
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 shrink-0 cursor-col-resize hover:bg-aurora-blue/30 active:bg-aurora-blue/50 transition-colors mx-1 rounded-full"
      />

      {/* Right Panel — Canvas */}
      <div className="flex-1 min-w-0">
        <Canvas />
      </div>
    </div>
  );
}
