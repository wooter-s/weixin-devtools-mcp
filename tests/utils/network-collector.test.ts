import { describe, expect, it, vi } from 'vitest';

import { NetworkCollector } from '../../src/collectors/NetworkCollector.js';

function createMiniProgram() {
  const evaluate = vi.fn(async (_fn: unknown): Promise<unknown> => undefined);
  const mockWxMethod = vi.fn(async (_method: string, _handler: unknown): Promise<void> => undefined);
  const restoreWxMethod = vi.fn(async (_method: string): Promise<void> => undefined);
  return {
    evaluate,
    mockWxMethod,
    restoreWxMethod,
  };
}

describe('NetworkCollector remote lifecycle', () => {
  it('同一实例重复启动只安装一套 wx 拦截器', async () => {
    const miniProgram = createMiniProgram();
    const collector = new NetworkCollector();

    await collector.startRemoteMonitoring(miniProgram as never);
    await collector.startRemoteMonitoring(miniProgram as never);

    expect(miniProgram.mockWxMethod.mock.calls.map(call => call[0])).toEqual([
      'request',
      'uploadFile',
      'downloadFile',
    ]);
    expect(collector.isMonitoring()).toBe(true);
  });

  it('停止监听会恢复全部 wx 方法并可清空远端日志', async () => {
    const miniProgram = createMiniProgram();
    miniProgram.evaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(2);
    const collector = new NetworkCollector();
    await collector.startRemoteMonitoring(miniProgram as never);

    const cleared = await collector.stopRemoteMonitoring({ clearLogs: true });

    expect(miniProgram.restoreWxMethod.mock.calls.map(call => call[0])).toEqual([
      'request',
      'uploadFile',
      'downloadFile',
    ]);
    expect(cleared).toBe(2);
    expect(collector.isMonitoring()).toBe(false);
  });

  it('部分安装失败时回滚已经模拟的方法', async () => {
    const miniProgram = createMiniProgram();
    miniProgram.mockWxMethod
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('upload mock failed'));
    const collector = new NetworkCollector();

    await expect(collector.startRemoteMonitoring(miniProgram as never))
      .rejects.toThrow('upload mock failed');

    expect(miniProgram.restoreWxMethod).toHaveBeenCalledOnce();
    expect(miniProgram.restoreWxMethod).toHaveBeenCalledWith('request');
    expect(collector.isMonitoring()).toBe(false);
  });

  it('恢复失败会保留所有权并允许下一次停止重试', async () => {
    const miniProgram = createMiniProgram();
    miniProgram.restoreWxMethod.mockImplementationOnce(async () => {
      throw new Error('restore failed');
    });
    const collector = new NetworkCollector();
    await collector.startRemoteMonitoring(miniProgram as never);

    await expect(collector.stopRemoteMonitoring()).rejects.toThrow('恢复 wx 方法失败');
    expect(collector.isMonitoring()).toBe(false);

    await expect(collector.stopRemoteMonitoring()).resolves.toBe(0);
    expect(miniProgram.restoreWxMethod).toHaveBeenCalledTimes(4);
  });

  it('远程日志同步失败时向上抛错，不会伪装成新增 0 条', async () => {
    const miniProgram = createMiniProgram();
    const collector = new NetworkCollector();
    await collector.startRemoteMonitoring(miniProgram as never);
    const syncError = new Error('connection lost');
    miniProgram.evaluate.mockRejectedValueOnce(syncError);

    await expect(collector.syncFromRemote(true)).rejects.toBe(syncError);
  });

  it('相同逻辑 request id 只保留一条并就地更新', () => {
    const collector = new NetworkCollector();
    const firstId = collector.addRequest({
      id: 'req-1',
      type: 'request',
      url: 'http://127.0.0.1/start',
      timestamp: '2026-01-01T00:00:00.000Z',
      success: false,
      pending: true,
    });
    const secondId = collector.addRequest({
      id: 'req-1',
      type: 'request',
      url: 'http://127.0.0.1/start',
      timestamp: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:00.100Z',
      statusCode: 200,
      success: true,
      pending: false,
    });

    expect(secondId).toBe(firstId);
    expect(collector.getRequests()).toHaveLength(1);
    expect(collector.getRequestById('req-1')).toMatchObject({
      statusCode: 200,
      success: true,
      pending: false,
    });
  });

  it('拦截器把 origin 返回的 RequestTask 原样返回给业务代码', async () => {
    const handlers = new Map<string, (this: { origin: () => unknown }, options: object) => unknown>();
    const miniProgram = createMiniProgram();
    miniProgram.mockWxMethod.mockImplementation(async (method: string, handler: unknown) => {
      handlers.set(method, handler as (this: { origin: () => unknown }, options: object) => unknown);
    });
    const collector = new NetworkCollector();
    await collector.startRemoteMonitoring(miniProgram as never);
    const requestTask = { abort: vi.fn() };

    const returned = handlers.get('request')!.call(
      { origin: () => requestTask },
      { url: 'http://127.0.0.1/test' },
    );

    expect(returned).toBe(requestTask);
  });
});
