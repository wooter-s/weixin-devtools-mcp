/**
 * connection.ts 工具测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ValidationConnectionError } from '../../src/connection/errors.js';
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
    bindConsoleAndExceptionListeners: vi.fn(),
    addConsoleMessage: vi.fn(() => 1),
    addExceptionMessage: vi.fn(() => 2),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
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
      warnings: [],
    });

    await connectDevtoolsTool.handler({
      params: {
        strategy: 'launch',
        projectPath: '/tmp/demo',
      },
    }, response as any, mockContext);

    expect(mockContext.connectDevtools).toHaveBeenCalledWith({
      strategy: 'launch',
      projectPath: '/tmp/demo',
      cliPath: undefined,
      autoPort: undefined,
      browserUrl: undefined,
      wsEndpoint: undefined,
      wsHeaders: undefined,
      timeoutMs: undefined,
      fallback: undefined,
      healthCheck: undefined,
      autoDiscover: undefined,
      verbose: undefined,
      autoAudits: undefined,
    });
    expect(response.getLines().join('\n')).toContain('✅ 连接成功');
    expect(response.getLines().join('\n')).toContain('连接ID: conn_1');
    expect(response.getLines().join('\n')).toContain('策略: launch');
    expect(mockContext.bindConsoleAndExceptionListeners).toHaveBeenCalledWith({
      consoleHandler: expect.any(Function),
      exceptionHandler: expect.any(Function),
    });
  });

  it('connect_devtools 应优先通过 addConsoleMessage/addExceptionMessage 写入监听数据', async () => {
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
      warnings: [],
    });

    await connectDevtoolsTool.handler({
      params: {
        strategy: 'launch',
        projectPath: '/tmp/demo',
      },
    }, response as any, mockContext);

    const handlers = mockContext.bindConsoleAndExceptionListeners.mock.calls[0]?.[0];
    expect(handlers).toBeDefined();

    handlers.consoleHandler({ type: 'info', args: ['hello'] });
    handlers.exceptionHandler({ message: 'boom' });

    expect(mockContext.addConsoleMessage).toHaveBeenCalledTimes(1);
    expect(mockContext.addExceptionMessage).toHaveBeenCalledTimes(1);
  });

  it('重连时若拦截器已安装也应复位 disabled 状态', async () => {
    const response = createMockResponse();
    const wxRuntime = {
      __networkInterceptorsInstalled: true,
      __networkInterceptorsDisabled: true,
    };
    (globalThis as typeof globalThis & { wx?: unknown }).wx = wxRuntime;

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
      warnings: [],
    });

    try {
      await connectDevtoolsTool.handler({
        params: {
          strategy: 'discover',
          projectPath: '/tmp/demo',
        },
      }, response as any, mockContext);
    } finally {
      delete (globalThis as typeof globalThis & { wx?: unknown }).wx;
    }

    expect(wxRuntime.__networkInterceptorsDisabled).toBe(false);
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
      health: { level: 'degraded', checks: [{ name: 'page', status: 'fail' }], checkedAt: '2026-01-01T00:00:00.000Z' },
      lastError: null,
    });

    await getConnectionStatusTool.handler({
      params: {
        refreshHealth: true,
      },
    }, response as any, mockContext);

    expect(mockContext.getConnectionStatus).toHaveBeenCalledWith({ refreshHealth: true });
    expect(response.getLines().join('\n')).toContain('连接状态: degraded');
    expect(response.getLines().join('\n')).toContain('已连接: 是');
  });

  it('get_current_page 在未连接时应报错', async () => {
    const response = createMockResponse();
    await expect(getCurrentPageTool.handler({ params: {} }, response as any, mockContext))
      .rejects.toThrow('请先连接到微信开发者工具。使用 connect_devtools 工具建立连接。');
  });

  it('connect_devtools 应透传 wsHeaders 契约错误信息', async () => {
    const response = createMockResponse();
    const contractError = new ValidationConnectionError(
      '当前连接链路不支持 wsHeaders 参数',
      ['请移除 wsHeaders 参数后重试'],
      { strategy: 'wsEndpoint' },
    );

    mockContext.connectDevtools.mockRejectedValue(contractError);

    await expect(connectDevtoolsTool.handler({
      params: {
        strategy: 'wsEndpoint',
        wsEndpoint: 'ws://127.0.0.1:9420',
        wsHeaders: {
          authorization: 'Bearer token',
        },
      },
    }, response as any, mockContext)).rejects.toThrow('当前连接链路不支持 wsHeaders 参数');

    expect(mockContext.connectDevtools).toHaveBeenCalledWith({
      strategy: 'wsEndpoint',
      projectPath: undefined,
      cliPath: undefined,
      autoPort: undefined,
      browserUrl: undefined,
      wsEndpoint: 'ws://127.0.0.1:9420',
      wsHeaders: {
        authorization: 'Bearer token',
      },
      timeoutMs: undefined,
      fallback: undefined,
      healthCheck: undefined,
      autoDiscover: undefined,
      verbose: undefined,
      autoAudits: undefined,
    });
  });

  describe('错误路径测试', () => {
    it('connect_devtools 连接失败时应抛出错误', async () => {
      const response = createMockResponse();
      mockContext.connectDevtools.mockRejectedValue(new Error('连接超时'));

      await expect(connectDevtoolsTool.handler({
        params: {
          strategy: 'launch',
          projectPath: '/tmp/demo',
        },
      }, response as any, mockContext)).rejects.toThrow('连接超时');
    });

    it('reconnect_devtools 重连失败时应抛出错误', async () => {
      const response = createMockResponse();
      mockContext.reconnectDevtools.mockRejectedValue(new Error('重连失败: 无可用端点'));

      await expect(reconnectDevtoolsTool.handler(
        { params: {} },
        response as any,
        mockContext,
      )).rejects.toThrow('重连失败');
    });

    it('disconnect_devtools 断开失败时应抛出错误', async () => {
      const response = createMockResponse();
      mockContext.disconnectDevtools.mockRejectedValue(new Error('断开连接失败'));

      await expect(disconnectDevtoolsTool.handler(
        { params: {} },
        response as any,
        mockContext,
      )).rejects.toThrow('断开连接失败');
    });

    it('get_connection_status 获取状态失败时应抛出错误', async () => {
      const response = createMockResponse();
      mockContext.getConnectionStatus.mockRejectedValue(new Error('状态查询失败'));

      await expect(getConnectionStatusTool.handler({
        params: { refreshHealth: true },
      }, response as any, mockContext)).rejects.toThrow('状态查询失败');
    });
  });
});
