import { PromptInput } from './PromptInput';
import { StyleTags } from './StyleTags';
import { ParamsPanel } from './ParamsPanel';
import { Canvas } from './Canvas';
import { GenerateButton } from './GenerateButton';
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
      <div className="w-80 flex flex-col gap-3 overflow-y-auto pr-1 shrink-0">
        {uiMode === 'advanced' && <PresetSelector />}
        {uiMode === 'advanced' && <ModeSelector />}
        <PromptInput />
        <StyleTags />
        {uiMode === 'advanced' && <SourceImage />}
        {uiMode === 'advanced' && <ParamsPanel />}
        <GenerateButton />
        {uiMode === 'advanced' && <QueuePanel />}
      </div>

      {/* Right Panel — Canvas */}
      <div className="flex-1 min-w-0">
        <Canvas />
      </div>
    </div>
  );
}
