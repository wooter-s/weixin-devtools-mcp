import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  listNetworkRequestsTool,
  getNetworkRequestTool,
  stopNetworkMonitoringTool,
  clearNetworkRequestsTool,
} from '../../src/tools/network.js';

function createMockResponse() {
  const lines: string[] = [];
  return {
    appendResponseLine: vi.fn((line: string) => {
      lines.push(line);
    }),
    setIncludeSnapshot: vi.fn(),
    attachImage: vi.fn(),
    getLines: () => lines,
    getResponseText: () => lines.join('\n'),
  };
}

function createBaseContext() {
  const requests = [
    {
      id: 'req_1',
      type: 'request' as const,
      method: 'GET',
      url: 'https://api.example.com/users',
      timestamp: '2026-01-01T00:00:02.000Z',
      statusCode: 200,
      duration: 120,
      success: true,
      pending: false,
      headers: { accept: 'application/json' },
      data: { q: 'test' },
      response: { ok: true },
      responseHeaders: { 'content-type': 'application/json' },
      completedAt: '2026-01-01T00:00:02.120Z',
    },
    {
      id: 'req_2',
      type: 'uploadFile' as const,
      method: 'POST',
      url: 'https://api.example.com/upload',
      timestamp: '2026-01-01T00:00:01.000Z',
      statusCode: 500,
      duration: 80,
      success: false,
      pending: false,
      error: 'internal error',
    },
  ];

  const collector = {
    syncFromRemote: vi.fn(async () => 2),
    getRequests: vi.fn(() => requests),
    getCurrentCount: vi.fn(() => requests.length),
  };

  return {
    miniProgram: {
      evaluate: vi.fn(async () => 0),
    },
    networkStorage: {
      requests: [],
      isMonitoring: true,
      startTime: '2026-01-01T00:00:00.000Z',
      originalMethods: {},
    },
    getNetworkCollector: vi.fn(() => collector),
    clearNetworkRequests: vi.fn(),
    __collector: collector,
    __requests: requests,
  };
}

describe('network tools', () => {
  let context: ReturnType<typeof createBaseContext>;

  beforeEach(() => {
    context = createBaseContext();
  });

  it('list_network_requests 返回分页列表并提示下一步', async () => {
    const response = createMockResponse();

    await listNetworkRequestsTool.handler(
      {
        params: {
          pageSize: 10,
          pageIdx: 0,
          includePreservedRequests: false,
          successOnly: false,
          failedOnly: false,
        },
      },
      response as any,
      context as any
    );

    const text = response.getResponseText();
    expect(text).toContain('Network Requests (List View)');
    expect(text).toContain('reqid=req_1');
    expect(text).toContain('reqid=req_2');
    expect(text).toContain('提示: 使用 get_network_request 结合 reqid 查看完整详情');
    expect(context.__collector.syncFromRemote).toHaveBeenCalledWith(true);
  });

  it('list_network_requests 支持类型过滤与失败过滤', async () => {
    const response = createMockResponse();

    await listNetworkRequestsTool.handler(
      {
        params: {
          pageSize: 10,
          pageIdx: 0,
          resourceTypes: ['uploadFile'],
          failedOnly: true,
          includePreservedRequests: false,
          successOnly: false,
        },
      },
      response as any,
      context as any
    );

    const text = response.getResponseText();
    expect(text).toContain('reqid=req_2');
    expect(text).not.toContain('reqid=req_1');
  });

  it('list_network_requests 在 successOnly 和 failedOnly 同时为 true 时抛错', async () => {
    const response = createMockResponse();

    await expect(
      listNetworkRequestsTool.handler(
        {
          params: {
            pageSize: 10,
            pageIdx: 0,
            includePreservedRequests: false,
            successOnly: true,
            failedOnly: true,
          },
        },
        response as any,
        context as any
      )
    ).rejects.toThrow('successOnly 与 failedOnly 不能同时为 true');
  });

  it('get_network_request 返回指定 reqid 的详情', async () => {
    const response = createMockResponse();

    await getNetworkRequestTool.handler(
      {
        params: {
          reqid: 'req_1',
        },
      },
      response as any,
      context as any
    );

    const text = response.getResponseText();
    expect(text).toContain('Network Request (Detail View)');
    expect(text).toContain('ID: req_1');
    expect(text).toContain('URL: https://api.example.com/users');
    expect(text).toContain('响应数据: {"ok":true}');
  });

  it('get_network_request 未找到 reqid 时抛错', async () => {
    const response = createMockResponse();

    await expect(
      getNetworkRequestTool.handler(
        {
          params: {
            reqid: 'missing-id',
          },
        },
        response as any,
        context as any
      )
    ).rejects.toThrow('未找到 reqid=missing-id 的请求');
  });

  it('stop_network_monitoring 会禁用拦截并更新状态', async () => {
    const response = createMockResponse();

    await stopNetworkMonitoringTool.handler(
      {
        params: {
          clearLogs: false,
        },
      },
      response as any,
      context as any
    );

    expect(context.networkStorage.isMonitoring).toBe(false);
    expect(context.miniProgram.evaluate).toHaveBeenCalled();
    expect(response.getResponseText()).toContain('网络监听已停止');
  });

  it('clear_network_requests 清空本地并可选清空远程', async () => {
    const response = createMockResponse();
    context.miniProgram.evaluate = vi.fn(async () => 5);

    await clearNetworkRequestsTool.handler(
      {
        params: {
          clearRemote: true,
        },
      },
      response as any,
      context as any
    );

    expect(context.clearNetworkRequests).toHaveBeenCalledTimes(1);
    expect(context.miniProgram.evaluate).toHaveBeenCalled();
    expect(response.getResponseText()).toContain('网络请求记录已清空');
    expect(response.getResponseText()).toContain('远程清空: 5 条');
  });

  it('未连接时应拒绝执行网络工具', async () => {
    const response = createMockResponse();
    context.miniProgram = null;

    await expect(
      listNetworkRequestsTool.handler(
        {
          params: {
            pageSize: 10,
            pageIdx: 0,
            includePreservedRequests: false,
            successOnly: false,
            failedOnly: false,
          },
        },
        response as any,
        context as any
      )
    ).rejects.toThrow('请先连接到微信开发者工具');
  });
});
