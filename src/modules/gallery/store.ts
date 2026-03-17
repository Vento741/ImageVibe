import { create } from 'zustand';
import type { DBImage } from '@/shared/types/database';

interface GalleryState {
  images: DBImage[];
  total: number;
  isLoading: boolean;
  selectedImageId: number | null;
  searchQuery: string;
  page: number;
  pageSize: number;
  sortBy: 'created_at' | 'cost_usd' | 'file_size';
  sortDir: 'asc' | 'desc';
  filterModel: string | null;
  filterFavorites: boolean;

  // Actions
  setImages: (images: DBImage[], total: number) => void;
  appendImages: (images: DBImage[]) => void;
  setLoading: (loading: boolean) => void;
  setSelectedImageId: (id: number | null) => void;
  setSearchQuery: (query: string) => void;
  setPage: (page: number) => void;
  setSortBy: (sortBy: GalleryState['sortBy']) => void;
  setSortDir: (sortDir: GalleryState['sortDir']) => void;
  setFilterModel: (model: string | null) => void;
  setFilterFavorites: (val: boolean) => void;
  removeImage: (id: number) => void;
  toggleFavorite: (id: number) => void;
}

export const useGalleryStore = create<GalleryState>((set) => ({
  images: [],
  total: 0,
  isLoading: false,
  selectedImageId: null,
  searchQuery: '',
  page: 0,
  pageSize: 30,
  sortBy: 'created_at',
  sortDir: 'desc',
  filterModel: null,
  filterFavorites: false,

  setImages: (images, total) => set({ images, total }),
  appendImages: (newImages) => set((s) => ({ images: [...s.images, ...newImages] })),
  setLoading: (isLoading) => set({ isLoading }),
  setSelectedImageId: (selectedImageId) => set({ selectedImageId }),
  setSearchQuery: (searchQuery) => set({ searchQuery, page: 0 }),
  setPage: (page) => set({ page }),
  setSortBy: (sortBy) => set({ sortBy, page: 0 }),
  setSortDir: (sortDir) => set({ sortDir, page: 0 }),
  setFilterModel: (filterModel) => set({ filterModel, page: 0 }),
  setFilterFavorites: (filterFavorites) => set({ filterFavorites, page: 0 }),

  removeImage: (id) =>
    set((s) => ({
      images: s.images.filter((img) => img.id !== id),
      total: s.total - 1,
      selectedImageId: s.selectedImageId === id ? null : s.selectedImageId,
    })),

  toggleFavorite: (id) =>
    set((s) => ({
      images: s.images.map((img) =>
        img.id === id ? { ...img, is_favorite: img.is_favorite ? 0 : 1 } : img
      ),
    })),
}));
