import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGenerateStore } from '../store';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';

/** Predefined style tags grouped by category */
const STYLE_GROUPS = [
  {
    name: 'Стиль',
    tags: [
      'photorealistic', 'anime', 'digital art', 'oil painting',
      'watercolor', '3D render', 'pixel art', 'sketch',
      'comic book', 'cinematic', 'concept art', 'minimalist',
    ],
  },
  {
    name: 'Качество',
    tags: [
      '8K UHD', 'high detail', 'sharp focus', 'professional',
      'masterpiece', 'best quality', 'highly detailed',
    ],
  },
  {
    name: 'Освещение',
    tags: [
      'dramatic lighting', 'soft light', 'golden hour',
      'studio lighting', 'neon', 'backlit', 'volumetric light',
    ],
  },
  {
    name: 'Настроение',
    tags: [
      'epic', 'moody', 'vibrant', 'dark', 'ethereal',
      'cyberpunk', 'steampunk', 'fantasy', 'sci-fi',
    ],
  },
];

export function StyleTags() {
  const styleTags = useGenerateStore((s) => s.styleTags);
  const toggleStyleTag = useGenerateStore((s) => s.toggleStyleTag);
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <GlassPanel padding="sm" className="flex flex-col gap-2">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between cursor-pointer w-full"
      >
        <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider cursor-pointer">
          Стили {styleTags.length > 0 && `(${styleTags.length})`}
        </label>
        <span className={`text-text-tertiary text-xs transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>
          ▼
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2">
              {STYLE_GROUPS.map((group) => (
                <div key={group.name}>
                  <div className="text-[10px] text-text-tertiary mb-1">{group.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {group.tags.map((tag) => (
                      <StyleTag
                        key={tag}
                        tag={tag}
                        isActive={styleTags.includes(tag)}
                        onClick={() => toggleStyleTag(tag)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassPanel>
  );
}

function StyleTag({
  tag,
  isActive,
  onClick,
}: {
  tag: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={`px-2 py-0.5 rounded-md text-xs transition-colors cursor-pointer ${
        isActive
          ? 'bg-aurora-blue/20 text-aurora-blue border border-aurora-blue/30'
          : 'text-text-secondary hover:bg-glass-hover hover:text-text-primary border border-transparent'
      }`}
    >
      {tag}
    </motion.button>
  );
}
