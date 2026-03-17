import { useState } from 'react';
import { AuroraBackground } from './shared/components/ui/AuroraBackground';
import { Sidebar } from './shared/components/layout/Sidebar';

export type Page = 'generate' | 'gallery' | 'collections' | 'analytics' | 'settings';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('generate');

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <AuroraBackground />
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 relative z-10 overflow-hidden">
        <div className="h-full p-4">
          {currentPage === 'generate' && (
            <div className="text-text-secondary flex items-center justify-center h-full">
              Генерация — скоро будет
            </div>
          )}
          {currentPage === 'gallery' && (
            <div className="text-text-secondary flex items-center justify-center h-full">
              Галерея — скоро будет
            </div>
          )}
          {currentPage === 'collections' && (
            <div className="text-text-secondary flex items-center justify-center h-full">
              Коллекции — скоро будет
            </div>
          )}
          {currentPage === 'analytics' && (
            <div className="text-text-secondary flex items-center justify-center h-full">
              Аналитика — скоро будет
            </div>
          )}
          {currentPage === 'settings' && (
            <div className="text-text-secondary flex items-center justify-center h-full">
              Настройки — скоро будет
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
