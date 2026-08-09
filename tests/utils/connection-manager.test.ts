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
import type { AdapterConnectionResult } from '../../src/connection/types.js';

const mockPage = { path: '/pages/home/index' };

function createMockMiniProgram() {
  return {
    disconnect: vi.fn(async () => undefined),
  };
}

function buildAdapterResult(overrides?: Partial<AdapterConnectionResult>): AdapterConnectionResult {
  return {
    strategyUsed: 'launch',
    endpoint: 'ws://127.0.0.1:9420',
    miniProgram: createMockMiniProgram() as never,
    currentPage: mockPage as never,
    pagePath: '/pages/home/index',
    ...overrides,
  };
}

describe('connection manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(probeConnectionHealth).mockResolvedValue({
      level: 'healthy',
      checks: [],
      checkedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('只返回一次连接执行结果和可复用请求，不保存运行时状态', async () => {
    vi.mocked(executeConnectionStrategy).mockResolvedValue(buildAdapterResult());

    const manager = new ConnectionManager();
    const execution = await manager.connect({
      strategy: 'launch',
      projectPath: '/tmp/project',
    });

    expect(execution.result.status).toBe('connected');
    expect(execution.result.connectionId).toContain('conn_');
    expect(execution.reconnectRequest.strategy).toBe('launch');
    expect(execution.reconnectRequest.timeoutMs).toBe(45_000);
    expect('getSession' in manager).toBe(false);
    expect('getStatusSnapshot' in manager).toBe(false);
  });

  it('首个策略失败时回退，并记录告警和实际成功策略', async () => {
    vi.mocked(executeConnectionStrategy)
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockResolvedValueOnce(buildAdapterResult({ strategyUsed: 'connect' }));

    const execution = await new ConnectionManager().connect({
      strategy: 'launch',
      projectPath: '/tmp/project',
      fallback: ['connect'],
    });

    expect(execution.result.strategyUsed).toBe('connect');
    expect(execution.result.warnings).toEqual(['[launch] launch failed']);
    expect(execution.reconnectRequest.strategy).toBe('connect');
  });

  it('候选连接健康检查失败时先清理，再执行 fallback', async () => {
    const events: string[] = [];
    const firstMiniProgram = {
      disconnect: vi.fn(async () => {
        events.push('first-disconnect');
      }),
    };

    vi.mocked(executeConnectionStrategy).mockImplementation(async strategy => {
      events.push(`attempt-${strategy}`);
      if (strategy === 'launch') {
        return buildAdapterResult({ miniProgram: firstMiniProgram as never });
      }
      expect(events).toContain('first-disconnect');
      return buildAdapterResult({ strategyUsed: 'connect' });
    });
    vi.mocked(probeConnectionHealth)
      .mockResolvedValueOnce({
        level: 'unhealthy',
        checks: [],
        checkedAt: '2026-01-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        level: 'healthy',
        checks: [],
        checkedAt: '2026-01-01T00:00:01.000Z',
      });

    const execution = await new ConnectionManager().connect({
      strategy: 'launch',
      projectPath: '/tmp/project',
      fallback: ['connect'],
    });

    expect(execution.result.strategyUsed).toBe('connect');
    expect(firstMiniProgram.disconnect).toHaveBeenCalledOnce();
  });

  it('所有策略失败时抛出最后一个标准连接错误', async () => {
    vi.mocked(executeConnectionStrategy)
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockRejectedValueOnce(new Error('connect failed'));

    await expect(new ConnectionManager().connect({
      strategy: 'launch',
      projectPath: '/tmp/project',
      fallback: ['connect'],
    })).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
      message: 'connect failed',
    });
  });

  it('disconnect 忽略远端断连异常，refreshHealth 仅委托探针', async () => {
    const miniProgram = createMockMiniProgram();
    miniProgram.disconnect.mockRejectedValueOnce(new Error('already closed'));
    const manager = new ConnectionManager();

    await expect(manager.disconnect(miniProgram as never)).resolves.toBeUndefined();
    await expect(manager.refreshHealth(miniProgram as never)).resolves.toMatchObject({
      level: 'healthy',
    });
    expect(probeConnectionHealth).toHaveBeenCalledWith(miniProgram);
  });
});
