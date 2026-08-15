import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.mock('../electron/services/configManager', () => ({
  getActiveApiKey: (provider?: string) => (provider === 'kie' ? 'kie-test-key' : null),
}));
vi.mock('../electron/services/logger', () => ({ logger: { log: () => {} } }));

/** Ответ kie.ai: HTTP всегда 200, настоящий код — в теле (замер 2). */
function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

interface Call {
  url: string;
  init?: { method?: string; body?: string; headers?: Record<string, string> };
}

let calls: Call[] = [];

function mockFetch(handler: (url: string) => unknown) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: Call['init']) => {
      calls.push({ url: String(url), init });
      return handler(String(url));
    }),
  );
}

async function client() {
  return import('../electron/services/kieClient');
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('createTask', () => {
  it('возвращает идентификатор задачи', async () => {
    mockFetch(() => reply({ code: 200, msg: 'success', data: { taskId: 't1', recordId: 't1' } }));
    const { createTask } = await client();
    expect(await createTask('z-image', { prompt: 'a cat' })).toBe('t1');
  });

  it('шлёт модель и вход в теле запроса', async () => {
    mockFetch(() => reply({ code: 200, data: { taskId: 't1' } }));
    const { createTask } = await client();
    await createTask('z-image', { prompt: 'a cat', aspect_ratio: '1:1' });

    expect(calls[0].url).toBe('https://api.kie.ai/api/v1/jobs/createTask');
    expect(JSON.parse(calls[0].init!.body!)).toEqual({
      model: 'z-image',
      input: { prompt: 'a cat', aspect_ratio: '1:1' },
    });
    expect(calls[0].init!.headers!.Authorization).toBe('Bearer kie-test-key');
    expect(calls[0].init!.headers!['Content-Type']).toBe('application/json');
  });

  it('распознаёт отказ, пришедший с HTTP 200', async () => {
    // Ради этого случая тест и существует: response.ok здесь равен true
    mockFetch(() => reply({ code: 500, msg: 'This field is required', data: null }));
    const { createTask } = await client();
    await expect(createTask('z-image', {})).rejects.toThrow('This field is required');
  });

  it('объясняет неверный ключ по-русски', async () => {
    mockFetch(() => reply({ code: 401, msg: 'Unauthorized – Authentication failed' }));
    const { createTask } = await client();
    await expect(createTask('z-image', { prompt: 'x' })).rejects.toThrow(/ключ kie\.ai/i);
  });

  it('объясняет нехватку кредитов по-русски', async () => {
    mockFetch(() => reply({ code: 402, msg: 'Insufficient Credits' }));
    const { createTask } = await client();
    await expect(createTask('z-image', { prompt: 'x' })).rejects.toThrow(/кредитов/i);
  });

  it('объясняет превышение лимита частоты', async () => {
    mockFetch(() => reply({ code: 429, msg: 'Too many requests' }));
    const { createTask } = await client();
    await expect(createTask('z-image', { prompt: 'x' })).rejects.toThrow(/Слишком много запросов/i);
  });

  it('передаёт текст неизвестной модели как есть', async () => {
    mockFetch(() => reply({ code: 422, msg: 'The model name you specified is not supported.' }));
    const { createTask } = await client();
    await expect(createTask('нет/такой', { prompt: 'x' })).rejects.toThrow(/not supported/);
  });

  it('падает, когда идентификатора задачи нет', async () => {
    mockFetch(() => reply({ code: 200, data: {} }));
    const { createTask } = await client();
    await expect(createTask('z-image', { prompt: 'x' })).rejects.toThrow(/идентификатор/i);
  });
});

/** Реальная запись успешной задачи из замера 4, скопированная целиком. */
const REAL_SUCCESS = {
  code: 200,
  msg: 'success',
  data: {
    taskId: '86007839a9ca205ad3af437f7974310f',
    model: 'z-image',
    state: 'success',
    param: '{"input":"{}","model":"z-image"}',
    resultJson:
      '{"resultUrls":["https://file.aiquickdraw.com/s/1786791208_e101c9d818aa44eca7ffb091b2dd827f.png"]}',
    failCode: null,
    failMsg: null,
    costTime: 55,
    completeTime: 1786791210585,
    createTime: 1786791155330,
    creditsConsumed: 0.8,
  },
};

describe('getTask', () => {
  it('разбирает реальную запись успешной задачи', async () => {
    mockFetch(() => reply(REAL_SUCCESS));
    const { getTask } = await client();
    const task = await getTask('86007839a9ca205ad3af437f7974310f');

    expect(task.state).toBe('success');
    expect(task.resultUrls).toEqual([
      'https://file.aiquickdraw.com/s/1786791208_e101c9d818aa44eca7ffb091b2dd827f.png',
    ]);
    expect(task.creditsConsumed).toBe(0.8);
    expect(task.costTimeSec).toBe(55);
    expect(task.failMessage).toBeNull();
  });

  it('не считает незавершённую задачу ошибкой', async () => {
    mockFetch(() => reply({ code: 200, data: { taskId: 't1', state: 'generating' } }));
    const { getTask } = await client();
    const task = await getTask('t1');
    expect(task.state).toBe('generating');
    expect(task.resultUrls).toEqual([]);
    expect(task.creditsConsumed).toBeNull();
  });

  it('отдаёт текст отказа задачи', async () => {
    mockFetch(() =>
      reply({ code: 200, data: { taskId: 't1', state: 'fail', failMsg: 'content blocked' } }),
    );
    const { getTask } = await client();
    expect((await getTask('t1')).failMessage).toBe('content blocked');
  });

  it('считает успех без разбираемого результата ошибкой задачи', async () => {
    mockFetch(() => reply({ code: 200, data: { taskId: 't1', state: 'success', resultJson: 'не json' } }));
    const { getTask } = await client();
    await expect(getTask('t1')).rejects.toThrow(/нечитаемый результат/i);
  });

  it('считает успех без ссылок ошибкой задачи', async () => {
    mockFetch(() => reply({ code: 200, data: { taskId: 't1', state: 'success', resultJson: '{}' } }));
    const { getTask } = await client();
    await expect(getTask('t1')).rejects.toThrow(/ссылок не приложил/i);
  });

  it('падает на неизвестном состоянии', async () => {
    mockFetch(() => reply({ code: 200, data: { taskId: 't1', state: 'взорвалось' } }));
    const { getTask } = await client();
    await expect(getTask('t1')).rejects.toThrow(/неизвестное состояние/i);
  });

  it('сообщает про несуществующую задачу', async () => {
    mockFetch(() => reply({ code: 422, msg: 'recordInfo is null' }));
    const { getTask } = await client();
    await expect(getTask('нет')).rejects.toThrow(/recordInfo is null/);
  });
});

describe('uploadDataUrl', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';

  it('возвращает ссылку на загруженный файл', async () => {
    mockFetch(() =>
      reply({
        success: true,
        code: 200,
        data: { downloadUrl: 'https://tempfile.redpandaai.co/kieai/1/images/user-uploads/a.png' },
      }),
    );
    const { uploadDataUrl } = await client();
    expect(await uploadDataUrl(PNG)).toBe(
      'https://tempfile.redpandaai.co/kieai/1/images/user-uploads/a.png',
    );
  });

  it('даёт разные имена файлов при повторной загрузке — иначе перезапишет чужую', async () => {
    mockFetch(() => reply({ code: 200, data: { downloadUrl: 'https://x/a.png' } }));
    const { uploadDataUrl } = await client();
    await uploadDataUrl(PNG);
    await uploadDataUrl(PNG);

    const names = calls.map((c) => JSON.parse(c.init!.body!).fileName);
    expect(names[0]).not.toBe(names[1]);
    expect(names[0]).toMatch(/\.png$/);
  });

  it('шлёт полный data-URL, а не голый base64', async () => {
    mockFetch(() => reply({ code: 200, data: { downloadUrl: 'https://x/a.png' } }));
    const { uploadDataUrl } = await client();
    await uploadDataUrl(PNG);
    expect(JSON.parse(calls[0].init!.body!).base64Data).toBe(PNG);
  });

  it('отвергает не data-URL', async () => {
    mockFetch(() => reply({ code: 200, data: {} }));
    const { uploadDataUrl } = await client();
    await expect(uploadDataUrl('C:/картинки/кот.png')).rejects.toThrow(/data-URL/);
  });
});

