import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkDevToolsRunning, detectIDEPort } from '../../src/core/connection.js';

describe('core/connection exports', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('checkDevToolsRunning 在 HTTP 成功时返回 true', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkDevToolsRunning(9420);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checkDevToolsRunning 在请求异常时返回 false', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network error');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkDevToolsRunning(9420);

    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('detectIDEPort 应返回首个可用端口', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const requestUrl = String(url);
      return {
        ok: requestUrl.includes(':9440'),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const port = await detectIDEPort(false);

    expect(port).toBe(9440);
    expect(fetchMock).toHaveBeenCalled();
  });
});
