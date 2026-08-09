import { describe, expect, it, vi } from 'vitest';

import { createRetryableLazyLoader } from '../../src/utils/automator-loader.js';

describe('automator lazy loader', () => {
  it('并发首次加载复用同一个 Promise', async () => {
    const value = { connect: vi.fn(), launch: vi.fn() };
    const importer = vi.fn(async () => value);
    const load = createRetryableLazyLoader(importer);

    const first = load();
    const second = load();

    expect(first).toBe(second);
    await expect(Promise.all([first, second])).resolves.toEqual([value, value]);
    expect(importer).toHaveBeenCalledOnce();

    await expect(load()).resolves.toBe(value);
    expect(importer).toHaveBeenCalledOnce();
  });

  it('加载失败后清空缓存并允许下一次调用重试', async () => {
    const value = { connect: vi.fn(), launch: vi.fn() };
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error('temporary import failure'))
      .mockResolvedValueOnce(value);
    const load = createRetryableLazyLoader(importer);

    await expect(load()).rejects.toThrow('temporary import failure');
    await expect(load()).resolves.toBe(value);
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
