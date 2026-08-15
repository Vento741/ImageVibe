import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import os from 'os';

let db: DatabaseSync;

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.mock('../electron/services/logger', () => ({ logger: { log: () => {} } }));
vi.mock('../electron/services/database', () => ({ getDatabase: () => db }));
vi.mock('../electron/services/configManager', () => ({ getActiveApiKey: () => 'kie-test-key' }));

import { creditsToUsd, getBalance, median, medianCostFor } from '../electron/services/costHistory';

function record(modelId: string, cost: number, source = 'actual', type = 'image') {
  db.prepare(
    'INSERT INTO generation_costs (model_id, cost_usd, cost_type, cost_source) VALUES (?,?,?,?)',
  ).run(modelId, cost, type, source);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE generation_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id TEXT NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0,
      cost_type TEXT DEFAULT 'image',
      cost_source TEXT DEFAULT 'actual'
    );
  `);
});

describe('creditsToUsd', () => {
  it('считает по цене кредита из клиента', () => {
    expect(creditsToUsd(0.8)).toBeCloseTo(0.004, 6);
    expect(creditsToUsd(2)).toBeCloseTo(0.01, 6);
    expect(creditsToUsd(0)).toBe(0);
  });
});

describe('median', () => {
  it('пустой список не имеет медианы', () => {
    expect(median([])).toBeNull();
  });

  it('нечётная длина даёт средний элемент', () => {
    expect(median([0.01, 0.004, 0.006])).toBe(0.006);
  });

  it('чётная длина даёт среднее двух средних', () => {
    expect(median([0.004, 0.006, 0.01, 0.02])).toBeCloseTo(0.008, 6);
  });

  it('не зависит от порядка и не портит исходный список', () => {
    const input = [3, 1, 2];
    expect(median(input)).toBe(2);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('medianCostFor', () => {
  it('без истории цены нет — и это честнее выдуманного числа', () => {
    expect(medianCostFor('z-image')).toBeNull();
  });

  it('одна генерация уже даёт ориентир', () => {
    record('z-image', 0.004);
    expect(medianCostFor('z-image')).toBeCloseTo(0.004, 6);
  });

  it('берёт медиану по трём генерациям', () => {
    record('z-image', 0.004);
    record('z-image', 0.01);
    record('z-image', 0.006);
    expect(medianCostFor('z-image')).toBeCloseTo(0.006, 6);
  });

  it('не учитывает оценки — иначе это была бы догадка о догадке', () => {
    record('z-image', 0.004);
    record('z-image', 99, 'estimated');
    record('z-image', 99, 'unknown');
    expect(medianCostFor('z-image')).toBeCloseTo(0.004, 6);
  });

  it('не смешивает модели', () => {
    record('z-image', 0.004);
    record('qwen/image-edit', 0.01);
    expect(medianCostFor('z-image')).toBeCloseTo(0.004, 6);
    expect(medianCostFor('qwen/image-edit')).toBeCloseTo(0.01, 6);
  });

  it('учитывает и видео, и изображения, но не перевод промпта', () => {
    record('kling/v2', 0.25, 'actual', 'video');
    record('kling/v2', 0.0001, 'actual', 'translate');
    expect(medianCostFor('kling/v2')).toBeCloseTo(0.25, 6);
  });
});

describe('getBalance', () => {
  it('переводит кредиты в доллары', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ code: 200, data: 79.2 }) })),
    );

    expect(await getBalance()).toEqual({ credits: 79.2, usd: creditsToUsd(79.2) });
    vi.unstubAllGlobals();
  });
});
