import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Paintbrush, Eraser, Undo2, Trash2, Check, X, Minus, Plus } from 'lucide-react';
import { useGenerateStore } from '../store';
import { useMaskCanvas } from '../hooks/useMaskCanvas';
import { localFileUrl } from '@/shared/lib/utils';

type Tool = 'brush' | 'eraser';

interface MaskEditorProps {
  onClose: () => void;
}

export function MaskEditor({ onClose }: MaskEditorProps) {
  const sourceImageData = useGenerateStore((s) => s.sourceImageData);
  const setMaskData = useGenerateStore((s) => s.setMaskData);

  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(40);
  const [canvasReady, setCanvasReady] = useState(false);
  const [hasMask, setHasMask] = useState(false);

  // Cursor: position in viewport coords + whether it's over the image/canvas
  const [cursor, setCursor] = useState<{ x: number; y: number; over: boolean } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleExport = useCallback(() => {
    const base64 = exportMask();
    setHasMask(base64 !== null);
  }, []);

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    undo,
    clear,
    canUndo,
    exportMask,
    isDrawingRef,
  } = useMaskCanvas({
    canvasRef,
    tool,
    brushSize,
    onStrokeEnd: handleExport,
  });

  // When image loads, size the canvas to match and mark ready
  // Use effect + state so canvas is already in DOM when we set dimensions
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // Once we know image dimensions AND canvas is in DOM, set canvas size + restore mask
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgNatural) return;
    canvas.width = imgNatural.w;
    canvas.height = imgNatural.h;

    // Restore previously saved mask from store
    const savedMask = useGenerateStore.getState().maskData;
    if (savedMask) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          // Draw the black/white mask, then convert white pixels to purple overlay
          const offscreen = document.createElement('canvas');
          offscreen.width = imgNatural.w;
          offscreen.height = imgNatural.h;
          const offCtx = offscreen.getContext('2d')!;
          offCtx.drawImage(img, 0, 0);
          const data = offCtx.getImageData(0, 0, imgNatural.w, imgNatural.h);
          // Convert white mask pixels to purple overlay on the visible canvas
          const overlay = ctx.createImageData(imgNatural.w, imgNatural.h);
          for (let i = 0; i < data.data.length; i += 4) {
            if (data.data[i] > 128) {
              // White pixel in mask → purple overlay
              overlay.data[i] = 168;     // R
              overlay.data[i + 1] = 85;  // G
              overlay.data[i + 2] = 247; // B
              overlay.data[i + 3] = 115; // A (~45%)
            }
          }
          ctx.putImageData(overlay, 0, 0);
          setHasMask(true);
        };
        img.src = 'data:image/png;base64,' + savedMask;
      }
    }

    setCanvasReady(true);
  }, [imgNatural]);

  // Check if point is over the canvas/image
  const isOverImage = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return false;
    const r = img.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '[') {
        e.preventDefault();
        setBrushSize((s) => Math.max(5, s - 5));
      } else if (e.key === ']') {
        e.preventDefault();
        setBrushSize((s) => Math.min(150, s + 5));
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, undo]);

  const handleApply = useCallback(() => {
    const base64 = exportMask();
    setMaskData(base64);
    onClose();
  }, [exportMask, setMaskData, onClose]);

  // Unified pointer move on the entire overlay
  const handleGlobalPointerMove = useCallback((e: React.PointerEvent) => {
    const over = isOverImage(e.clientX, e.clientY);
    setCursor({ x: e.clientX, y: e.clientY, over });
  }, [isOverImage]);

  // Pointer down on canvas — delegates to hook (sets hook's isDrawingRef)
  const handleCanvasDown = useCallback((e: React.PointerEvent) => {
    handlePointerDown(e);
  }, [handlePointerDown]);

  // Pointer up anywhere — delegates to hook
  const handleGlobalPointerUp = useCallback(() => {
    handlePointerUp();
  }, [handlePointerUp]);

  // Canvas pointer move — updates cursor + delegates drawing to hook
  const handleCanvasMove = useCallback((e: React.PointerEvent) => {
    setCursor({ x: e.clientX, y: e.clientY, over: true });
    if (isDrawingRef.current) {
      handlePointerMove(e);
    }
  }, [handlePointerMove, isDrawingRef]);

  if (!sourceImageData) return null;

  const imgSrc = sourceImageData.startsWith('data:')
    ? sourceImageData
    : localFileUrl(sourceImageData);

  // Display brush size scaled to CSS size
  const getDisplayBrushSize = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return brushSize * 0.3;
    const rect = img.getBoundingClientRect();
    return brushSize * (rect.width / (canvas.width || 1));
  };

  const displayBrushSize = getDisplayBrushSize();
  const showBrushCursor = cursor && cursor.over;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      style={{
        cursor: cursor?.over ? 'none' : 'default',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
      onPointerMove={handleGlobalPointerMove}
      onPointerUp={handleGlobalPointerUp}
      onPointerLeave={() => {
        setCursor(null);
        handleGlobalPointerUp();
      }}
    >
      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        <div className="relative max-w-full max-h-full select-none">
          <img
            ref={imgRef}
            src={imgSrc}
            alt="Source"
            onLoad={handleImageLoad}
            className="max-w-full max-h-[calc(100vh-100px)] block rounded-lg"
            draggable={false}
            style={{ objectFit: 'contain' }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full rounded-lg touch-none"
            onPointerDown={handleCanvasDown}
            onPointerMove={handleCanvasMove}
            onPointerUp={handleGlobalPointerUp}
          />

          {/* Hint */}
          {canvasReady && !hasMask && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 backdrop-blur-sm px-5 py-3 rounded-xl text-center">
                <p className="text-sm text-white/70">Закрасьте область, которую нужно перерисовать</p>
                <p className="text-xs text-white/40 mt-1">ЛКМ — рисовать &nbsp;|&nbsp; B — кисть &nbsp;|&nbsp; E — ластик &nbsp;|&nbsp; [ ] — размер</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom toolbar */}
      <div
        className="flex items-center justify-between px-6 py-3 bg-bg-primary/80 backdrop-blur-md border-t border-glass-border"
        style={{ cursor: 'default' }}
      >
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1">
            <ToolButton active={tool === 'brush'} onClick={() => setTool('brush')} title="Кисть (B)" shortcut="B">
              <Paintbrush size={16} />
              <span className="text-xs ml-1.5">Кисть</span>
            </ToolButton>
            <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Ластик (E)" shortcut="E">
              <Eraser size={16} />
              <span className="text-xs ml-1.5">Ластик</span>
            </ToolButton>
          </div>

          <div className="w-px h-6 bg-glass-border" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBrushSize((s) => Math.max(5, s - 10))}
              className="w-6 h-6 rounded flex items-center justify-center text-text-secondary hover:bg-glass-hover cursor-pointer"
            >
              <Minus size={12} />
            </button>
            <input
              type="range"
              min={5}
              max={150}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-28 h-1 bg-glass-active rounded-full appearance-none cursor-pointer accent-aurora-purple"
            />
            <button
              onClick={() => setBrushSize((s) => Math.min(150, s + 10))}
              className="w-6 h-6 rounded flex items-center justify-center text-text-secondary hover:bg-glass-hover cursor-pointer"
            >
              <Plus size={12} />
            </button>
            <span className="text-xs text-text-tertiary w-8 text-center">{brushSize}px</span>
          </div>

          <div className="w-px h-6 bg-glass-border" />

          <div className="flex items-center gap-1">
            <ToolButton active={false} onClick={undo} disabled={!canUndo} title="Отменить (Ctrl+Z)">
              <Undo2 size={16} />
            </ToolButton>
            <ToolButton active={false} onClick={clear} title="Очистить всё">
              <Trash2 size={16} />
            </ToolButton>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
          >
            <X size={16} />
            Отмена
          </button>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-aurora-purple text-white hover:bg-aurora-purple/90 transition-colors cursor-pointer"
          >
            <Check size={16} />
            Применить
          </button>
        </div>
      </div>

      {/* Brush cursor — fixed position, only when over image */}
      {showBrushCursor && (
        <div
          className="pointer-events-none fixed rounded-full z-[60]"
          style={{
            width: displayBrushSize,
            height: displayBrushSize,
            left: cursor.x - displayBrushSize / 2,
            top: cursor.y - displayBrushSize / 2,
            border: `2px solid ${tool === 'eraser' ? 'rgba(255,255,255,0.7)' : 'rgba(168,85,247,0.9)'}`,
            backgroundColor: tool === 'eraser'
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(168,85,247,0.12)',
          }}
        />
      )}
    </motion.div>
  );
}

function ToolButton({
  children,
  active,
  onClick,
  disabled,
  title,
  shortcut,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  shortcut?: string;
}) {
  useEffect(() => {
    if (!shortcut) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === shortcut.toLowerCase() && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onClick();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcut, onClick]);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-8 px-2.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
        active
          ? 'bg-aurora-purple/20 text-aurora-purple border border-aurora-purple/30'
          : disabled
            ? 'text-text-tertiary/30 border border-transparent cursor-not-allowed'
            : 'text-text-secondary hover:bg-glass-hover border border-transparent'
      }`}
    >
      {children}
    </button>
  );
}
