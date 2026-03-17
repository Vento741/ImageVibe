import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import { ipc } from '@/shared/lib/ipc';

export function SourceImage() {
  const mode = useGenerateStore((s) => s.mode);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleSelectFile = useCallback(async () => {
    const filePath = await ipc.invoke('file:select-image');
    if (filePath) {
      setSourceImage(filePath);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setSourceImage(reader.result);
        }
      };
      reader.onerror = () => {
        console.error('Failed to read dropped image');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleRemove = useCallback(() => {
    setSourceImage(null);
  }, []);

  // Only show for img2img and inpaint modes
  if (mode === 'text2img' || mode === 'upscale') return null;

  return (
    <GlassPanel padding="sm" className="flex flex-col gap-2">
      <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider">
        {mode === 'img2img' ? 'Исходное изображение' : 'Изображение для инпейнта'}
      </label>

      <AnimatePresence mode="wait">
        {sourceImage ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
          >
            <img
              src={sourceImage.startsWith('data:') ? sourceImage : `file://${sourceImage}`}
              alt="Source"
              className="w-full h-32 object-cover rounded-lg"
            />
            <button
              onClick={handleRemove}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-bg-primary/80 text-text-secondary hover:text-text-primary flex items-center justify-center text-xs cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleSelectFile}
            className={`h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
              isDragging
                ? 'border-aurora-blue bg-aurora-blue/5'
                : 'border-glass-border hover:border-text-tertiary'
            }`}
          >
            <span className="text-2xl">📁</span>
            <span className="text-xs text-text-tertiary">
              Перетащите или нажмите
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassPanel>
  );
}
