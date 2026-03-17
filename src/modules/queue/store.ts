import { create } from 'zustand';
import type { DBQueueItem } from '@/shared/types/database';

interface QueueState {
  items: DBQueueItem[];
  isExpanded: boolean;
  setItems: (items: DBQueueItem[]) => void;
  addItem: (item: DBQueueItem) => void;
  updateItem: (id: number, updates: Partial<DBQueueItem>) => void;
  removeItem: (id: number) => void;
  clearCompleted: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
}

export const useQueueStore = create<QueueState>((set) => ({
  items: [],
  isExpanded: false,

  setItems: (items) => set({ items }),

  addItem: (item) => set((s) => ({ items: [...s.items, item] })),

  updateItem: (id, updates) =>
    set((s) => ({
      items: s.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    })),

  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((item) => item.id !== id) })),

  clearCompleted: () =>
    set((s) => ({
      items: s.items.filter((item) => item.status !== 'completed' && item.status !== 'failed'),
    })),

  setExpanded: (isExpanded) => set({ isExpanded }),
  toggleExpanded: () => set((s) => ({ isExpanded: !s.isExpanded })),
}));
