import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';
import type { KieModel } from '../src/shared/types/kie';

/**
 * Очередь проверяется на настоящей базе через встроенный `node:sqlite`: better-sqlite3
 * пересобран под Electron и в тестовом Node не грузится, а поддельная база не поймала бы
 * ни рассогласования цены между тремя местами записи, ни потери идентификатора задачи.
 */

let db: DatabaseSync;
let sent: Array<{ channel: string; data: Record<string, unknown> }> = [];

const IMAGE_MODEL: KieModel = {
  id: 'z-image',
  name: 'Z-Image',
  family: 'z-image',
  kind: 'image',
  modes: ['text2img'],
  schema: { aspect_ratio: { type: 'enum', values: ['1:1', '16:9'], default: '1:1' } },
  required: ['aspect_ratio'],
  roles: { prompt: 'prompt' },
  docUrl: 'https://docs.kie.ai/market/z-image/z-image.md',
};

const EDIT_MODEL: KieModel = {
  ...IMAGE_MODEL,
  id: 'qwen/image-edit',
  name: 'Qwen edit',
  family: 'qwen',
  modes: ['img2img'],
  schema: {},
  required: [],
  roles: { prompt: 'prompt', references: { key: 'image_url', array: false, max: 1 } },
};

const VIDEO_MODEL: KieModel = {
  ...IMAGE_MODEL,
  id: 'kling/v2',
  name: 'Kling v2',
  family: 'kling',
  kind: 'video',
  modes: ['text2video'],
  schema: {},
  required: [],
};

const MODELS = new Map([
  [IMAGE_MODEL.id, IMAGE_MODEL],
  [EDIT_MODEL.id, EDIT_MODEL],
  [VIDEO_MODEL.id, VIDEO_MODEL],
]);

function png(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(
    Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(24)])),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(16),
]);

/** Управляемый клиент kie.ai. */
const kie = {
  createTask: vi.fn(async () => 'task-1'),
  getTask: vi.fn(async () => ({
    taskId: 'task-1',
    state: 'success' as const,
    resultUrls: ['https://file.aiquickdraw.com/s/a.png'],
    failMessage: null,
    creditsConsumed: 0.8 as number | null,
    costTimeSec: 12,
  })),
  uploadDataUrl: vi.fn(async () => 'https://tempfile.redpandaai.co/kieai/1/src.png'),
  downloadResult: vi.fn(async () => png()),
  getCredits: vi.fn(async () => 76.4),
};

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, data: Record<string, unknown>) => sent.push({ channel, data }),
        },
      },
    ],
  },
  app: { getVersion: () => '1.2.0' },
}));

// Подменяется только соединение: набор миграций берётся настоящий, чтобы тестовая
// база имела ровно ту схему, что получит пользователь
vi.mock('../electron/services/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/services/database')>()),
  getDatabase: () => db,
}));
vi.mock('../electron/services/kieClient', () => ({ ...kie, CREDIT_USD: 0.005 }));
vi.mock('../electron/services/kieRegistry', () => ({
  getModelById: (id: string) => MODELS.get(id),
}));
vi.mock('../electron/services/openRouterClient', () => ({
  translatePrompt: vi.fn(async (t: string) => `translated:${t}`),
  isRussianText: () => false,
}));
vi.mock('../electron/services/fileStorage', () => ({
  saveMedia: vi.fn((bytes: Buffer) => (bytes.equals(MP4) ? '/tmp/x.mp4' : '/tmp/x.png')),
  getFileSize: () => 1234,
}));
vi.mock('../electron/services/autoTagger', () => ({ saveImageTags: vi.fn() }));
vi.mock('../electron/services/configManager', () => ({
  getConfig: () => ({ promptAssistant: { autoTranslate: false, model: 'chat/model' } }),
}));
vi.mock('../electron/services/logger', () => ({ logger: { log: () => {} } }));

async function processor() {
  const mod = await import('../electron/services/queueProcessor');
  mod.setPollingForTests({ intervalMs: 1, timeoutMs: 5_000 });
  return mod;
}

