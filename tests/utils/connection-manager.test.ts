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
    removeAllListeners: vi.fn(),
  };
}

function buildAdapterResult(overrides?: Partial<AdapterConnectionResult>): AdapterConnectionResult {
  return {
    strategyUsed: 'launch',
    endpoint: 'ws://127.0.0.1:9420',
    miniProgram: createMockMiniProgram() as any,
    currentPage: mockPage as any,
    pagePath: '/pages/home/index',
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>(resolve => {
    resolvePromise = resolve;
  });

  if (!resolvePromise) {
    throw new Error('deferred resolve 未初始化');
  }

  return {
    promise,
    resolve: resolvePromise,
  };
}

describe('connection manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connect 成功后应进入 connected 状态', async () => {
    vi.mocked(executeConnectionStrategy).mockResolvedValue(
      buildAdapterResult({
        strategyUsed: 'launch',
      }),
    );
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
      .mockResolvedValueOnce(
        buildAdapterResult({
          strategyUsed: 'connect',
          endpoint: 'ws://127.0.0.1:9421',
        }),
      );
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

  it('健康检查失败后应清理当前会话并继续 fallback', async () => {
    const events: string[] = [];
    const firstMiniProgram = {
      disconnect: vi.fn(async () => {
        events.push('first-disconnect');
      }),
      removeAllListeners: vi.fn(() => undefined),
    };
    const secondMiniProgram = createMockMiniProgram();

    vi.mocked(executeConnectionStrategy).mockImplementation(async strategy => {
      events.push(`attempt-${strategy}`);
      if (strategy === 'launch') {
        return buildAdapterResult({
          strategyUsed: 'launch',
          endpoint: 'ws://127.0.0.1:9420',
          miniProgram: firstMiniProgram as any,
        });
      }

      expect(events).toContain('first-disconnect');
      return buildAdapterResult({
        strategyUsed: 'connect',
        endpoint: 'ws://127.0.0.1:9421',
        miniProgram: secondMiniProgram as any,
      });
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

    const manager = new ConnectionManager();
    const result = await manager.connect({
      strategy: 'launch',
      projectPath: '/tmp/project',
      fallback: ['connect'],
    });

    expect(result.strategyUsed).toBe('connect');
    expect(firstMiniProgram.disconnect).toHaveBeenCalledTimes(1);
    expect(firstMiniProgram.removeAllListeners).toHaveBeenCalledWith('console');
    expect(firstMiniProgram.removeAllListeners).toHaveBeenCalledWith('exception');
  });

  it('refreshHealth 返回 unhealthy 时应真实断开连接', async () => {
    const miniProgram = createMockMiniProgram();

    vi.mocked(executeConnectionStrategy).mockResolvedValue(
      buildAdapterResult({
        miniProgram: miniProgram as any,
      }),
    );
    vi.mocked(probeConnectionHealth)
      .mockResolvedValueOnce({
        level: 'healthy',
        checks: [],
        checkedAt: '2026-01-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        level: 'unhealthy',
        checks: [],
        checkedAt: '2026-01-01T00:00:01.000Z',
      });

    const manager = new ConnectionManager();
    await manager.connect({
      strategy: 'launch',
      projectPath: '/tmp/project',
    });

    const status = await manager.refreshHealth();

    expect(status.state).toBe('disconnected');
    expect(status.connected).toBe(false);
    expect(status.lastError?.code).toBe('HEALTH_CHECK_FAILED');
    expect(manager.getSession()).toBeNull();
    expect(miniProgram.disconnect).toHaveBeenCalledTimes(1);
    expect(miniProgram.removeAllListeners).toHaveBeenCalledWith('console');
    expect(miniProgram.removeAllListeners).toHaveBeenCalledWith('exception');
  });

  it('重复 connect 时应保持单活会话', async () => {
    const firstMiniProgram = createMockMiniProgram();
    const secondMiniProgram = createMockMiniProgram();

    vi.mocked(executeConnectionStrategy)
      .mockResolvedValueOnce(
        buildAdapterResult({
          miniProgram: firstMiniProgram as any,
          endpoint: 'ws://127.0.0.1:9420',
        }),
      )
      .mockResolvedValueOnce(
        buildAdapterResult({
          miniProgram: secondMiniProgram as any,
          endpoint: 'ws://127.0.0.1:9421',
        }),
      );
    vi.mocked(probeConnectionHealth).mockResolvedValue({
      level: 'healthy',
      checks: [],
      checkedAt: '2026-01-01T00:00:00.000Z',
    });

    const manager = new ConnectionManager();
    await manager.connect({ strategy: 'launch', projectPath: '/tmp/project' });
    await manager.connect({ strategy: 'launch', projectPath: '/tmp/project' });

    expect(firstMiniProgram.disconnect).toHaveBeenCalledTimes(1);
    expect(manager.getSession()?.miniProgram).toBe(secondMiniProgram);
    expect(manager.getStatusSnapshot().state).toBe('connected');
  });

  it('并发 connect/reconnect/disconnect 应串行执行', async () => {
    const firstDeferred = createDeferred<AdapterConnectionResult>();
    const firstMiniProgram = createMockMiniProgram();
    const secondMiniProgram = createMockMiniProgram();

    let callCount = 0;
    vi.mocked(executeConnectionStrategy).mockImplementation(async strategy => {
      callCount += 1;
      if (callCount === 1) {
        return firstDeferred.promise;
      }
      return buildAdapterResult({
        strategyUsed: strategy,
        endpoint: 'ws://127.0.0.1:9421',
        miniProgram: secondMiniProgram as any,
      });
    });
    vi.mocked(probeConnectionHealth).mockResolvedValue({
      level: 'healthy',
      checks: [],
      checkedAt: '2026-01-01T00:00:00.000Z',
    });

    const manager = new ConnectionManager();
    const connectPromise = manager.connect({ strategy: 'launch', projectPath: '/tmp/project' });
    const reconnectPromise = manager.reconnect({ strategy: 'connect', projectPath: '/tmp/project' });
    const disconnectPromise = manager.disconnect();

    firstDeferred.resolve(
      buildAdapterResult({
        strategyUsed: 'launch',
        miniProgram: firstMiniProgram as any,
      }),
    );

    const connectResult = await connectPromise;
    const reconnectResult = await reconnectPromise;
    const finalStatus = await disconnectPromise;

    expect(connectResult.strategyUsed).toBe('launch');
    expect(reconnectResult.strategyUsed).toBe('connect');
    expect(vi.mocked(executeConnectionStrategy)).toHaveBeenCalledTimes(2);
    expect(firstMiniProgram.disconnect).toHaveBeenCalledTimes(1);
    expect(secondMiniProgram.disconnect).toHaveBeenCalledTimes(1);
    expect(finalStatus.state).toBe('disconnected');
    expect(manager.getStatusSnapshot().state).toBe('disconnected');
  });
});
