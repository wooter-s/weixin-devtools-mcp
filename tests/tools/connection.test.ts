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
    getLines: () => lines,
  };
}

describe('connection tools', () => {
  const mockCurrentPage = { path: '/pages/home/index' };
  const mockMiniProgram = {
    currentPage: vi.fn(async () => mockCurrentPage),
    removeAllListeners: vi.fn(),
    on: vi.fn(),
    evaluate: vi.fn(async () => undefined),
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
    expect(mockMiniProgram.removeAllListeners).toHaveBeenCalledWith('console');
    expect(mockMiniProgram.on).toHaveBeenCalledWith('console', expect.any(Function));
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
      .rejects.toThrow('请先连接到微信开发者工具');
  });
});
