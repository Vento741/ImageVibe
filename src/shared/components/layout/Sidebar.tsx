import { motion } from 'framer-motion';
import { Paintbrush, Image, FolderOpen, BarChart3, Settings } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Page } from '../../../App';
import { CostCounter } from '@/modules/cost/components/CostCounter';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

interface NavItem {
  id: Page;
  icon: ComponentType<{ size?: number }>;
  label: string;
  shortcut?: string;
}

const navItems: NavItem[] = [
  { id: 'generate', icon: Paintbrush, label: 'Генерация', shortcut: 'Ctrl+G' },
  { id: 'gallery', icon: Image, label: 'Галерея', shortcut: 'Ctrl+L' },
  { id: 'collections', icon: FolderOpen, label: 'Коллекции' },
  { id: 'analytics', icon: BarChart3, label: 'Аналитика' },
];

const bottomItems: NavItem[] = [
  { id: 'settings', icon: Settings, label: 'Настройки', shortcut: 'Ctrl+,' },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-16 h-full flex flex-col items-center py-3 gap-1 bg-bg-secondary/50 border-r border-glass-border relative z-10">
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
      <item.icon size={20} />
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
