import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  Coins,
  Paintbrush,
  BarChart3,
  CreditCard,
  Palette,
  Sparkles,
  Globe,
} from 'lucide-react';
import { ipc } from '@/shared/lib/ipc';
import { formatCostDisplay, getModelShortName } from '@/shared/lib/utils';
import { GlassPanel } from '@/shared/components/ui/GlassPanel';
import type { SpendingSummary, CreditBalance, BudgetStatus } from '@/shared/types/ipc';

const TYPE_LABELS: Record<string, { icon: ReactNode; text: string }> = {
  image: { icon: <Palette size={14} className="inline-block mr-1 align-text-bottom" />, text: 'Генерация' },
  prompt_ai: { icon: <Sparkles size={14} className="inline-block mr-1 align-text-bottom" />, text: 'Промпт-AI' },
  translate: { icon: <Globe size={14} className="inline-block mr-1 align-text-bottom" />, text: 'Перевод' },
};

export function AnalyticsPage() {
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      ipc.invoke('cost:get-summary').catch(() => null),
      ipc.invoke('cost:get-balance').catch(() => null),
      ipc.invoke('cost:check-budget').catch(() => null),
    ]).then(([s, b, bg]) => {
      setSummary(s);
      setBalance(b);
      setBudget(bg);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-aurora-blue/30 border-t-aurora-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      <h2 className="text-lg font-medium text-text-primary">Аналитика</h2>

      {/* Overview cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Сегодня"
          value={formatCostDisplay(summary?.today ?? 0)}
          icon={<Calendar size={16} />}
          delay={0}
        />
        <StatCard
          label="Эта неделя"
          value={formatCostDisplay(summary?.thisWeek ?? 0)}
          icon={<CalendarDays size={16} />}
          delay={0.05}
        />
        <StatCard
          label="Этот месяц"
          value={formatCostDisplay(summary?.thisMonth ?? 0)}
          icon={<CalendarRange size={16} />}
          delay={0.1}
        />
        <StatCard
          label="Всё время"
          value={formatCostDisplay(summary?.allTime ?? 0)}
          icon={<Coins size={16} />}
          delay={0.15}
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Генераций"
          value={String(summary?.generationCount ?? 0)}
          icon={<Paintbrush size={16} />}
          delay={0.2}
        />
        <StatCard
          label="Средняя стоимость"
          value={formatCostDisplay(summary?.averageCost ?? 0)}
          icon={<BarChart3 size={16} />}
          delay={0.25}
        />
        <StatCard
          label="Баланс"
          value={balance ? formatCostDisplay(balance.balance) : '—'}
          icon={<CreditCard size={16} />}
          delay={0.3}
        />
      </div>

      {/* Cost by model */}
      {summary && summary.costByModel.length > 0 && (
        <GlassPanel>
          <h3 className="text-sm font-medium text-text-primary mb-3">По моделям</h3>
          <div className="flex flex-col gap-2">
            {(() => {
              const maxCost = summary.costByModel[0]?.cost ?? 1;
              return summary.costByModel.map((model, idx) => {
              const percent = maxCost > 0 ? (model.cost / maxCost) * 100 : 0;
              return (
                <motion.div
                  key={model.modelId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <span className="text-xs text-text-secondary w-32 truncate">
                    {getModelShortName(model.modelId)}
                  </span>
                  <div className="flex-1 h-5 bg-glass rounded-md overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.5, delay: idx * 0.05 }}
                      className="h-full bg-gradient-to-r from-aurora-blue to-aurora-purple rounded-md"
                    />
                  </div>
                  <span className="text-xs text-text-tertiary w-16 text-right">
                    {formatCostDisplay(model.cost)}
                  </span>
                  <span className="text-[10px] text-text-tertiary w-12 text-right">
                    {model.count} шт
                  </span>
                </motion.div>
              );
            });
            })()}
          </div>
        </GlassPanel>
      )}

      {/* Cost by type */}
      {summary && summary.costByType.length > 0 && (
        <GlassPanel>
          <h3 className="text-sm font-medium text-text-primary mb-3">По типу</h3>
          <div className="flex gap-4">
            {summary.costByType.map((type) => (
                <div key={type.type} className="flex flex-col items-center gap-1">
                  <span className="text-xs text-text-secondary">
                    {TYPE_LABELS[type.type] ? (
                      <>{TYPE_LABELS[type.type].icon}{TYPE_LABELS[type.type].text}</>
                    ) : type.type}
                  </span>
                  <span className="text-sm font-medium text-text-primary">
                    {formatCostDisplay(type.cost)}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {type.count} запросов
                  </span>
                </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Budget status */}
      {budget && (budget.dailyLimit || budget.weeklyLimit || budget.monthlyLimit) && (
        <GlassPanel>
          <h3 className="text-sm font-medium text-text-primary mb-3">Бюджет</h3>
          <div className="flex flex-col gap-2">
            {budget.dailyLimit && (
              <BudgetRow
                label="Дневной"
                used={budget.dailyUsed}
                limit={budget.dailyLimit}
              />
            )}
            {budget.weeklyLimit && (
              <BudgetRow
                label="Недельный"
                used={budget.weeklyUsed}
                limit={budget.weeklyLimit}
              />
            )}
            {budget.monthlyLimit && (
              <BudgetRow
                label="Месячный"
                used={budget.monthlyUsed}
                limit={budget.monthlyLimit}
              />
            )}
          </div>
        </GlassPanel>
      )}

      {/* Empty state */}
      {summary && summary.generationCount === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 text-text-tertiary gap-2">
          <BarChart3 size={40} className="text-text-tertiary" />
          <span className="text-sm">Пока нет данных</span>
          <span className="text-xs">Статистика появится после первой генерации</span>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  delay,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <GlassPanel padding="sm" className="flex flex-col items-center gap-1">
        <span className="text-text-secondary">{icon}</span>
        <span className="text-sm font-medium text-text-primary selectable">{value}</span>
        <span className="text-[10px] text-text-tertiary">{label}</span>
      </GlassPanel>
    </motion.div>
  );
}

function BudgetRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const percent = Math.min((used / limit) * 100, 100);
  const color =
    percent > 90 ? 'bg-cost-high' :
    percent > 60 ? 'bg-cost-medium' :
    'bg-cost-low';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-secondary w-20">{label}</span>
      <div className="flex-1 budget-bar">
        <div className={`budget-bar-fill ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-text-tertiary w-28 text-right">
        {formatCostDisplay(used)} / {formatCostDisplay(limit)}
      </span>
    </div>
  );
}
