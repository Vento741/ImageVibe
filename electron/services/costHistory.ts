import { getDatabase } from './database';
import { CREDIT_USD, getCredits } from './kieClient';

/**
 * Стоимость генерации.
 *
 * Предварительной цены у kie.ai не существует: эндпоинта с ценами нет, в документации
 * моделей цен нет, страница тарифов отрисовывается на клиенте (замер 9). Единственный
 * честный источник ожидаемой суммы — собственная история генераций этой моделью.
 *
 * Фактическая стоимость приходит вместе с результатом полем `creditsConsumed` и точна.
 */

/** Кредиты в доллары. Цена кредита определена один раз, в клиенте. */
export function creditsToUsd(credits: number): number {
  return credits * CREDIT_USD;
}

/** Медиана списка. Пустой список — null; чётная длина — среднее двух средних. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Ожидаемая стоимость генерации моделью по прошлым генерациям ею же.
 *
 * Учитываются только подтверждённые списания: оценка, посчитанная из оценки, — это
 * догадка о догадке. Нет истории — null, и интерфейс честно говорит, что цена станет
 * известна после генерации, а не показывает выдуманное число.
 */
export function medianCostFor(modelId: string): number | null {
  const rows = getDatabase()
    .prepare(
      `SELECT cost_usd FROM generation_costs
       WHERE model_id = ? AND cost_source = 'actual' AND cost_type IN ('image', 'video')`,
    )
    .all(modelId) as Array<{ cost_usd: number }>;

  return median(rows.map((row) => row.cost_usd));
}

export interface KieBalance {
  credits: number;
  /**
   * Верхняя граница остатка в долларах: при покупке пакетами kie.ai даёт 5–10% бонусных
   * кредитов, то есть эффективная цена кредита ниже объявленных $0.005.
   */
  usd: number;
}

export async function getBalance(): Promise<KieBalance> {
  const credits = await getCredits();
  return { credits, usd: creditsToUsd(credits) };
}
