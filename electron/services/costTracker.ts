import { getDatabase } from './database';
import type { BudgetStatus, SpendingSummary, CostPeriod } from '../../src/shared/types/ipc';
import type { DBBudgetConfig } from '../../src/shared/types/database';

/** Record a generation cost */
export function recordCost(params: {
  imageId: number | null;
  generationId: string | null;
  modelId: string;
  costUsd: number;
  costType: 'image' | 'prompt_ai' | 'translate';
  tokensInput: number;
  tokensOutput: number;
  costSource: 'actual' | 'estimated';
}): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO generation_costs (image_id, generation_id, model_id, cost_usd, cost_type, tokens_input, tokens_output, cost_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.imageId,
    params.generationId,
    params.modelId,
    params.costUsd,
    params.costType,
    params.tokensInput,
    params.tokensOutput,
    params.costSource
  );
}

/** Get spending summary */
export function getSpendingSummary(_period?: CostPeriod): SpendingSummary {
  const db = getDatabase();

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthStart = `${today.slice(0, 7)}-01`;

  const todaySum = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM generation_costs WHERE created_at >= ?`
  ).get(today) as { total: number };

  const weekSum = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM generation_costs WHERE created_at >= ?`
  ).get(weekAgo) as { total: number };

  const monthSum = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM generation_costs WHERE created_at >= ?`
  ).get(monthStart) as { total: number };

  const allTimeSum = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total, COUNT(*) as count FROM generation_costs`
  ).get() as { total: number; count: number };

  const costByModel = db.prepare(`
    SELECT model_id as modelId, model_id as modelName,
           COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as count
    FROM generation_costs
    GROUP BY model_id
    ORDER BY cost DESC
  `).all() as Array<{ modelId: string; modelName: string; cost: number; count: number }>;

  const costByType = db.prepare(`
    SELECT cost_type as type, COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as count
    FROM generation_costs
    GROUP BY cost_type
  `).all() as Array<{ type: string; cost: number; count: number }>;

  return {
    today: todaySum.total,
    thisWeek: weekSum.total,
    thisMonth: monthSum.total,
    allTime: allTimeSum.total,
    generationCount: allTimeSum.count,
    averageCost: allTimeSum.count > 0 ? allTimeSum.total / allTimeSum.count : 0,
    costByModel,
    costByType,
  };
}

/** Check budget status */
export function checkBudget(): BudgetStatus {
  const db = getDatabase();

  const config = db.prepare('SELECT * FROM budget_config WHERE id = 1').get() as DBBudgetConfig | undefined;

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthStart = `${today.slice(0, 7)}-01`;

  const dailyUsed = (db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM generation_costs WHERE created_at >= ?`
  ).get(today) as { total: number }).total;

  const weeklyUsed = (db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM generation_costs WHERE created_at >= ?`
  ).get(weekAgo) as { total: number }).total;

  const monthlyUsed = (db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM generation_costs WHERE created_at >= ?`
  ).get(monthStart) as { total: number }).total;

  const warnings: string[] = [];
  let isOverBudget = false;
  const threshold = config?.warning_threshold ?? 0.8;

  if (config?.daily_limit) {
    if (dailyUsed >= config.daily_limit) {
      isOverBudget = true;
      warnings.push(`Дневной лимит превышен: $${dailyUsed.toFixed(2)} / $${config.daily_limit.toFixed(2)}`);
    } else if (dailyUsed >= config.daily_limit * threshold) {
      warnings.push(`Приближение к дневному лимиту: $${dailyUsed.toFixed(2)} / $${config.daily_limit.toFixed(2)}`);
    }
  }

  if (config?.weekly_limit) {
    if (weeklyUsed >= config.weekly_limit) {
      isOverBudget = true;
      warnings.push(`Недельный лимит превышен: $${weeklyUsed.toFixed(2)} / $${config.weekly_limit.toFixed(2)}`);
    } else if (weeklyUsed >= config.weekly_limit * threshold) {
      warnings.push(`Приближение к недельному лимиту: $${weeklyUsed.toFixed(2)} / $${config.weekly_limit.toFixed(2)}`);
    }
  }

  if (config?.monthly_limit) {
    if (monthlyUsed >= config.monthly_limit) {
      isOverBudget = true;
      warnings.push(`Месячный лимит превышен: $${monthlyUsed.toFixed(2)} / $${config.monthly_limit.toFixed(2)}`);
    } else if (monthlyUsed >= config.monthly_limit * threshold) {
      warnings.push(`Приближение к месячному лимиту: $${monthlyUsed.toFixed(2)} / $${config.monthly_limit.toFixed(2)}`);
    }
  }

  return {
    dailyUsed,
    dailyLimit: config?.daily_limit ?? null,
    weeklyUsed,
    weeklyLimit: config?.weekly_limit ?? null,
    monthlyUsed,
    monthlyLimit: config?.monthly_limit ?? null,
    warningThreshold: threshold,
    hardStop: !!config?.hard_stop,
    isOverBudget,
    warnings,
  };
}

/** Update budget config */
export function setBudget(params: Partial<DBBudgetConfig>): void {
  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (params.daily_limit !== undefined) { fields.push('daily_limit = ?'); values.push(params.daily_limit); }
  if (params.weekly_limit !== undefined) { fields.push('weekly_limit = ?'); values.push(params.weekly_limit); }
  if (params.monthly_limit !== undefined) { fields.push('monthly_limit = ?'); values.push(params.monthly_limit); }
  if (params.warning_threshold !== undefined) { fields.push('warning_threshold = ?'); values.push(params.warning_threshold); }
  if (params.hard_stop !== undefined) { fields.push('hard_stop = ?'); values.push(params.hard_stop); }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    db.prepare(`UPDATE budget_config SET ${fields.join(', ')} WHERE id = 1`).run(...values);
  }
}
