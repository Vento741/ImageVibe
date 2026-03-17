import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderPlus, Folder } from 'lucide-react';
import { ipc } from '@/shared/lib/ipc';
import { useToastStore } from '@/shared/stores/toastStore';

interface Collection {
  id: number;
  name: string;
  description: string | null;
}

interface AddToCollectionMenuProps {
  imageId: number;
  /** Compact mode: small icon button (for gallery grid) */
  compact?: boolean;
}

export function AddToCollectionMenu({ imageId, compact }: AddToCollectionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newName, setNewName] = useState('');
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (!isOpen) return;
    ipc.invoke('collections:list').then((list) => {
      setCollections(list ?? []);
    });
  }, [isOpen]);

  const handleAdd = async (collectionId: number) => {
    try {
      await ipc.invoke('collections:add-image', collectionId, imageId);
      addToast({ message: 'Добавлено в коллекцию', type: 'success' });
      setIsOpen(false);
    } catch {
      addToast({ message: 'Ошибка добавления', type: 'error' });
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const col = await ipc.invoke('collections:create', newName.trim());
      if (col) {
        await ipc.invoke('collections:add-image', col.id, imageId);
        addToast({ message: `Создана коллекция «${newName.trim()}»`, type: 'success' });
      }
      setNewName('');
      setIsOpen(false);
    } catch {
      addToast({ message: 'Ошибка создания', type: 'error' });
    }
  };

  return (
    <div className="relative">
      {compact ? (
        <button
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-sm cursor-pointer hover:bg-black/70"
          title="В коллекцию"
        >
          <FolderPlus size={14} />
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm cursor-pointer"
          title="В коллекцию"
        >
          <FolderPlus size={16} className="inline -mt-0.5" /> В коллекцию
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[98]" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute top-full mt-1 right-0 z-[100] w-56 glass-panel p-2 flex flex-col gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Коллекции</div>

              {collections.length === 0 ? (
                <div className="text-xs text-text-tertiary py-1">Нет коллекций</div>
              ) : (
                collections.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => handleAdd(col.id)}
                    className="text-left px-2 py-1.5 rounded-md hover:bg-glass-hover transition-colors cursor-pointer text-xs text-text-primary"
                  >
                    <Folder size={14} className="inline -mt-0.5 shrink-0" /> {col.name}
                  </button>
                ))
              )}

              <div className="border-t border-glass-border mt-1 pt-1 flex gap-1">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Новая коллекция..."
                  className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-tertiary outline-none px-1"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="text-xs text-aurora-blue hover:text-aurora-purple cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed px-1"
                >
                  +
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
