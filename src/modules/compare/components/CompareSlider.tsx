import { useState, useRef, useCallback } from 'react';
import { clamp } from '@/shared/lib/utils';

interface CompareSliderProps {
  imageA: string; // base64 or URL
  imageB: string;
  labelA?: string;
  labelB?: string;
}

export function CompareSlider({ imageA, imageB, labelA, labelB }: CompareSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setPosition(clamp(x, 0, 100));
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    setPosition(clamp(x, 0, 100));
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden rounded-lg cursor-col-resize select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
    >
      {/* Изображение B (правое, полное) */}
      <img
        src={`data:image/png;base64,${imageB}`}
        alt={labelB || 'Изображение Б'}
        className="absolute inset-0 w-full h-full object-contain"
        draggable={false}
      />

      {/* Изображение A (левое, обрезанное) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img
          src={`data:image/png;base64,${imageA}`}
          alt={labelA || 'Изображение А'}
          className="w-full h-full object-contain"
          style={{ width: containerRef.current?.offsetWidth ?? '100%' }}
          draggable={false}
        />
      </div>

      {/* Разделитель */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10 cursor-col-resize"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        {/* Ручка */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm border border-white/40 flex items-center justify-center">
          <span className="text-white text-xs">⟷</span>
        </div>
      </div>

      {/* Подписи */}
      {labelA && (
        <div className="absolute bottom-2 left-2 glass-panel px-2 py-1 text-[10px] text-text-secondary z-20">
          {labelA}
        </div>
      )}
      {labelB && (
        <div className="absolute bottom-2 right-2 glass-panel px-2 py-1 text-[10px] text-text-secondary z-20">
          {labelB}
        </div>
      )}
    </div>
  );
}
