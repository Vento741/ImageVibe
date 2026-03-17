import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ipc } from '@/shared/lib/ipc';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import type { DBCollection, DBImage } from '@/shared/types/database';

export function CollectionsPage() {
  const [collections, setCollections] = useState<DBCollection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collectionImages, setCollectionImages] = useState<DBImage[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Load collections
  useEffect(() => {
    ipc.invoke('collections:list').then(setCollections).catch(() => {});
  }, []);

  // Load collection images when selected
  useEffect(() => {
    if (selectedId) {
      ipc.invoke('collections:images', selectedId).then(setCollectionImages).catch(() => {});
    } else {
      setCollectionImages([]);
    }
  }, [selectedId]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const collection = await ipc.invoke('collections:create', newName.trim());
    setCollections((prev) => [...prev, collection]);
    setNewName('');
    setIsCreating(false);
  }, [newName]);

  const handleDelete = useCallback(async (id: number) => {
    await ipc.invoke('collections:delete', id);
    setCollections((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const handleRemoveImage = useCallback(async (imageId: number) => {
    if (!selectedId) return;
    await ipc.invoke('collections:remove-image', selectedId, imageId);
    setCollectionImages((prev) => prev.filter((img) => img.id !== imageId));
  }, [selectedId]);

  return (
    <div className="flex h-full gap-4">
      {/* Collections list */}
      <div className="w-64 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary">Коллекции</h2>
          <button
            onClick={() => setIsCreating(true)}
            className="text-xs text-aurora-blue hover:text-aurora-purple cursor-pointer"
          >
            + Создать
          </button>
        </div>

        {/* Create form */}
        <AnimatePresence>
          {isCreating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <GlassPanel padding="sm" className="flex gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Название..."
                  className="flex-1 bg-transparent text-text-primary text-sm outline-none"
                />
                <button onClick={handleCreate} className="text-xs text-aurora-blue cursor-pointer">✓</button>
                <button onClick={() => setIsCreating(false)} className="text-xs text-text-tertiary cursor-pointer">✕</button>
              </GlassPanel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collections */}
        <div className="flex flex-col gap-1 overflow-y-auto">
          {collections.map((col) => (
            <motion.div
              key={col.id}
              onClick={() => setSelectedId(col.id)}
              whileHover={{ x: 2 }}
              role="button"
              tabIndex={0}
              className={`group w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer flex items-center justify-between ${
                selectedId === col.id
                  ? 'bg-aurora-blue/10 text-aurora-blue'
                  : 'text-text-secondary hover:bg-glass-hover'
              }`}
            >
              <span className="truncate">📁 {col.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(col.id); }}
                className="text-text-tertiary hover:text-status-error text-xs opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          ))}

          {collections.length === 0 && !isCreating && (
            <div className="text-xs text-text-tertiary text-center py-4">
              Нет коллекций
            </div>
          )}
        </div>
      </div>

      {/* Collection images */}
      <div className="flex-1 overflow-y-auto">
        {selectedId ? (
          collectionImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {collectionImages.map((image) => (
                <motion.div
                  key={image.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="relative group rounded-lg overflow-hidden"
                >
                  <img
                    src={`file://${image.file_path}`}
                    alt={image.prompt}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <button
                    onClick={() => handleRemoveImage(image.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    ✕
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
              <span className="text-3xl">📂</span>
              <span className="text-sm">Коллекция пуста</span>
              <span className="text-xs">Перетащите изображения из галереи</span>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
            <span className="text-3xl">📁</span>
            <span className="text-sm">Выберите коллекцию</span>
          </div>
        )}
      </div>
    </div>
  );
}
