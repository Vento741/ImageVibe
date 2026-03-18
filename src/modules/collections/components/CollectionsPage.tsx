import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, FolderOpen } from 'lucide-react';
import { ipc } from '@/shared/lib/ipc';
import { localFileUrl, getModelShortName, formatCostDisplay } from '@/shared/lib/utils';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import { useGalleryStore } from '@/modules/gallery/store';
import { ImageViewer } from '@/modules/gallery/components/ImageViewer';
import type { DBCollection, DBImage } from '@/shared/types/database';

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}мс`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}с`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  return `${min}м ${remainSec.toFixed(0)}с`;
}

export function CollectionsPage() {
  const [collections, setCollections] = useState<DBCollection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collectionImages, setCollectionImages] = useState<DBImage[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const setGalleryImages = useGalleryStore((s) => s.setImages);
  const setSelectedImageId = useGalleryStore((s) => s.setSelectedImageId);
  const selectedImageId = useGalleryStore((s) => s.selectedImageId);

  // Load collections
  useEffect(() => {
    ipc.invoke('collections:list').then(setCollections).catch(() => {});
  }, []);

  // Load collection images when selected
  useEffect(() => {
    if (selectedId) {
      ipc.invoke('collections:images', selectedId).then((imgs) => {
        setCollectionImages(imgs);
      }).catch(() => {});
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

  const handleOpenImage = useCallback((image: DBImage) => {
    // Load collection images into gallery store so ImageViewer can navigate them
    setGalleryImages(collectionImages, collectionImages.length);
    setSelectedImageId(image.id);
  }, [collectionImages, setGalleryImages, setSelectedImageId]);

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
              role="button"
              tabIndex={0}
              className={`group w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer flex items-center justify-between ${
                selectedId === col.id
                  ? 'bg-aurora-blue/10 text-aurora-blue'
                  : 'text-text-secondary hover:bg-glass-hover'
              }`}
            >
              <span className="truncate flex items-center gap-1.5"><Folder size={14} /> {col.name}</span>
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
                  className="relative group rounded-lg overflow-hidden cursor-pointer"
                  onClick={() => handleOpenImage(image)}
                >
                  <img
                    src={localFileUrl(image.file_path)}
                    alt={image.prompt}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute top-1 right-1 flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); ipc.invoke('file:open-folder', image.file_path.replace(/[/\\][^/\\]+$/, '')); }}
                        className="w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center cursor-pointer hover:bg-black/70"
                        title="Открыть папку"
                      >
                        <FolderOpen size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveImage(image.id); }}
                        className="w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center cursor-pointer hover:bg-status-error/50"
                        title="Убрать из коллекции"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <p className="text-[10px] text-white/80 line-clamp-1">{image.prompt}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[9px] text-white/50">
                        <span>{getModelShortName(image.model_id)}</span>
                        {image.generation_time_ms && <span>{formatTime(image.generation_time_ms)}</span>}
                        {image.cost_usd ? <span>{formatCostDisplay(image.cost_usd)}</span> : null}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
              <FolderOpen size={32} className="text-text-tertiary" />
              <span className="text-sm">Коллекция пуста</span>
              <span className="text-xs">Добавьте изображения из галереи</span>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
            <Folder size={32} className="text-text-tertiary" />
            <span className="text-sm">Выберите коллекцию</span>
          </div>
        )}
      </div>

      {/* Reuse ImageViewer — zoom, pan, context menu all included */}
      {selectedImageId && <ImageViewer />}
    </div>
  );
}