describe('getCredits', () => {
  it('читает баланс числом', async () => {
    mockFetch(() => reply({ code: 200, msg: 'success', data: 79.2 }));
    const { getCredits } = await client();
    expect(await getCredits()).toBe(79.2);
  });

  it('падает, когда баланс не число', async () => {
    mockFetch(() => reply({ code: 200, data: { balance: 79.2 } }));
    const { getCredits } = await client();
    await expect(getCredits()).rejects.toThrow(/баланс/i);
  });
});

describe('downloadResult', () => {
  it('скачивает без заголовка авторизации — это файловый хост, а не API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: Call['init']) => {
        calls.push({ url: String(url), init });
        return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
      }),
    );
    calls = [];
    const { downloadResult } = await client();
    const bytes = await downloadResult('https://file.aiquickdraw.com/s/a.png');

    expect([...bytes]).toEqual([1, 2, 3]);
    expect(calls[0].init?.headers).toBeUndefined();
  });

  it('файловый хост сообщает об ошибке обычным статусом', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const { downloadResult } = await client();
    await expect(downloadResult('https://file.aiquickdraw.com/s/нет.png')).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe('ключ kie.ai', () => {
  it('без ключа вызов не уходит в сеть', async () => {
    vi.doMock('../electron/services/configManager', () => ({ getActiveApiKey: () => null }));
    mockFetch(() => reply({ code: 200, data: { taskId: 't1' } }));
    const { createTask } = await import('../electron/services/kieClient');
    await expect(createTask('z-image', { prompt: 'x' })).rejects.toThrow(/Не задан ключ kie\.ai/);
    expect(calls).toHaveLength(0);
  });
});

describe('CREDIT_USD', () => {
  it('кредит стоит полцента', async () => {
    const { CREDIT_USD } = await client();
    expect(CREDIT_USD).toBe(0.005);
    expect(0.8 * CREDIT_USD).toBeCloseTo(0.004, 6);
  });
});
