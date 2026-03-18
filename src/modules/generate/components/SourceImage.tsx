import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Paintbrush, Check } from 'lucide-react';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGenerateStore } from '../store';
import { ipc } from '@/shared/lib/ipc';
import { localFileUrl } from '@/shared/lib/utils';
import { MaskEditor } from './MaskEditor';

export function SourceImage() {
  const mode = useGenerateStore((s) => s.mode);
  const sourceImageData = useGenerateStore((s) => s.sourceImageData);
  const setSourceImageData = useGenerateStore((s) => s.setSourceImageData);
  const maskData = useGenerateStore((s) => s.maskData);
  const [isDragging, setIsDragging] = useState(false);
  const [showMaskEditor, setShowMaskEditor] = useState(false);

  const handleSelectFile = useCallback(async () => {
    const filePath = await ipc.invoke('file:select-image');
    if (filePath) {
      setSourceImageData(filePath);
    }
  }, [setSourceImageData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setSourceImageData(reader.result);
        }
      };
      reader.onerror = () => {
        console.error('Failed to read dropped image');
      };
      reader.readAsDataURL(file);
    }
  }, [setSourceImageData]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleRemove = useCallback(() => {
    setSourceImageData(null);
  }, [setSourceImageData]);

  // Only show for img2img and inpaint modes
  if (mode === 'text2img' || mode === 'upscale') return null;

  const imgSrc = sourceImageData
    ? sourceImageData.startsWith('data:') ? sourceImageData : localFileUrl(sourceImageData)
    : null;

  const isInpaint = mode === 'inpaint';

  return (
    <>
      <GlassPanel padding="sm" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-tertiary font-medium uppercase tracking-wider">
            {isInpaint ? 'Изображение для инпейнта' : 'Исходное изображение'}
          </label>
          {sourceImageData && (
            <button
              onClick={handleRemove}
              className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
            >
              Удалить
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {imgSrc ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              <img
                src={imgSrc}
                alt="Source"
                className="w-full h-32 object-cover rounded-lg"
              />

              {/* Inpaint: mask button overlay */}
              {isInpaint && (
                <button
                  onClick={() => setShowMaskEditor(true)}
                  className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-lg transition-all cursor-pointer ${
                    maskData
                      ? 'bg-aurora-purple/20 hover:bg-aurora-purple/30'
                      : 'bg-black/40 hover:bg-black/50'
                  }`}
                >
                  {maskData ? (
                    <>
                      <Check size={20} className="text-aurora-purple" />
                      <span className="text-xs text-aurora-purple font-medium">Маска готова</span>
                      <span className="text-[10px] text-white/50">Нажмите для редактирования</span>
                    </>
                  ) : (
                    <>
                      <Paintbrush size={20} className="text-white/70" />
                      <span className="text-xs text-white/80 font-medium">Нарисовать маску</span>
                    </>
                  )}
                </button>
              )}
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
              <Upload size={16} className="text-text-tertiary" />
              <span className="text-xs text-text-tertiary">
                Перетащите или нажмите
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassPanel>

      {/* Fullscreen mask editor modal */}
      <AnimatePresence>
        {showMaskEditor && sourceImageData && (
          <MaskEditor onClose={() => setShowMaskEditor(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
