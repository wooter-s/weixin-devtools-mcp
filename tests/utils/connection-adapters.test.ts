import automator from 'miniprogram-automator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeConnectionStrategy } from '../../src/connection/adapters.js';
import { ProjectStartup } from '../../src/connection/project-startup.js';
import type { ConnectionAttemptSpec } from '../../src/connection/types.js';

vi.mock('../../src/connection/automation-probe.js', () => ({ waitForAutomation: vi.fn(async () => undefined) }));

vi.mock('miniprogram-automator', () => ({
  default: {
    connect: vi.fn(),
    launch: vi.fn(),
  },
}));

function wsAttempt(): ConnectionAttemptSpec {
  return {
    method: 'wsEndpoint',
    target: {
      kind: 'wsEndpoint',
      endpoint: 'ws://127.0.0.1:9420',
    },
  };
}

describe('connection adapters candidate cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('wsEndpoint 已建立但页面不可用时断开候选连接', async () => {
    const miniProgram = {
      currentPage: vi.fn(async () => null),
      disconnect: vi.fn(async () => undefined),
    };
    vi.mocked(automator.connect).mockResolvedValue(miniProgram as never);

    await expect(executeConnectionStrategy(wsAttempt(), 1_000))
      .rejects.toThrow('currentPage 不可用');

    expect(miniProgram.disconnect).toHaveBeenCalledOnce();
  });

  it('wsEndpoint 成功返回时保持候选连接活动并透传 attempt timeout', async () => {
    const page = { path: '/pages/home/index' };
    const miniProgram = {
      currentPage: vi.fn(async () => page),
      disconnect: vi.fn(async () => undefined),
    };
    vi.mocked(automator.connect).mockResolvedValue(miniProgram as never);

    const result = await executeConnectionStrategy(wsAttempt(), 1_234);

    expect(result.miniProgram).toBe(miniProgram);
    expect(result.pagePath).toBe('/pages/home/index');
    expect(automator.connect).toHaveBeenCalledWith({
      wsEndpoint: 'ws://127.0.0.1:9420',
      timeout: 1_234,
    });
    expect(miniProgram.disconnect).not.toHaveBeenCalled();
  });

  it('project launch 使用固定 autoPort 时补全可复用 endpoint', async () => {
    const page = { path: '/pages/home/index' };
    const miniProgram = {
      currentPage: vi.fn(async () => page),
      disconnect: vi.fn(async () => undefined),
    };
    vi.spyOn(ProjectStartup.prototype, 'connect').mockResolvedValue({
      miniProgram, currentPage: page, pagePath: page.path,
      connectionMode: 'launch', startupTime: 1, healthStatus: 'healthy',
      processInfo: { pid: 100, port: 19420 },
    });

    const result = await executeConnectionStrategy({
      method: 'launch',
      target: {
        kind: 'project',
        projectPath: process.cwd(),
        autoPort: 19420,
      },
    }, 1_000);

    expect(result.endpoint).toBe('ws://127.0.0.1:19420');
  });

  it('可信 project endpoint 仅在 connect attempt 中直接复用', async () => {
    const page = { path: '/pages/home/index' };
    const miniProgram = {
      currentPage: vi.fn(async () => page),
      disconnect: vi.fn(async () => undefined),
    };
    vi.mocked(automator.connect).mockResolvedValue(miniProgram as never);
    const attempt: ConnectionAttemptSpec = {
      method: 'connect',
      target: {
        kind: 'project',
        projectPath: process.cwd(),
        autoPort: 19420,
      },
    };

    const result = await executeConnectionStrategy(attempt, 1_000, {
      trustedProjectEndpoint: 'ws://127.0.0.1:19420',
    });

    expect(result.strategyUsed).toBe('connect');
    expect(result.endpoint).toBe('ws://127.0.0.1:19420');
    expect(automator.connect).toHaveBeenCalledWith({
      wsEndpoint: 'ws://127.0.0.1:19420',
      timeout: expect.any(Number),
    });
    expect(automator.launch).not.toHaveBeenCalled();
  });

  it('中英文会话冲突均映射为 SESSION_CONFLICT', async () => {
    vi.spyOn(ProjectStartup.prototype, 'connect').mockRejectedValueOnce(new Error('自动化会话冲突'));

    await expect(executeConnectionStrategy({
      method: 'launch',
      target: {
        kind: 'project',
        projectPath: process.cwd(),
      },
    }, 1_000)).rejects.toMatchObject({ code: 'SESSION_CONFLICT' });
  });
});
