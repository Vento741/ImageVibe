import { Star } from 'lucide-react';
import { useGalleryStore } from '../store';

const SORT_OPTIONS = [
  { value: 'created_at', label: 'По дате' },
  { value: 'cost_usd', label: 'По стоимости' },
  { value: 'file_size', label: 'По размеру' },
] as const;

const MODEL_FILTERS = [
  { value: '', label: 'Все модели' },
  { value: 'black-forest-labs/flux.2-pro', label: 'FLUX.2 Pro' },
  { value: 'black-forest-labs/flux.2-max', label: 'FLUX.2 Max' },
  { value: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein' },
  { value: 'black-forest-labs/flux.2-flex', label: 'FLUX.2 Flex' },
  { value: 'bytedance-seed/seedream-4.5', label: 'Seedream 4.5' },
  { value: 'google/gemini-3-pro-image-preview', label: 'Gemini 3 Pro' },
  { value: 'google/gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash' },
  { value: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash' },
  { value: 'openai/gpt-5-image', label: 'GPT-5 Image' },
  { value: 'openai/gpt-5-image-mini', label: 'GPT-5 Mini' },
  { value: 'sourceful/riverflow-v2-pro', label: 'Riverflow Pro' },
  { value: 'sourceful/riverflow-v2-fast', label: 'Riverflow Fast' },
  { value: 'sourceful/riverflow-v2-max-preview', label: 'Riverflow Max' },
];

export function GalleryFilters() {
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
        {MODEL_FILTERS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
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
