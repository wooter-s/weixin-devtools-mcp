import automator from 'miniprogram-automator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectDevtools } from '../../src/core/connection.js';

vi.mock('miniprogram-automator', () => ({
  default: {
    connect: vi.fn(),
    launch: vi.fn(),
  },
}));

describe('core connectDevtools purity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('只建立连接和读取页面，不安装 Console/Network 监听', async () => {
    const page = { path: '/pages/home/index' };
    const miniProgram = {
      currentPage: vi.fn(async () => page),
      mockWxMethod: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    };
    vi.mocked(automator.launch).mockResolvedValue(miniProgram as never);

    const result = await connectDevtools({ projectPath: process.cwd() });

    expect(result.pagePath).toBe('/pages/home/index');
    expect(miniProgram.mockWxMethod).not.toHaveBeenCalled();
    expect(miniProgram.evaluate).not.toHaveBeenCalled();
  });

  it('已创建候选连接但页面不可用时主动断开候选', async () => {
    const miniProgram = {
      currentPage: vi.fn(async () => null),
      disconnect: vi.fn(async () => undefined),
    };
    vi.mocked(automator.launch).mockResolvedValue(miniProgram as never);

    await expect(connectDevtools({ projectPath: process.cwd() }))
      .rejects.toThrow('无法获取当前页面');

    expect(miniProgram.disconnect).toHaveBeenCalledOnce();
  });
});
