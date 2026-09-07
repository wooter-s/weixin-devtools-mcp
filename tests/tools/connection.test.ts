/**
 * connection.ts 工具测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  connectDevtoolsTool,
  disconnectDevtoolsTool,
  getConnectionStatusTool,
  getCurrentPageTool,
  reconnectDevtoolsTool,
} from '../../src/tools/connection.js';

function createMockResponse() {
  const lines: string[] = [];
  return {
    appendResponseLine: vi.fn((line: string) => {
      lines.push(line);
    }),
    setIncludeSnapshot: vi.fn(),
    attachImage: vi.fn(),
    shouldIncludeSnapshot: vi.fn(() => false),
    mergeStructuredContent: vi.fn(),
    getStructuredContent: vi.fn(() => ({})),
    getLines: () => lines,
  };
}

describe('connection tools', () => {
  const mockCurrentPage = { path: '/pages/home/index' };
  const mockMiniProgram = {
    currentPage: vi.fn(async () => mockCurrentPage),
    off: vi.fn(),
    on: vi.fn(),
    evaluate: vi.fn(async (fn?: () => unknown) => {
      if (typeof fn === 'function') {
        return fn();
      }
      return undefined;
    }),
    removeAllListeners: vi.fn(),
  };

  const mockContext = {
    miniProgram: null as any,
    currentPage: null as any,
    elementMap: new Map(),
    consoleStorage: {
      navigations: [{ messages: [], exceptions: [] }],
      messageIdMap: new Map<number, any>(),
      isMonitoring: false,
      startTime: null,
    },
    networkStorage: {
      requests: [],
      isMonitoring: false,
      startTime: null,
      originalMethods: {},
    },
    connectionStatus: {
      state: 'disconnected',
      connected: false,
      hasCurrentPage: false,
    },
    connectDevtools: vi.fn(),
    reconnectDevtools: vi.fn(),
    disconnectDevtools: vi.fn(),
    getConnectionStatus: vi.fn(),
    getPageRevision: vi.fn(() => 1),
    getRuntimeStatus: vi.fn(() => ({
      toolProfile: {
        profile: 'full',
        activeToolCount: 31,
        disabledToolCount: 0,
        activeCategories: ['core', 'console', 'network', 'debug'],
        inactiveCategories: [],
      },
      monitoring: {
        console: { enabled: true, state: 'running', startedAt: '2026-01-01T00:00:00.000Z', lastError: null },
        network: { enabled: true, state: 'running', startedAt: '2026-01-01T00:00:00.000Z', lastError: null },
      },
    })),
    startAutomaticMonitoring: vi.fn(async () => ({
      consoleStarted: true,
      networkStarted: true,
      warnings: [],
    })),
    bindConsoleAndExceptionListeners: vi.fn(),
    addConsoleMessage: vi.fn(() => 1),
    addExceptionMessage: vi.fn(() => 2),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    delete mockContext.withPageStateOperation;
    delete mockContext.syncCurrentPage;
    mockContext.miniProgram = null;
    mockContext.currentPage = null;
    mockContext.elementMap.clear();
    mockContext.consoleStorage = {
      navigations: [{ messages: [], exceptions: [] }],
      messageIdMap: new Map<number, any>(),
      isMonitoring: false,
      startTime: null,
    };
    mockContext.networkStorage = {
      requests: [],
      isMonitoring: false,
      startTime: null,
      originalMethods: {},
    };
    mockContext.addConsoleMessage.mockReset();
    mockContext.addConsoleMessage.mockReturnValue(1);
    mockContext.addExceptionMessage.mockReset();
    mockContext.addExceptionMessage.mockReturnValue(2);
    mockContext.startAutomaticMonitoring.mockReset();
    mockContext.startAutomaticMonitoring.mockResolvedValue({
      consoleStarted: true,
      networkStarted: true,
      warnings: [],
    });
  });

  it('connect_devtools 应该调用 context.connectDevtools 并输出摘要', async () => {
    const response = createMockResponse();
    mockContext.connectDevtools.mockResolvedValue({
      connectionId: 'conn_1',
      strategyUsed: 'launch',
      endpoint: 'ws://127.0.0.1:9420',
      miniProgram: mockMiniProgram,
      currentPage: mockCurrentPage,
      pagePath: '/pages/home/index',
      health: { level: 'healthy', checks: [], checkedAt: '2026-01-01T00:00:00.000Z' },
      status: 'connected',
      timing: { totalMs: 1200, connectMs: 1000, healthMs: 200 },
      attempts: [],
      warnings: [],
    });

    await connectDevtoolsTool.handler(
      {
        params: {
          target: { kind: 'project', projectPath: '/tmp/demo' },
          timeoutMs: 45_000,
          healthCheck: true,
        },
      },
      response as any,
      mockContext
    );

    expect(mockContext.connectDevtools).toHaveBeenCalledWith({
      target: { kind: 'project', projectPath: '/tmp/demo' },
      timeoutMs: 45_000,
      healthCheck: true,
    });
    expect(response.getLines().join('\n')).toContain('✅ 连接成功');
    expect(response.getLines().join('\n')).toContain('连接ID: conn_1');
    expect(response.getLines().join('\n')).toContain('方式: launch');
    expect(mockContext.startAutomaticMonitoring).not.toHaveBeenCalled();
  });

  it('connect_devtools 不应在工具 handler 中重复启动监听', async () => {
    const response = createMockResponse();
    mockContext.connectDevtools.mockResolvedValue({
      connectionId: 'conn_3',
      strategyUsed: 'launch',
      endpoint: 'ws://127.0.0.1:9420',
      miniProgram: mockMiniProgram,
      currentPage: mockCurrentPage,
      pagePath: '/pages/home/index',
      health: { level: 'healthy', checks: [], checkedAt: '2026-01-01T00:00:00.000Z' },
      status: 'connected',
      timing: { totalMs: 1000, connectMs: 850, healthMs: 150 },
      attempts: [],
      warnings: [],
    });

    await connectDevtoolsTool.handler(
      {
        params: {
          target: { kind: 'project', projectPath: '/tmp/demo' },
          timeoutMs: 45_000,
          healthCheck: true,
        },
      },
      response as any,
      mockContext
    );

    expect(mockContext.startAutomaticMonitoring).not.toHaveBeenCalled();
    expect(mockMiniProgram.evaluate).not.toHaveBeenCalled();
  });

  it('connect_devtools 应脱敏公开输出且不修改内部连接结果', async () => {
    const response = createMockResponse();
    const rawResult = {
      connectionId: 'conn_sensitive',
      strategyUsed: 'wsEndpoint',
      endpoint: 'ws://user:pass@127.0.0.1:9420/path?token=endpoint-secret#fragment',
      miniProgram: mockMiniProgram,
      currentPage: mockCurrentPage,
      pagePath: '/pages/home/index?token=page-secret#fragment',
      health: {
        level: 'degraded',
        checks: [{ name: 'auth', status: 'fail', message: 'password=health-secret' }],
        checkedAt: '2026-01-01T00:00:00.000Z',
      },
      status: 'degraded',
      timing: { totalMs: 10, connectMs: 8, healthMs: 2 },
      attempts: [{
        endpoint: 'ws://attempt:pass@127.0.0.1:9420/path?secret=attempt-secret',
        error: { message: 'Authorization: Bearer bearer-secret' },
      }],
      warnings: ['password=warning-secret'],
    };
    mockContext.connectDevtools.mockResolvedValue(rawResult);

    await connectDevtoolsTool.handler(
      {
        params: {
          target: { kind: 'wsEndpoint', endpoint: rawResult.endpoint },
          timeoutMs: 45_000,
          healthCheck: true,
        },
      },
      response as any,
      mockContext
    );

    const publicData = response.mergeStructuredContent.mock.calls[0]?.[0];
    const publicOutput = JSON.stringify({ lines: response.getLines(), data: publicData });
    expect(publicData).toMatchObject({
      endpoint: 'ws://127.0.0.1:9420/path',
      pagePath: '/pages/home/index',
    });
    expect(publicOutput).not.toMatch(
      /endpoint-secret|page-secret|health-secret|attempt-secret|bearer-secret|warning-secret|user:pass|attempt:pass/u,
    );
    expect(rawResult.endpoint).toContain('user:pass');
    expect(rawResult.attempts[0].error.message).toContain('bearer-secret');
  });

  it('Context 返回监听降级告警时应原样输出', async () => {
    const response = createMockResponse();
    mockContext.startAutomaticMonitoring.mockResolvedValueOnce({
      consoleStarted: true,
      networkStarted: false,
      warnings: ['网络监听启动失败 - mock failure'],
    });

    mockContext.connectDevtools.mockResolvedValue({
      connectionId: 'conn_4',
      strategyUsed: 'discover',
      endpoint: 'ws://127.0.0.1:9420',
      miniProgram: mockMiniProgram,
      currentPage: mockCurrentPage,
      pagePath: '/pages/home/index',
      health: { level: 'healthy', checks: [], checkedAt: '2026-01-01T00:00:00.000Z' },
      status: 'connected',
      timing: { totalMs: 900, connectMs: 700, healthMs: 200 },
      attempts: [],
      warnings: ['网络监听启动失败 - mock failure'],
    });

    await connectDevtoolsTool.handler(
      {
        params: {
          target: { kind: 'discover' },
          timeoutMs: 45_000,
          healthCheck: true,
        },
      },
      response as any,
      mockContext
    );

    expect(response.getLines().join('\n')).toContain('网络监听启动失败 - mock failure');
  });

  it('reconnect_devtools 应支持无参数重连', async () => {
    const response = createMockResponse();
    mockContext.reconnectDevtools.mockResolvedValue({
      connectionId: 'conn_2',
      strategyUsed: 'discover',
      endpoint: 'ws://127.0.0.1:9420',
      miniProgram: mockMiniProgram,
      currentPage: mockCurrentPage,
      pagePath: '/pages/home/index',
      health: { level: 'healthy', checks: [], checkedAt: '2026-01-01T00:00:00.000Z' },
      status: 'connected',
      timing: { totalMs: 800, connectMs: 650, healthMs: 150 },
      attempts: [],
      warnings: [],
    });

    await reconnectDevtoolsTool.handler({ params: {} }, response as any, mockContext);

    expect(mockContext.reconnectDevtools).toHaveBeenCalledWith();
    expect(response.getLines().join('\n')).toContain('✅ 重连成功');
  });

  it('disconnect_devtools 应调用 context.disconnectDevtools', async () => {
    const response = createMockResponse();
    mockContext.disconnectDevtools.mockResolvedValue({
      state: 'disconnected',
    });

    await disconnectDevtoolsTool.handler({ params: {} }, response as any, mockContext);

    expect(mockContext.disconnectDevtools).toHaveBeenCalledTimes(1);
    expect(response.getLines().join('\n')).toContain('✅ 已断开连接');
  });

  it('get_connection_status 应返回状态摘要', async () => {
    const response = createMockResponse();
    mockContext.getConnectionStatus.mockResolvedValue({
      state: 'degraded',
      connected: true,
      strategyUsed: 'wsEndpoint',
      pagePath: '/pages/home/index',
      health: {
        level: 'degraded',
        checks: [{ name: 'page', status: 'fail' }],
        checkedAt: '2026-01-01T00:00:00.000Z',
      },
      lastError: null,
    });

    await getConnectionStatusTool.handler(
      {
        params: {
          refreshHealth: true,
        },
      },
      response as any,
      mockContext
    );

    expect(mockContext.getConnectionStatus).toHaveBeenCalledWith({ refreshHealth: true });
    expect(response.getLines().join('\n')).toContain('连接状态: degraded');
    expect(response.getLines().join('\n')).toContain('已连接: 是');
  });

  it('get_connection_status 应脱敏 lastError 与端点且保留内部原值', async () => {
    const response = createMockResponse();
    const rawStatus = {
      state: 'degraded',
      connected: true,
      connectionId: 'conn_status',
      strategyUsed: 'wsEndpoint',
      endpoint: 'ws://user:pass@127.0.0.1:9420/path?token=endpoint-secret',
      pagePath: '/pages/home/index?token=page-secret',
      health: null,
      lastError: {
        code: 'PROTOCOL',
        message: 'Authorization: Bearer bearer-secret password=password-secret',
        endpoint: 'ws://error:pass@127.0.0.1:9420/path?secret=error-secret',
      },
    };
    mockContext.getConnectionStatus.mockResolvedValue(rawStatus);

    await getConnectionStatusTool.handler(
      { params: { refreshHealth: false } },
      response as any,
      mockContext
    );

    const publicData = response.mergeStructuredContent.mock.calls[0]?.[0];
    const publicOutput = JSON.stringify({ lines: response.getLines(), data: publicData });
    expect(publicData).toMatchObject({
      endpoint: 'ws://127.0.0.1:9420/path',
      pagePath: '/pages/home/index',
      lastError: {
        endpoint: 'ws://127.0.0.1:9420/path',
      },
    });
    expect(publicOutput).not.toMatch(
      /endpoint-secret|page-secret|bearer-secret|password-secret|error-secret|user:pass|error:pass/u,
    );
    expect(rawStatus.lastError.message).toContain('bearer-secret');
    expect(rawStatus.endpoint).toContain('endpoint-secret');
  });

  it('get_current_page 在未连接时应报错', async () => {
    const response = createMockResponse();
    await expect(
      getCurrentPageTool.handler({ params: {} }, response as any, mockContext)
    ).rejects.toThrow('请先连接到微信开发者工具。使用 connect_devtools 工具建立连接。');
  });

  it('get_current_page 通过 page-state 事务同步活动页面', async () => {
    const response = createMockResponse();
    mockContext.miniProgram = mockMiniProgram;
    mockContext.syncCurrentPage = vi.fn(async () => mockCurrentPage);
    mockContext.withPageStateOperation = vi.fn(async (operation: () => Promise<unknown>) =>
      operation()
    );

    await getCurrentPageTool.handler({ params: {} }, response as any, mockContext);

    expect(mockContext.withPageStateOperation).toHaveBeenCalledOnce();
    expect(mockContext.syncCurrentPage).toHaveBeenCalledOnce();
    expect(response.mergeStructuredContent).toHaveBeenCalledWith({
      pagePath: '/pages/home/index',
      pageRevision: 1,
    });
  });

  it('connect_devtools schema 应拒绝 V1 扁平参数和 wsHeaders', () => {
    expect(connectDevtoolsTool.schema.safeParse({
      strategy: 'wsEndpoint',
      wsEndpoint: 'ws://127.0.0.1:9420',
    }).success).toBe(false);
    expect(connectDevtoolsTool.schema.safeParse({
      target: {
        kind: 'wsEndpoint',
        endpoint: 'ws://127.0.0.1:9420',
        wsHeaders: { authorization: 'Bearer token' },
      },
    }).success).toBe(false);
  });

  describe('错误路径测试', () => {
    it('connect_devtools 连接失败时应抛出错误', async () => {
      const response = createMockResponse();
      mockContext.connectDevtools.mockRejectedValue(new Error('连接超时'));

      await expect(
        connectDevtoolsTool.handler(
          {
            params: {
              target: { kind: 'project', projectPath: '/tmp/demo' },
              timeoutMs: 45_000,
              healthCheck: true,
            },
          },
          response as any,
          mockContext
        )
      ).rejects.toThrow('连接超时');
    });

    it('reconnect_devtools 重连失败时应抛出错误', async () => {
      const response = createMockResponse();
      mockContext.reconnectDevtools.mockRejectedValue(new Error('重连失败: 无可用端点'));

      await expect(
        reconnectDevtoolsTool.handler({ params: {} }, response as any, mockContext)
      ).rejects.toThrow('重连失败');
    });

    it('disconnect_devtools 断开失败时应抛出错误', async () => {
      const response = createMockResponse();
      mockContext.disconnectDevtools.mockRejectedValue(new Error('断开连接失败'));

      await expect(
        disconnectDevtoolsTool.handler({ params: {} }, response as any, mockContext)
      ).rejects.toThrow('断开连接失败');
    });

    it('get_connection_status 获取状态失败时应抛出错误', async () => {
      const response = createMockResponse();
      mockContext.getConnectionStatus.mockRejectedValue(new Error('状态查询失败'));

      await expect(
        getConnectionStatusTool.handler(
          {
            params: { refreshHealth: true },
          },
          response as any,
          mockContext
        )
      ).rejects.toThrow('状态查询失败');
    });
  });
});
