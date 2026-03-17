import { create } from 'zustand';
import type { DBPreset } from '@/shared/types/database';

interface PresetsState {
  presets: DBPreset[];
  isLoading: boolean;
  setPresets: (presets: DBPreset[]) => void;
  setLoading: (loading: boolean) => void;
  addPreset: (preset: DBPreset) => void;
  removePreset: (id: number) => void;
}

export const usePresetsStore = create<PresetsState>((set) => ({
  presets: [],
  isLoading: false,
  setPresets: (presets) => set({ presets }),
  setLoading: (isLoading) => set({ isLoading }),
  addPreset: (preset) => set((s) => ({ presets: [...s.presets, preset] })),
  removePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
}));
