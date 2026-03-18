import { useState, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface TooltipProps {
  children: ReactNode;
  /** Simple text tooltip */
  text?: string;
  /** Rich content tooltip (overrides text) */
  content?: ReactNode;
  /** Delay in ms before showing. Default 350 */
  delay?: number;
}

export function Tooltip({ children, text, content, delay = 350 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ref = useRef<HTMLDivElement>(null);

  const body = content ?? text;
  if (!body) return <>{children}</>;

  const show = () => {
    timeoutRef.current = setTimeout(() => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const tooltipLeft = rect.left + rect.width / 2;
        // Clamp so tooltip doesn't go off screen edges
        const clampedLeft = Math.max(120, Math.min(tooltipLeft, window.innerWidth - 120));
        setPos({
          top: rect.bottom + 8,
          left: clampedLeft,
        });
      }
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="inline-flex"
      >
        {children}
      </div>

      {visible && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[9999] pointer-events-none"
            style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
          >
            <div className="px-3 py-2 rounded-lg text-xs bg-bg-elevated/95 backdrop-blur-md border border-glass-border shadow-xl shadow-black/40 max-w-64">
              {typeof body === 'string' ? (
                <span className="text-text-primary whitespace-nowrap">{body}</span>
              ) : (
                body
              )}
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
