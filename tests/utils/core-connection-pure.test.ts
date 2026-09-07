import net from 'node:net';

import automator from 'miniprogram-automator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectDevtoolsEnhanced } from '../../src/core/connection.js';

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

  it('不再执行会隐式回退的 auto 模式', async () => {
    await expect(connectDevtoolsEnhanced({
      projectPath: process.cwd(),
      mode: 'auto',
    })).rejects.toThrow('auto 模式已移除');

    expect(automator.launch).not.toHaveBeenCalled();
    expect(automator.connect).not.toHaveBeenCalled();
  });

  it('connect 模式遇到预先占用端口时拒绝附着未知项目', async () => {
    const server = net.createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('测试 TCP server 未返回端口');
    }

    try {
      await expect(connectDevtoolsEnhanced({
        projectPath: process.cwd(),
        mode: 'connect',
        cliPath: process.execPath,
        autoPort: address.port,
        timeout: 1_000,
      })).rejects.toThrow('无法验证其项目归属');
      expect(automator.connect).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  });
});