/** Дождаться, пока очередь опустеет. */
async function settle(): Promise<void> {
  for (let i = 0; i < 400; i++) {
    await new Promise((r) => setTimeout(r, 2));
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM generation_queue WHERE status IN ('pending','running')")
      .get() as { n: number };
    if (row.n === 0) return;
  }
  throw new Error('очередь не завершилась');
}

function queueRow(id = 1) {
  return db.prepare('SELECT * FROM generation_queue WHERE id = ?').get(id) as Record<
    string,
    unknown
  >;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  sent = [];

  kie.createTask.mockImplementation(async () => 'task-1');
  kie.getTask.mockImplementation(async () => ({
    taskId: 'task-1',
    state: 'success' as const,
    resultUrls: ['https://file.aiquickdraw.com/s/a.png'],
    failMessage: null,
    creditsConsumed: 0.8,
    costTimeSec: 12,
  }));
  kie.downloadResult.mockImplementation(async () => png());
  kie.uploadDataUrl.mockImplementation(async () => 'https://tempfile.redpandaai.co/kieai/1/src.png');

  db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
  const { getMigrations } = await import('../electron/services/database');
  for (const migration of getMigrations()) db.exec(migration.sql);
});

afterEach(() => db.close());

const base = {
  prompt: 'a red apple',
  modelId: 'z-image',
  mode: 'text2img' as const,
  params: { aspect_ratio: '1:1' },
  clientId: 'client-1',
};

describe('успешный путь', () => {
  it('доводит запись до завершения и кладёт изображение в галерею', async () => {
    const { submitGeneration } = await processor();
    submitGeneration(base);
    await settle();

    expect(queueRow().status).toBe('completed');
    const image = db.prepare('SELECT * FROM images').get() as Record<string, unknown>;
    expect(image.prompt).toBe('a red apple');
    expect(image.model_id).toBe('z-image');
    expect(image.media_kind).toBe('image');
    expect(image.width).toBe(8);
    expect(image.height).toBe(8);
  });

  it('собирает тело запроса по схеме модели', async () => {
    const { submitGeneration } = await processor();
    submitGeneration({ ...base, params: { aspect_ratio: '16:9', лишний: 'мусор' } });
    await settle();

    expect(kie.createTask).toHaveBeenCalledWith(
      'z-image',
      { prompt: 'a red apple', aspect_ratio: '16:9' },
      expect.anything(),
    );
  });

  it('сохраняет идентификатор задачи до первого опроса', async () => {
    let taskIdAtFirstPoll: unknown;
    kie.getTask.mockImplementation(async () => {
      taskIdAtFirstPoll = queueRow().task_id;
      return {
        taskId: 'task-1',
        state: 'success' as const,
        resultUrls: ['https://x/a.png'],
        failMessage: null,
        creditsConsumed: 0.8,
        costTimeSec: 1,
      };
    });

    const { submitGeneration } = await processor();
    submitGeneration(base);
    await settle();

    expect(taskIdAtFirstPoll).toBe('task-1');
  });

  it('опрашивает, пока задача не готова', async () => {
    const states = ['queuing', 'generating', 'success'] as const;
    let call = 0;
    kie.getTask.mockImplementation(async () => {
      const state = states[Math.min(call++, states.length - 1)];
      return {
        taskId: 'task-1',
        state,
        resultUrls: state === 'success' ? ['https://x/a.png'] : [],
        failMessage: null,
        creditsConsumed: state === 'success' ? 0.8 : null,
        costTimeSec: null,
      };
    });

    const { submitGeneration } = await processor();
    submitGeneration(base);
    await settle();

    expect(kie.getTask).toHaveBeenCalledTimes(3);
    expect(queueRow().status).toBe('completed');
  });

  it('сообщает интерфейсу о завершении', async () => {
    const { submitGeneration } = await processor();
    submitGeneration(base);
    await settle();

    const completed = sent.find((e) => e.channel === 'queue:item-completed');
    expect(completed?.data.clientId).toBe('client-1');
    expect((completed?.data.result as Record<string, unknown>).mediaKind).toBe('image');
  });
});

