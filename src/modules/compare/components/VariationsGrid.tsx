import { motion } from 'framer-motion';
import type { GenerationResult } from '@/shared/types/api';
import { formatCostDisplay, getModelShortName } from '@/shared/lib/utils';

interface VariationsGridProps {
  results: Array<GenerationResult & { filePath?: string; imageId?: number }>;
  onSelect?: (result: GenerationResult & { filePath?: string; imageId?: number }) => void;
}

export function VariationsGrid({ results, onSelect }: VariationsGridProps) {
  if (results.length === 0) return null;

  const gridRows = results.length <= 2 ? 'grid-rows-1' : 'grid-rows-2';

  return (
    <div className={`grid grid-cols-2 ${gridRows} gap-2 w-full h-full`}>
      {results.slice(0, 4).map((result, idx) => (
        <motion.div
          key={`${result.generationId}-${idx}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.1 }}
          onClick={() => onSelect?.(result)}
          className="relative rounded-lg overflow-hidden cursor-pointer group"
        >
          <img
            src={`data:image/png;base64,${result.imageBase64}`}
            alt={result.prompt}
            className="w-full h-full object-cover"
          />

          {/* Оверлей при наведении */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
            <div className="w-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="glass-panel px-2 py-1 text-[10px] text-text-secondary flex justify-between">
                <span>{getModelShortName(result.modelId)}</span>
                <span>
                  {result.seed && `#${result.seed}`}
                  {result.costUsd > 0 && ` • ${formatCostDisplay(result.costUsd)}`}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
