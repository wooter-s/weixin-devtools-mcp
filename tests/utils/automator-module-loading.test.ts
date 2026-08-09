import { afterEach, describe, expect, it, vi } from 'vitest';

describe('automator module loading', () => {
  afterEach(() => {
    vi.doUnmock('miniprogram-automator');
    vi.resetModules();
  });

  it('导入连接模块时不加载 automator，首次显式加载才执行模块工厂', async () => {
    const automator = {
      connect: vi.fn(),
      launch: vi.fn(),
    };
    const moduleFactory = vi.fn(() => ({ default: automator }));
    vi.doMock('miniprogram-automator', moduleFactory);

    await Promise.all([
      import('../../src/core/connection.js'),
      import('../../src/connection/adapters.js'),
    ]);
    expect(moduleFactory).not.toHaveBeenCalled();

    const { loadMiniProgramAutomator } = await import('../../src/utils/automator-loader.js');
    const first = loadMiniProgramAutomator();
    const second = loadMiniProgramAutomator();

    expect(first).toBe(second);
    await expect(Promise.all([first, second])).resolves.toEqual([automator, automator]);
    expect(moduleFactory).toHaveBeenCalledOnce();
  });
});
