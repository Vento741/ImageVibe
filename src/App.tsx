import { useState, useEffect } from 'react';
import { AuroraBackground } from './shared/components/ui/AuroraBackground';
import { Sidebar } from './shared/components/layout/Sidebar';
import { GeneratePage } from './modules/generate/components/GeneratePage';
import { GalleryPage } from './modules/gallery/components/GalleryPage';
import { CollectionsPage } from './modules/collections/components/CollectionsPage';
import { CommandPalette } from './modules/command-palette/components/CommandPalette';
import { useKeyboardShortcuts } from './shared/hooks/useKeyboardShortcuts';
import { ShortcutsHelp } from './shared/components/ui/ShortcutsHelp';
import { ImageViewer } from './modules/gallery/components/ImageViewer';
import { AnalyticsPage } from './modules/analytics/components/AnalyticsPage';
import { SettingsPage } from './modules/settings/components/SettingsPage';
import { ToastContainer } from './shared/components/ui/Toast';
import { useToastStore } from './shared/stores/toastStore';
import { Onboarding } from './shared/components/ui/Onboarding';

export type Page = 'generate' | 'gallery' | 'collections' | 'analytics' | 'settings';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('generate');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  useKeyboardShortcuts({ onNavigate: setCurrentPage });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <AuroraBackground />
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 relative z-10 overflow-hidden">
        <div className="h-full p-4">
          {currentPage === 'generate' && <GeneratePage />}
          {currentPage === 'gallery' && <GalleryPage />}
          {currentPage === 'collections' && <CollectionsPage />}
          {currentPage === 'analytics' && <AnalyticsPage />}
          {currentPage === 'settings' && <SettingsPage />}
        </div>
      </main>
      <ImageViewer />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(page) => { setCurrentPage(page); setIsCommandPaletteOpen(false); }}
      />
      <ShortcutsHelp />
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      <Onboarding />
    </div>
  );
}