describe('стоимость', () => {
  it('фактическая цена попадает во все три места одинаковой', async () => {
    const { submitGeneration } = await processor();
    submitGeneration(base);
    await settle();

    const image = db.prepare('SELECT cost_usd FROM images').get() as { cost_usd: number };
    const queue = queueRow();
    const cost = db.prepare('SELECT * FROM generation_costs').get() as Record<string, unknown>;

    expect(image.cost_usd).toBeCloseTo(0.004, 6);
    expect(queue.actual_cost).toBeCloseTo(0.004, 6);
    expect(cost.cost_usd).toBeCloseTo(0.004, 6);
    expect(cost.cost_source).toBe('actual');
  });

  it('без фактической цены берёт медиану по истории и помечает оценкой', async () => {
    db.prepare(
      "INSERT INTO generation_costs (model_id, cost_usd, cost_type, cost_source) VALUES ('z-image', 0.006, 'image', 'actual')",
    ).run();
    kie.getTask.mockImplementation(async () => ({
      taskId: 'task-1',
      state: 'success' as const,
      resultUrls: ['https://x/a.png'],
      failMessage: null,
      creditsConsumed: null,
      costTimeSec: 1,
    }));

    const { submitGeneration } = await processor();
    submitGeneration(base);
    await settle();

    const image = db.prepare('SELECT cost_usd FROM images').get() as { cost_usd: number };
    expect(image.cost_usd).toBeCloseTo(0.006, 6);
    expect(queueRow().actual_cost).toBeCloseTo(0.006, 6);
  });

  it('без цены и без истории не выдумывает ноль', async () => {
    kie.getTask.mockImplementation(async () => ({
      taskId: 'task-1',
      state: 'success' as const,
      resultUrls: ['https://x/a.png'],
      failMessage: null,
      creditsConsumed: null,
      costTimeSec: 1,
    }));

    const { submitGeneration } = await processor();
    submitGeneration(base);
    await settle();

    const image = db.prepare('SELECT cost_usd FROM images').get() as { cost_usd: number | null };
    expect(image.cost_usd).toBeNull();
    expect(queueRow().actual_cost).toBeNull();

    const cost = db.prepare('SELECT cost_source FROM generation_costs').get() as {
      cost_source: string;
    };
    expect(cost.cost_source).toBe('unknown');
  });
});

describe('отказы', () => {
  it('отказ задачи попадает в запись с текстом сервиса', async () => {
    kie.getTask.mockImplementation(async () => ({
      taskId: 'task-1',
      state: 'fail' as const,
      resultUrls: [],
      failMessage: 'content policy violation',
      creditsConsumed: null,
      costTimeSec: null,
    }));

    const { submitGeneration } = await processor();
    submitGeneration(base);
    await settle();

    expect(queueRow().status).toBe('failed');
    expect(queueRow().error_message).toBe('content policy violation');
    expect(db.prepare('SELECT COUNT(*) AS n FROM images').get()).toEqual({ n: 0 });
  });

  it('превышение ожидания честно говорит, что задача будет оплачена', async () => {
    kie.getTask.mockImplementation(async () => ({
      taskId: 'task-1',
      state: 'generating' as const,
      resultUrls: [],
      failMessage: null,
      creditsConsumed: null,
      costTimeSec: null,
    }));

    const mod = await import('../electron/services/queueProcessor');
    mod.setPollingForTests({ intervalMs: 1, timeoutMs: 5 });
    mod.submitGeneration(base);
    await settle();

    expect(queueRow().status).toBe('failed');
    expect(String(queueRow().error_message)).toMatch(/оплачена/);
  });

  it('отказ создания задачи не заводит запись в галерее', async () => {
    kie.createTask.mockImplementation(async () => {
      throw new Error('This field is required');
    });

    const { submitGeneration } = await processor();
    submitGeneration(base);
    await settle();

    expect(queueRow().status).toBe('failed');
    expect(queueRow().error_message).toBe('This field is required');
    expect(kie.getTask).not.toHaveBeenCalled();
  });

  it('модель, которой нет в реестре, названа прямо', async () => {
    const { submitGeneration } = await processor();
    submitGeneration({ ...base, modelId: 'исчезнувшая/модель' });
    await settle();

    expect(String(queueRow().error_message)).toMatch(/отсутствует в реестре/);
  });
});

