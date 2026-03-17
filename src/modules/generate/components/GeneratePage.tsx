import { PromptInput } from './PromptInput';
import { ParamsPanel } from './ParamsPanel';
import { Canvas } from './Canvas';
import { GenerateButton } from './GenerateButton';
import { useGenerateStore } from '../store';

export function GeneratePage() {
  const uiMode = useGenerateStore((s) => s.uiMode);

  return (
    <div className="flex h-full gap-4">
      {/* Left Panel — Prompt & Params */}
      <div className="w-80 flex flex-col gap-3 overflow-y-auto pr-1 shrink-0">
        <PromptInput />
        {uiMode === 'advanced' && <ParamsPanel />}
        <GenerateButton />
      </div>

      {/* Right Panel — Canvas */}
      <div className="flex-1 min-w-0">
        <Canvas />
      </div>
    </div>
  );
}
