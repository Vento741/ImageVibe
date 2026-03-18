import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  onReady: () => void;
}

export function SplashScreen({ onReady }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Animate progress bar
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + 2;
      });
    }, 30);

    // Minimum splash time + fade out
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onReady, 400);
    }, 1800);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [onReady]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg-primary rounded-xl"
        >
          {/* Aurora glow background */}
          <div className="absolute inset-0 overflow-hidden rounded-xl">
            <div
              className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[120px]"
              style={{
                background: 'radial-gradient(circle, #4f8ef7, #a855f7)',
                top: '30%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
            <div
              className="absolute w-[300px] h-[300px] rounded-full opacity-15 blur-[100px]"
              style={{
                background: 'radial-gradient(circle, #ec4899, #a855f7)',
                top: '60%',
                left: '60%',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>

          {/* Logo */}
          <motion.img
            src="./logo.png"
            alt="ImageVibe"
            className="w-28 h-28 relative z-10"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="relative z-10 mt-5 text-center"
          >
            <h1 className="text-2xl font-bold text-text-primary tracking-wide">
              ImageVibe
            </h1>
            <p className="text-xs text-text-tertiary mt-1.5">
              AI Image Generation
            </p>
          </motion.div>

          {/* Progress bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="relative z-10 mt-8 w-48"
          >
            <div className="h-0.5 bg-glass-border rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-aurora-blue to-aurora-purple rounded-full"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
