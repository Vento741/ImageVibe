import { create } from 'zustand';
import type { CreditBalance, BudgetStatus, SpendingSummary } from '@/shared/types/ipc';

interface CostState {
  // Real-time
  sessionCost: number;
  sessionGenerations: number;
  balance: CreditBalance | null;

  // Cached summaries
  summary: SpendingSummary | null;
  budgetStatus: BudgetStatus | null;
  /**
   * Ожидаемая стоимость по медиане собственной истории; null — истории нет.
   * Предварительной цены у kie.ai не существует, поэтому это не цена поставщика.
   */
  currentEstimate: number | null;

  // Actions
  addSessionCost: (cost: number) => void;
  setBalance: (balance: CreditBalance) => void;
  setSummary: (summary: SpendingSummary) => void;
  setBudgetStatus: (status: BudgetStatus) => void;
  setCurrentEstimate: (estimate: number | null) => void;
  resetSession: () => void;
}

export const useCostStore = create<CostState>((set) => ({
  sessionCost: 0,
  sessionGenerations: 0,
  balance: null,
  summary: null,
  budgetStatus: null,
  currentEstimate: null,

  addSessionCost: (cost) =>
    set((s) => ({
      sessionCost: s.sessionCost + cost,
      sessionGenerations: s.sessionGenerations + 1,
    })),

  setBalance: (balance) => set({ balance }),
  setSummary: (summary) => set({ summary }),
  setBudgetStatus: (budgetStatus) => set({ budgetStatus }),
  setCurrentEstimate: (currentEstimate) => set({ currentEstimate }),
  resetSession: () => set({ sessionCost: 0, sessionGenerations: 0 }),
}));
