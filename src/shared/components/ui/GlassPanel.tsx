import { type ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function GlassPanel({ children, className = '', hover = false, padding = 'md' }: GlassPanelProps) {
  return (
    <div className={`${hover ? 'glass-panel-hover' : 'glass-panel'} ${paddingMap[padding]} ${className}`}>
      {children}
    </div>
  );
}
