import { motion } from 'framer-motion';
import type { Page } from '../../../App';
import { CostCounter } from '@/modules/cost/components/CostCounter';
import { useGenerateStore } from '@/modules/generate/store';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

interface NavItem {
  id: Page;
  icon: string;
  label: string;
  shortcut?: string;
}

const navItems: NavItem[] = [
  { id: 'generate', icon: '🎨', label: 'Генерация', shortcut: 'Ctrl+G' },
  { id: 'gallery', icon: '🖼', label: 'Галерея', shortcut: 'Ctrl+L' },
  { id: 'collections', icon: '📁', label: 'Коллекции' },
  { id: 'analytics', icon: '📊', label: 'Аналитика' },
];

const bottomItems: NavItem[] = [
  { id: 'settings', icon: '⚙️', label: 'Настройки', shortcut: 'Ctrl+,' },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const uiMode = useGenerateStore((s) => s.uiMode);
  const toggleUiMode = useGenerateStore((s) => s.toggleUiMode);

  return (
    <aside className="w-16 h-full flex flex-col items-center py-3 gap-1 bg-bg-secondary/50 border-r border-glass-border relative z-10">
      {/* Drag region for frameless window */}
      <div className="titlebar-drag h-8 w-full" />

      {/* Main navigation */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {navItems.map((item) => (
          <SidebarButton
            key={item.id}
            item={item}
            isActive={currentPage === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>

      {/* Bottom items */}
      <div className="flex flex-col items-center gap-1 w-full">
        <motion.button
          onClick={toggleUiMode}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-colors cursor-pointer titlebar-no-drag ${
            uiMode === 'advanced' ? 'bg-aurora-purple/20 text-aurora-purple' : 'text-text-tertiary hover:text-text-secondary hover:bg-glass-hover'
          }`}
          title={`${uiMode === 'simple' ? 'Расширенный' : 'Простой'} режим (Ctrl+Shift+M)`}
        >
          ⚡
        </motion.button>
        <CostCounter />
        {bottomItems.map((item) => (
          <SidebarButton
            key={item.id}
            item={item}
            isActive={currentPage === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function SidebarButton({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={`
        relative w-11 h-11 rounded-xl flex items-center justify-center
        text-lg transition-colors cursor-pointer titlebar-no-drag
        ${isActive ? 'bg-glass-active text-text-primary' : 'text-text-tertiary hover:text-text-secondary hover:bg-glass-hover'}
      `}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
    >
      <span>{item.icon}</span>
      {isActive && (
        <motion.div
          layoutId="sidebar-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-aurora-blue rounded-r"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
    </motion.button>
  );
}
