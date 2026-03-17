import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useCostStore } from '../store';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay } from '@/shared/lib/utils';

export function CostCounter() {
  const sessionCost = useCostStore((s) => s.sessionCost);
  const summary = useCostStore((s) => s.summary);
  const balance = useCostStore((s) => s.balance);
  const budgetStatus = useCostStore((s) => s.budgetStatus);
  const setSummary = useCostStore((s) => s.setSummary);
  const setBalance = useCostStore((s) => s.setBalance);
  const setBudgetStatus = useCostStore((s) => s.setBudgetStatus);

  // Fetch initial data
  useEffect(() => {
    ipc.invoke('cost:get-summary').then(setSummary).catch(() => {});
    ipc.invoke('cost:get-balance').then(setBalance).catch(() => {});
    ipc.invoke('cost:check-budget').then(setBudgetStatus).catch(() => {});
  }, [setSummary, setBalance, setBudgetStatus]);

  // Refresh balance periodically
  useEffect(() => {
    const interval = setInterval(() => {
      ipc.invoke('cost:get-balance').then(setBalance).catch(() => {});
      ipc.invoke('cost:get-summary').then(setSummary).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [setBalance, setSummary]);

  // Listen for cost updates
  useEffect(() => {
    return ipc.on('cost:updated', () => {
      ipc.invoke('cost:get-summary').then(setSummary).catch(() => {});
      ipc.invoke('cost:check-budget').then(setBudgetStatus).catch(() => {});
    });
  }, [setSummary, setBudgetStatus]);

  const todaySpent = summary?.today ?? sessionCost;
  const dailyLimit = budgetStatus?.dailyLimit;
  const budgetPercent = dailyLimit ? Math.min((todaySpent / dailyLimit) * 100, 100) : 0;

  const barColor =
    budgetPercent > 90 ? 'bg-cost-high' :
    budgetPercent > 60 ? 'bg-cost-medium' :
    'bg-cost-low';

  return (
    <motion.div
      className="w-full px-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="glass-panel px-2 py-2 flex flex-col gap-1 text-center">
        {/* Расходы за сегодня */}
        <div className="text-xs font-medium text-text-primary">
          {formatCostDisplay(todaySpent)}
        </div>

        {/* Полоса бюджета */}
        {dailyLimit && (
          <div className="budget-bar">
            <div
              className={`budget-bar-fill ${barColor}`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
        )}

        {/* Баланс */}
        {balance && (
          <div className="text-[10px] text-text-tertiary">
            {formatCostDisplay(balance.balance)}
          </div>
        )}
      </div>
    </motion.div>
  );
}
