import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/connection/adapters.js', () => ({
  executeConnectionStrategy: vi.fn(),
}));

vi.mock('../../src/connection/health-probe.js', () => ({
  probeConnectionHealth: vi.fn(),
}));

import { executeConnectionStrategy } from '../../src/connection/adapters.js';
import { probeConnectionHealth } from '../../src/connection/health-probe.js';
import { ConnectionManager } from '../../src/connection/manager.js';

const mockPage = { path: '/pages/home/index' };
const mockMiniProgram = {
  disconnect: vi.fn(async () => undefined),
};

describe('connection manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connect 成功后应进入 connected 状态', async () => {
    vi.mocked(executeConnectionStrategy).mockResolvedValue({
      strategyUsed: 'launch',
      endpoint: 'ws://127.0.0.1:9420',
      miniProgram: mockMiniProgram as any,
      currentPage: mockPage as any,
      pagePath: '/pages/home/index',
    });
    vi.mocked(probeConnectionHealth).mockResolvedValue({
      level: 'healthy',
      checks: [],
      checkedAt: '2026-01-01T00:00:00.000Z',
    });

    const manager = new ConnectionManager();
    const result = await manager.connect({
      strategy: 'launch',
      projectPath: '/tmp/project',
    });

    expect(result.status).toBe('connected');
    expect(result.strategyUsed).toBe('launch');
    expect(result.connectionId).toContain('conn_');
    expect(manager.getStatusSnapshot().state).toBe('connected');
  });

  it('首个策略失败时应回退到后续策略', async () => {
    vi.mocked(executeConnectionStrategy)
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockResolvedValueOnce({
        strategyUsed: 'connect',
        endpoint: 'ws://127.0.0.1:9421',
        miniProgram: mockMiniProgram as any,
        currentPage: mockPage as any,
        pagePath: '/pages/home/index',
      });
    vi.mocked(probeConnectionHealth).mockResolvedValue({
      level: 'healthy',
      checks: [],
      checkedAt: '2026-01-01T00:00:00.000Z',
    });

    const manager = new ConnectionManager();
    const result = await manager.connect({
      strategy: 'launch',
      projectPath: '/tmp/project',
      fallback: ['connect'],
    });

    expect(result.strategyUsed).toBe('connect');
    expect(result.warnings.length).toBe(1);
    expect(vi.mocked(executeConnectionStrategy).mock.calls[0]?.[0]).toBe('launch');
    expect(vi.mocked(executeConnectionStrategy).mock.calls[1]?.[0]).toBe('connect');
  });

  it('没有历史参数时 reconnect 应报错', async () => {
    const manager = new ConnectionManager();
    await expect(manager.reconnect()).rejects.toThrow('没有可用于重连的历史连接参数');
  });
});
