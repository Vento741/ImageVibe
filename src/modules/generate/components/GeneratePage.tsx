import { PromptInput } from './PromptInput';
import { StyleTags } from './StyleTags';
import { ParamsPanel } from './ParamsPanel';
import { Canvas } from './Canvas';
import { GenerateButton } from './GenerateButton';
import { BatchControls } from './BatchControls';
import { ModeSelector } from './ModeSelector';
import { SourceImage } from './SourceImage';
import { useGenerateStore } from '../store';
import { PresetSelector } from '@/modules/presets/components/PresetSelector';
import { QueuePanel } from '@/modules/queue/components/QueuePanel';

export function GeneratePage() {
  const uiMode = useGenerateStore((s) => s.uiMode);

  return (
    <div className="flex h-full gap-4">
      {/* Left Panel — Prompt & Params */}
      <div className="w-80 min-w-0 flex flex-col gap-3 overflow-y-auto overflow-x-hidden pr-1 shrink-0">
        {uiMode === 'advanced' && <PresetSelector />}
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

      {/* Right Panel — Canvas */}
      <div className="flex-1 min-w-0">
        <Canvas />
      </div>
    </div>
  );
}
