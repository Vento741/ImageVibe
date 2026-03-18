import { useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { ImageIcon, Star, Trash2, FolderOpen, Grid2x2, Grid3x3, LayoutGrid } from 'lucide-react';
import { useGalleryStore } from '../store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay, getModelShortName, localFileUrl } from '@/shared/lib/utils';
import { GalleryFilters } from './GalleryFilters';
import { AddToCollectionMenu } from '@/modules/collections/components/AddToCollectionMenu';

export function GalleryPage() {
  const images = useGalleryStore((s) => s.images);
  const total = useGalleryStore((s) => s.total);
  const isLoading = useGalleryStore((s) => s.isLoading);
  const page = useGalleryStore((s) => s.page);
  const pageSize = useGalleryStore((s) => s.pageSize);
  const searchQuery = useGalleryStore((s) => s.searchQuery);
  const sortBy = useGalleryStore((s) => s.sortBy);
  const sortDir = useGalleryStore((s) => s.sortDir);
  const filterModel = useGalleryStore((s) => s.filterModel);
  const filterFavorites = useGalleryStore((s) => s.filterFavorites);
  const selectedImageId = useGalleryStore((s) => s.selectedImageId);
  const setImages = useGalleryStore((s) => s.setImages);
  const setLoading = useGalleryStore((s) => s.setLoading);
  const setSelectedImageId = useGalleryStore((s) => s.setSelectedImageId);
  const setSearchQuery = useGalleryStore((s) => s.setSearchQuery);
  const setPage = useGalleryStore((s) => s.setPage);
  const toggleFavorite = useGalleryStore((s) => s.toggleFavorite);
  const removeImage = useGalleryStore((s) => s.removeImage);
  const [gridCols, setGridCols] = useState(3);

  // Fetch images
  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ipc.invoke('gallery:list', {
        offset: page * pageSize,
        limit: pageSize,
        search: searchQuery || undefined,
        modelId: filterModel || undefined,
        isFavorite: filterFavorites || undefined,
        sortBy,
        sortDir,
      });
      setImages(result.images, result.total);
    } catch (err) {
      console.error('Failed to load gallery:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchQuery, sortBy, sortDir, filterModel, filterFavorites, setImages, setLoading]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleToggleFavorite = async (id: number) => {
    await ipc.invoke('gallery:toggle-favorite', id);
    toggleFavorite(id);
  };

  const handleDelete = async (id: number) => {
    await ipc.invoke('gallery:delete', id);
    removeImage(id);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-text-primary">Галерея</h2>
          <span className="text-xs text-text-tertiary">{total} изображений</span>
        </div>

        {/* Search + grid selector */}
        <div className="flex items-center gap-3">
          {/* Grid size */}
          <div className="flex items-center gap-0.5 glass-panel px-1 py-0.5">
            {([2, 3, 4, 5] as const).map((cols) => (
              <button
                key={cols}
                onClick={() => setGridCols(cols)}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  gridCols === cols
                    ? 'bg-aurora-blue/20 text-aurora-blue'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title={`${cols} в ряд`}
              >
                {cols === 2 && <Grid2x2 size={14} />}
                {cols === 3 && <Grid3x3 size={14} />}
                {cols === 4 && <LayoutGrid size={14} />}
                {cols === 5 && <span className="text-[10px] font-bold w-3.5 h-3.5 flex items-center justify-center">5</span>}
              </button>
            ))}
          </div>

          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск..."
            className="bg-bg-tertiary text-text-primary text-sm rounded-lg px-3 py-1.5 outline-none border border-glass-border focus:border-aurora-blue/50 w-48"
          />
        </div>
      </div>

      {/* Filters */}
      <GalleryFilters />

      {/* Image grid */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && images.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-aurora-blue/30 border-t-aurora-blue rounded-full animate-spin" />
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
            <ImageIcon size={40} className="text-text-tertiary" />
            <span className="text-sm">Пока нет изображений</span>
          </div>
        ) : (
          <div className="grid gap-3 auto-rows-auto" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
            {images.map((image, idx) => (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                onClick={() => setSelectedImageId(image.id)}
                className={`relative group rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${
                  selectedImageId === image.id
                    ? 'border-aurora-blue'
                    : 'border-transparent hover:border-glass-border'
                }`}
              >
                <img
                  src={localFileUrl(image.file_path)}
                  alt={image.prompt}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col justify-between p-2 opacity-0 group-hover:opacity-100">
                  {/* Top actions */}
                  <div className="flex justify-end gap-1">
                    <AddToCollectionMenu imageId={image.id} compact />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleFavorite(image.id); }}
                      className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-sm cursor-pointer hover:bg-black/70"
                      title="Избранное"
                    >
                      {image.is_favorite ? <Star size={14} fill="currentColor" /> : <Star size={14} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); ipc.invoke('file:open-folder', image.file_path.replace(/[/\\][^/\\]+$/, '')); }}
                      className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-sm cursor-pointer hover:bg-black/70"
                      title="Открыть папку"
                    >
                      <FolderOpen size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(image.id); }}
                      className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-sm cursor-pointer hover:bg-status-error/50"
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Bottom info */}
                  <div className="text-[10px] text-white/80">
                    <div className="truncate">{image.prompt.slice(0, 60)}</div>
                    <div className="flex justify-between mt-0.5">
                      <span>{getModelShortName(image.model_id)}</span>
                      {image.cost_usd ? (
                        <span>{formatCostDisplay(image.cost_usd)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 shrink-0 py-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-2 py-1 rounded text-xs text-text-secondary hover:bg-glass-hover disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            ← Назад
          </button>
          <span className="text-xs text-text-tertiary">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded text-xs text-text-secondary hover:bg-glass-hover disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            Далее →
          </button>
        </div>
      )}
    </div>
  );
}
