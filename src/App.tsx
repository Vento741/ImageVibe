import { useState, useEffect } from 'react';
import { Minus, Square, X } from 'lucide-react';
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
import { LogsPage } from './modules/logs/components/LogsPage';
import { ConvertPage } from './modules/convert/components/ConvertPage';
import { ToastContainer } from './shared/components/ui/Toast';
import { useToastStore } from './shared/stores/toastStore';
import { Onboarding } from './shared/components/ui/Onboarding';
import { SplashScreen } from './shared/components/ui/SplashScreen';
import { useGenerateStore } from './modules/generate/store';
import { useCostStore } from './modules/cost/store';
import { ipc } from './shared/lib/ipc';
import { useCallback } from 'react';

export type Page = 'generate' | 'gallery' | 'collections' | 'convert' | 'analytics' | 'settings' | 'logs';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('generate');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const handleSplashReady = useCallback(() => setAppReady(true), []);
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  useKeyboardShortcuts({ onNavigate: setCurrentPage });

  // Ctrl+K for command palette
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

  // Global queue listeners — always active regardless of current page
  useEffect(() => {
    const unsubComplete = ipc.on('queue:item-completed', (data) => {
      const store = useGenerateStore.getState();
      store.updateCanvasCard(data.clientId, {
        status: 'completed',
        result: data.result,
        queueItemId: data.queueItemId,
      });
      store.setCurrentResult(data.result);
      if (data.result.costUsd > 0) {
        useCostStore.getState().addSessionCost(data.result.costUsd);
      }
    });

    const unsubFailed = ipc.on('queue:item-failed', (data) => {
      useGenerateStore.getState().updateCanvasCard(data.clientId, {
        status: 'failed',
        error: data.error,
        queueItemId: data.queueItemId,
      });
    });

    return () => {
      unsubComplete();
      unsubFailed();
    };
  }, []);

  // Health check: mark stuck generating cards as failed (fallback safety net)
  useEffect(() => {
    const STUCK_THRESHOLD_MS = 150_000; // 150 seconds
    const CHECK_INTERVAL_MS = 30_000; // check every 30 seconds

    const interval = setInterval(() => {
      const store = useGenerateStore.getState();
      const now = Date.now();
      const stuckCards = store.canvasCards.filter(
        (c) => c.status === 'generating' && now - c.startedAt > STUCK_THRESHOLD_MS,
      );

      for (const card of stuckCards) {
        if (card.queueItemId) {
          ipc.invoke('queue:cancel', card.queueItemId).catch(() => {});
        }
        store.updateCanvasCard(card.id, {
          status: 'failed',
          error: 'Генерация не завершилась вовремя. Попробуйте ещё раз.',
        });
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden rounded-xl bg-bg-primary">
      {/* Titlebar drag region + window controls */}
      <div className="titlebar-drag h-9 w-full shrink-0 relative z-20 flex items-center justify-end">
        <div className="flex titlebar-no-drag">
          <button
            onClick={() => window.electronAPI.windowMinimize()}
            className="w-11 h-9 flex items-center justify-center text-text-tertiary hover:bg-white/10 hover:text-text-primary transition-colors cursor-pointer"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => window.electronAPI.windowMaximize()}
            className="w-11 h-9 flex items-center justify-center text-text-tertiary hover:bg-white/10 hover:text-text-primary transition-colors cursor-pointer"
          >
            <Square size={11} />
          </button>
          <button
            onClick={() => window.electronAPI.windowClose()}
            className="w-11 h-9 flex items-center justify-center text-text-tertiary hover:bg-red-500/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <AuroraBackground />
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="flex-1 relative z-10 overflow-hidden">
          <div className="h-full p-4">
            {currentPage === 'generate' && <GeneratePage />}
            {currentPage === 'gallery' && <GalleryPage />}
            {currentPage === 'collections' && <CollectionsPage />}
            {currentPage === 'convert' && <ConvertPage />}
            {currentPage === 'analytics' && <AnalyticsPage />}
            {currentPage === 'settings' && <SettingsPage />}
            {currentPage === 'logs' && <LogsPage />}
          </div>
        </main>
      </div>
      <ImageViewer />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(page) => { setCurrentPage(page); setIsCommandPaletteOpen(false); }}
      />
      <ShortcutsHelp />
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      {appReady && <Onboarding />}
      <SplashScreen onReady={handleSplashReady} />
    </div>
  );
}
