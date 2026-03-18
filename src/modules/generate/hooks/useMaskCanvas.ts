import { useRef, useState, useCallback } from 'react';

interface UseMaskCanvasOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  tool: 'brush' | 'eraser';
  brushSize: number;
  onStrokeEnd: () => void;
}

const MASK_COLOR = 'rgba(168, 85, 247, 0.45)';
const MAX_UNDO = 15;

export function useMaskCanvas({ canvasRef, tool, brushSize, onStrokeEnd }: UseMaskCanvasOptions) {
  const [canUndo, setCanUndo] = useState(false);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d', { willReadFrequently: true });
  }, [canvasRef]);

  const scaleCoords = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, [canvasRef]);

  const saveToUndo = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(data);
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift();
    }
    setCanUndo(true);
  }, [getCtx, canvasRef]);

  const drawAt = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, from?: { x: number; y: number }) => {
    ctx.save();
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = MASK_COLOR;
    }
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    if (from) {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(x, y);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.1, y + 0.1);
    }
    ctx.stroke();
    ctx.restore();
  }, [tool, brushSize]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const ctx = getCtx();
    if (!ctx) return;
    saveToUndo();
    isDrawingRef.current = true;
    const pos = scaleCoords(e);
    lastPointRef.current = pos;
    drawAt(ctx, pos.x, pos.y);
  }, [getCtx, saveToUndo, scaleCoords, drawAt]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const pos = scaleCoords(e);
    drawAt(ctx, pos.x, pos.y, lastPointRef.current ?? undefined);
    lastPointRef.current = pos;
  }, [getCtx, scaleCoords, drawAt]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    onStrokeEnd();
  }, [onStrokeEnd]);

  const undo = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas || undoStackRef.current.length === 0) return;
    const data = undoStackRef.current.pop()!;
    ctx.putImageData(data, 0, 0);
    setCanUndo(undoStackRef.current.length > 0);
    onStrokeEnd();
  }, [getCtx, canvasRef, onStrokeEnd]);

  const clear = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    saveToUndo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onStrokeEnd();
  }, [getCtx, canvasRef, saveToUndo, onStrokeEnd]);

  const exportMask = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const { width, height } = canvas;
    const src = ctx.getImageData(0, 0, width, height);
    let hasAnyMask = false;

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d')!;
    const out = offCtx.createImageData(width, height);

    for (let i = 0; i < src.data.length; i += 4) {
      if (src.data[i + 3] > 0) {
        // Painted pixel → white (edit area)
        out.data[i] = 255;
        out.data[i + 1] = 255;
        out.data[i + 2] = 255;
        out.data[i + 3] = 255;
        hasAnyMask = true;
      } else {
        // Empty pixel → black (keep area)
        out.data[i] = 0;
        out.data[i + 1] = 0;
        out.data[i + 2] = 0;
        out.data[i + 3] = 255;
      }
    }

    if (!hasAnyMask) return null;

    offCtx.putImageData(out, 0, 0);
    const dataUrl = offscreen.toDataURL('image/png');
    return dataUrl.replace(/^data:image\/png;base64,/, '');
  }, [canvasRef]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    undo,
    clear,
    canUndo,
    exportMask,
    isDrawingRef,
  };
}