describe('исходное изображение', () => {
  it('заливается до создания задачи, и в тело уходит полученная ссылка', async () => {
    const order: string[] = [];
    kie.uploadDataUrl.mockImplementation(async () => {
      order.push('upload');
      return 'https://tempfile.redpandaai.co/kieai/1/src.png';
    });
    kie.createTask.mockImplementation(async () => {
      order.push('createTask');
      return 'task-1';
    });

    const { submitGeneration } = await processor();
    submitGeneration({
      ...base,
      modelId: 'qwen/image-edit',
      mode: 'img2img',
      params: {},
      sourceImageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
    await settle();

    expect(order).toEqual(['upload', 'createTask']);
    expect(kie.createTask).toHaveBeenCalledWith(
      'qwen/image-edit',
      { prompt: 'a red apple', image_url: 'https://tempfile.redpandaai.co/kieai/1/src.png' },
      expect.anything(),
    );
  });

  it('режим с картинкой без исходника не доходит до оплачиваемого запроса', async () => {
    const { submitGeneration } = await processor();
    submitGeneration({ ...base, modelId: 'qwen/image-edit', mode: 'img2img', params: {} });
    await settle();

    expect(kie.createTask).not.toHaveBeenCalled();
    expect(String(queueRow().error_message)).toMatch(/исходное изображение/);
  });
});

describe('видео', () => {
  it('кладётся в ту же таблицу с пометкой вида', async () => {
    kie.downloadResult.mockImplementation(async () => MP4);
    kie.getTask.mockImplementation(async () => ({
      taskId: 'task-1',
      state: 'success' as const,
      resultUrls: ['https://x/clip.mp4'],
      failMessage: null,
      creditsConsumed: 40,
      costTimeSec: 180,
    }));

    const { submitGeneration } = await processor();
    submitGeneration({ ...base, modelId: 'kling/v2', mode: 'text2video', params: {} });
    await settle();

    const image = db.prepare('SELECT * FROM images').get() as Record<string, unknown>;
    expect(image.media_kind).toBe('video');
    expect(image.cost_usd).toBeCloseTo(0.2, 6);

    const cost = db.prepare('SELECT cost_type FROM generation_costs').get() as {
      cost_type: string;
    };
    expect(cost.cost_type).toBe('video');
  });

  it('опрашивается реже изображений и ждёт дольше', async () => {
    const { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } = await import(
      '../electron/services/queueProcessor'
    );
    expect(POLL_INTERVAL_MS.video).toBeGreaterThan(POLL_INTERVAL_MS.image);
    expect(POLL_TIMEOUT_MS.video).toBeGreaterThan(POLL_TIMEOUT_MS.image);
  });
});

describe('восстановление после перезапуска', () => {
  it('возвращает в опрос задачу с сохранённым идентификатором', async () => {
    db.prepare(
      `INSERT INTO generation_queue (prompt, model_id, params, status, task_id, media_kind)
       VALUES (?, ?, ?, 'running', 'task-выживший', 'image')`,
    ).run('a red apple', 'z-image', JSON.stringify({ mode: 'text2img', params: {} }));

    const { resumeRunningTasks } = await processor();
    resumeRunningTasks();
    await settle();

    expect(queueRow().status).toBe('completed');
    expect(kie.getTask).toHaveBeenCalledWith('task-выживший', expect.anything());
    // Задача уже создана на сервере — второй раз её создавать нельзя, это двойная оплата
    expect(kie.createTask).not.toHaveBeenCalled();
  });

  it('не трогает записи без идентификатора задачи', async () => {
    db.prepare(
      `INSERT INTO generation_queue (prompt, model_id, params, status, media_kind)
       VALUES (?, ?, ?, 'running', 'image')`,
    ).run('a red apple', 'z-image', JSON.stringify({ mode: 'text2img', params: {} }));

    const { resumeRunningTasks } = await processor();
    resumeRunningTasks();
    await new Promise((r) => setTimeout(r, 20));

    expect(kie.getTask).not.toHaveBeenCalled();
    expect(queueRow().status).toBe('running');
  });
});

describe('повтор', () => {
  it('стирает идентификатор прошлой задачи и создаёт новую', async () => {
    // Без стирания повтор вернулся бы к опросу уже завершившейся задачи и выдал бы
    // её же отказ вместо новой генерации
    db.prepare(
      `INSERT INTO generation_queue (prompt, model_id, params, status, task_id, error_message, media_kind)
       VALUES (?, ?, ?, 'failed', 'старая-задача', 'content policy', 'image')`,
    ).run(
      'a red apple',
      'z-image',
      JSON.stringify({ mode: 'text2img', params: { aspect_ratio: '1:1' } }),
    );

    const { retryGeneration } = await processor();
    retryGeneration(1);
    await settle();

    expect(kie.createTask).toHaveBeenCalledTimes(1);
    expect(kie.getTask).not.toHaveBeenCalledWith('старая-задача', expect.anything());
    expect(queueRow().status).toBe('completed');
    expect(queueRow().error_message).toBeNull();
  });

  it('сам будит очередь, а не ждёт соседней отправки', async () => {
    db.prepare(
      `INSERT INTO generation_queue (prompt, model_id, params, status, media_kind)
       VALUES (?, ?, ?, 'failed', 'image')`,
    ).run(
      'a red apple',
      'z-image',
      JSON.stringify({ mode: 'text2img', params: { aspect_ratio: '1:1' } }),
    );

    const { retryGeneration } = await processor();
    retryGeneration(1);
    await settle();

    expect(queueRow().status).toBe('completed');
  });

  it('не трогает завершённую запись', async () => {
    db.prepare(
      `INSERT INTO generation_queue (prompt, model_id, params, status, media_kind)
       VALUES (?, ?, ?, 'completed', 'image')`,
    ).run(
      'a red apple',
      'z-image',
      JSON.stringify({ mode: 'text2img', params: { aspect_ratio: '1:1' } }),
    );

    const { retryGeneration } = await processor();
    retryGeneration(1);
    await new Promise((r) => setTimeout(r, 20));

    expect(queueRow().status).toBe('completed');
    expect(kie.createTask).not.toHaveBeenCalled();
  });
});

describe('отмена', () => {
  it('ожидающая запись отменяется бесплатно', async () => {
    const { submitGeneration, cancelGeneration } = await processor();
    kie.createTask.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'task-1';
    });

    const id = submitGeneration(base);
    submitGeneration({ ...base, clientId: 'c2' });
    submitGeneration({ ...base, clientId: 'c3' });
    const pendingId = submitGeneration({ ...base, clientId: 'c4' });
    expect(pendingId).not.toBe(id);

    cancelGeneration(pendingId);
    expect(queueRow(pendingId).status).toBe('cancelled');
    expect(String(queueRow(pendingId).error_message)).toBe('Генерация отменена');
    await settle();
  });

  it('отправленная задача продолжает выполняться и будет оплачена', async () => {
    kie.getTask.mockImplementation(async () => ({
      taskId: 'task-1',
      state: 'generating' as const,
      resultUrls: [],
      failMessage: null,
      creditsConsumed: null,
      costTimeSec: null,
    }));

    const { submitGeneration, cancelGeneration } = await processor();
    const id = submitGeneration(base);

    for (let i = 0; i < 200 && !queueRow(id).task_id; i++) {
      await new Promise((r) => setTimeout(r, 2));
    }
    cancelGeneration(id);
    await settle();

    expect(queueRow(id).status).toBe('cancelled');
    expect(String(queueRow(id).error_message)).toMatch(/будет оплачена/);
  });
});
