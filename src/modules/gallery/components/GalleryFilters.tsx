import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { useGalleryStore } from '../store';
import { ipc } from '@/shared/lib/ipc';

const SORT_OPTIONS = [
  { value: 'created_at', label: 'По дате' },
  { value: 'cost_usd', label: 'По стоимости' },
  { value: 'file_size', label: 'По размеру' },
] as const;

export function GalleryFilters() {
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const load = () => {
      ipc.invoke('catalog:list')
        .then((groups) => setModels(groups.flatMap((g) => g.models).map((m) => ({ id: m.id, name: m.name }))))
        .catch(() => {});
    };
    load();
    return ipc.on('catalog:updated', load);
  }, []);

  const sortBy = useGalleryStore((s) => s.sortBy);
  const sortDir = useGalleryStore((s) => s.sortDir);
  const filterModel = useGalleryStore((s) => s.filterModel);
  const filterFavorites = useGalleryStore((s) => s.filterFavorites);
  const setSortBy = useGalleryStore((s) => s.setSortBy);
  const setSortDir = useGalleryStore((s) => s.setSortDir);
  const setFilterModel = useGalleryStore((s) => s.setFilterModel);
  const setFilterFavorites = useGalleryStore((s) => s.setFilterFavorites);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Sort */}
      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        className="bg-bg-tertiary text-text-secondary text-xs rounded-lg px-2 py-1.5 outline-none border border-glass-border cursor-pointer"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Sort direction */}
      <button
        onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
        className="px-2 py-1.5 rounded-lg bg-bg-tertiary text-text-secondary text-xs border border-glass-border cursor-pointer hover:bg-glass-hover"
        title={sortDir === 'desc' ? 'Сначала новые' : 'Сначала старые'}
      >
        {sortDir === 'desc' ? '↓' : '↑'}
      </button>

      {/* Model filter */}
      <select
        value={filterModel ?? ''}
        onChange={(e) => setFilterModel(e.target.value || null)}
        className="bg-bg-tertiary text-text-secondary text-xs rounded-lg px-2 py-1.5 outline-none border border-glass-border cursor-pointer"
      >
        <option value="">Все модели</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>

      {/* Favorites toggle */}
      <button
        onClick={() => setFilterFavorites(!filterFavorites)}
        className={`px-2 py-1.5 rounded-lg text-xs border cursor-pointer transition-colors ${
          filterFavorites
            ? 'bg-aurora-blue/20 text-aurora-blue border-aurora-blue/30'
            : 'bg-bg-tertiary text-text-secondary border-glass-border hover:bg-glass-hover'
        }`}
      >
        <Star size={14} className="inline -mt-0.5" /> Избранное
      </button>
    </div>
  );
}
