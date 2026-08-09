import automator from 'miniprogram-automator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeConnectionStrategy } from '../../src/connection/adapters.js';
import type { ResolvedConnectionRequest } from '../../src/connection/types.js';

vi.mock('miniprogram-automator', () => ({
  default: {
    connect: vi.fn(),
    launch: vi.fn(),
  },
}));

function request(): ResolvedConnectionRequest {
  return {
    strategy: 'wsEndpoint',
    wsEndpoint: 'ws://127.0.0.1:9420',
    timeoutMs: 1000,
    fallback: [],
    healthCheck: true,
    verbose: false,
    autoDiscover: false,
  };
}

describe('connection adapters candidate cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wsEndpoint 已建立但页面不可用时断开候选连接', async () => {
    const miniProgram = {
      currentPage: vi.fn(async () => null),
      disconnect: vi.fn(async () => undefined),
    };
    vi.mocked(automator.connect).mockResolvedValue(miniProgram as never);

    await expect(executeConnectionStrategy('wsEndpoint', request()))
      .rejects.toThrow('currentPage 不可用');

    expect(miniProgram.disconnect).toHaveBeenCalledOnce();
  });

  it('wsEndpoint 成功返回时保持候选连接活动', async () => {
    const page = { path: '/pages/home/index' };
    const miniProgram = {
      currentPage: vi.fn(async () => page),
      disconnect: vi.fn(async () => undefined),
    };
    vi.mocked(automator.connect).mockResolvedValue(miniProgram as never);

    const result = await executeConnectionStrategy('wsEndpoint', request());

    expect(result.miniProgram).toBe(miniProgram);
    expect(result.pagePath).toBe('/pages/home/index');
    expect(miniProgram.disconnect).not.toHaveBeenCalled();
  });
});
