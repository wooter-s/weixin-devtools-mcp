import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/connection/adapters.js', () => ({
  executeConnectionStrategy: vi.fn(),
}));

vi.mock('../../src/connection/health-probe.js', () => ({
  probeConnectionHealth: vi.fn(),
}));

import { executeConnectionStrategy } from '../../src/connection/adapters.js';
import { ConnectionAttemptsExhaustedError } from '../../src/connection/errors.js';
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

  it('只返回一次连接执行结果和可复用的完整 target，不保存运行时状态', async () => {
    vi.mocked(executeConnectionStrategy).mockResolvedValue(buildAdapterResult());

    const manager = new ConnectionManager();
    const execution = await manager.connect({
      target: { kind: 'project', projectPath: process.cwd() },
    });

    expect(execution.result.status).toBe('connected');
    expect(execution.result.connectionId).toContain('conn_');
    expect(execution.result.attempts).toMatchObject([
      { index: 1, method: 'launch', outcome: 'connected', error: null },
    ]);
    expect(execution.reconnectRequest.target).toMatchObject({
      kind: 'project',
      projectPath: process.cwd(),
    });
    expect(execution.reconnectRequest.timeoutMs).toBe(45_000);
    expect('getSession' in manager).toBe(false);
    expect('getStatusSnapshot' in manager).toBe(false);
  });

  it('project 的 launch 失败后只尝试 connect，并保留完整历史', async () => {
    vi.mocked(executeConnectionStrategy)
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockResolvedValueOnce(buildAdapterResult({ strategyUsed: 'connect' }));

    const execution = await new ConnectionManager().connect({
      target: { kind: 'project', projectPath: process.cwd() },
    });

    expect(execution.result.strategyUsed).toBe('connect');
    expect(execution.result.warnings).toEqual(['[launch] launch failed']);
    expect(execution.result.attempts).toMatchObject([
      { index: 1, method: 'launch', outcome: 'failed' },
      { index: 2, method: 'connect', outcome: 'connected' },
    ]);
    expect(vi.mocked(executeConnectionStrategy).mock.calls.map(call => call[0].method))
      .toEqual(['launch', 'connect']);
  });

  it('候选连接健康检查失败时先清理，再执行 connect attempt', async () => {
    const events: string[] = [];
    const firstMiniProgram = {
      disconnect: vi.fn(async () => {
        events.push('first-disconnect');
      }),
    };

    vi.mocked(executeConnectionStrategy).mockImplementation(async attempt => {
      events.push(`attempt-${attempt.method}`);
      if (attempt.method === 'launch') {
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
      target: { kind: 'project', projectPath: process.cwd() },
    });

    expect(execution.result.strategyUsed).toBe('connect');
    expect(firstMiniProgram.disconnect).toHaveBeenCalledOnce();
  });

  it('所有 attempts 失败时抛出带完整历史的 typed exhausted error', async () => {
    vi.mocked(executeConnectionStrategy)
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockRejectedValueOnce(new Error('connect failed'));

    let thrown: unknown;
    try {
      await new ConnectionManager().connect({
        target: { kind: 'project', projectPath: process.cwd() },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConnectionAttemptsExhaustedError);
    expect(thrown).toMatchObject({
      code: 'CONNECTION_FAILED',
      attempts: [
        { method: 'launch', outcome: 'failed' },
        { method: 'connect', outcome: 'failed' },
      ],
      lastError: { message: 'connect failed' },
    });
  });

  it('endpoint target 失败后不会隐式回退到 discover 或 project', async () => {
    vi.mocked(executeConnectionStrategy).mockRejectedValue(new Error('endpoint failed'));

    await expect(new ConnectionManager().connect({
      target: { kind: 'wsEndpoint', endpoint: 'ws://127.0.0.1:9420' },
    })).rejects.toBeInstanceOf(ConnectionAttemptsExhaustedError);

    expect(executeConnectionStrategy).toHaveBeenCalledOnce();
    expect(vi.mocked(executeConnectionStrategy).mock.calls[0]?.[0].method).toBe('wsEndpoint');
  });

  it('attempt 超时后不启动下一策略，并清理迟到成功的候选连接', async () => {
    const lateMiniProgram = {
      ...createMockMiniProgram(),
      close: vi.fn(async () => undefined),
    };
    let resolveAttempt: ((result: AdapterConnectionResult) => void) | undefined;
    vi.mocked(executeConnectionStrategy).mockImplementationOnce(() =>
      new Promise<AdapterConnectionResult>(resolve => {
        resolveAttempt = resolve;
      })
    );

    const manager = new ConnectionManager();
    const connection = manager.connect({
      target: { kind: 'project', projectPath: process.cwd() },
      timeoutMs: 10,
      healthCheck: false,
    });

    await expect(connection).rejects.toMatchObject({
      attempts: [{ method: 'launch', error: { code: 'CONNECTION_TIMEOUT' } }],
    });
    expect(executeConnectionStrategy).toHaveBeenCalledOnce();

    resolveAttempt?.(buildAdapterResult({ miniProgram: lateMiniProgram as never }));
    await vi.waitFor(() => {
      expect(lateMiniProgram.close).toHaveBeenCalledOnce();
    });
    expect(lateMiniProgram.disconnect).not.toHaveBeenCalled();
    expect(executeConnectionStrategy).toHaveBeenCalledOnce();
  });

  it('迟到的 connect 候选只断开 transport，不关闭既有 DevTools', async () => {
    const lateMiniProgram = {
      ...createMockMiniProgram(),
      close: vi.fn(async () => undefined),
    };
    let resolveConnect: ((result: AdapterConnectionResult) => void) | undefined;
    vi.mocked(executeConnectionStrategy)
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockImplementationOnce(() => new Promise<AdapterConnectionResult>(resolve => {
        resolveConnect = resolve;
      }));

    const connection = new ConnectionManager().connect({
      target: { kind: 'project', projectPath: process.cwd() },
      timeoutMs: 10,
      healthCheck: false,
    });

    await expect(connection).rejects.toMatchObject({
      attempts: [
        { method: 'launch' },
        { method: 'connect', error: { code: 'CONNECTION_TIMEOUT' } },
      ],
    });
    expect(executeConnectionStrategy).toHaveBeenCalledTimes(2);

    resolveConnect?.(buildAdapterResult({
      strategyUsed: 'connect',
      miniProgram: lateMiniProgram as never,
    }));
    await vi.waitFor(() => {
      expect(lateMiniProgram.disconnect).toHaveBeenCalledOnce();
    });
    expect(lateMiniProgram.close).not.toHaveBeenCalled();
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
