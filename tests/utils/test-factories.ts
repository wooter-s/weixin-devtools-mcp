/**
 * 统一 Mock 工厂
 * 提供标准化的 mock 对象创建函数，消除测试文件中重复的 mock 定义
 */

import { vi } from 'vitest';

import type { MiniProgram, Page } from 'miniprogram-automator';

import type {
  ConnectionStatusSnapshot,
} from '../../src/connection/types.js';
import type {
  ConsoleStorage,
  NetworkStorage,
  ToolContext,
  ToolResponse,
  StructuredContent,
} from '../../src/tools/ToolDefinition.js';

// ─── ToolResponse Mock ───────────────────────────────────────────────

/**
 * 创建带辅助方法的 mock ToolResponse
 * 额外提供 getResponseText() 和 getLines() 用于断言
 */
export function createMockResponse(): ToolResponse & {
  getResponseText(): string;
  getLines(): string[];
} {
  const lines: string[] = [];
  let includeSnapshot = false;
  const images: Array<{ data: string; mimeType: string }> = [];
  let structuredContent: StructuredContent = {};

  return {
    appendResponseLine: vi.fn((text: string) => {
      lines.push(text);
    }),
    setIncludeSnapshot: vi.fn((include: boolean) => {
      includeSnapshot = include;
    }),
    attachImage: vi.fn((data: string, mimeType: string) => {
      images.push({ data, mimeType });
    }),
    shouldIncludeSnapshot: vi.fn(() => includeSnapshot),
    mergeStructuredContent: vi.fn((content: StructuredContent) => {
      structuredContent = { ...structuredContent, ...content };
    }),
    getStructuredContent: vi.fn(() => ({ ...structuredContent })),
    getResponseText: () => lines.join('\n'),
    getLines: () => [...lines],
  };
}

// ─── ConsoleStorage 默认值 ───────────────────────────────────────────

/**
 * 创建默认的 ConsoleStorage
 * 包含一个空的导航会话，监听关闭
 */
export function createDefaultConsoleStorage(): ConsoleStorage {
  return {
    navigations: [
      { messages: [], exceptions: [], timestamp: new Date().toISOString() },
    ],
    messageIdMap: new Map(),
    isMonitoring: false,
    startTime: null,
    maxNavigations: 3,
  };
}

// ─── NetworkStorage 默认值 ───────────────────────────────────────────

/**
 * 创建默认的 NetworkStorage
 * 空请求列表，监听关闭
 */
export function createDefaultNetworkStorage(): NetworkStorage {
  return {
    requests: [],
    isMonitoring: false,
    startTime: null,
    originalMethods: {},
  };
}

// ─── ConnectionStatusSnapshot 默认值 ─────────────────────────────────

/**
 * 创建默认的断开连接状态快照
 * 与 connection/types.ts 中 createDisconnectedStatus() 保持一致
 */
export function createDefaultConnectionStatus(): ConnectionStatusSnapshot {
  return {
    connectionId: null,
    state: 'disconnected',
    strategyUsed: null,
    endpoint: null,
    connected: false,
    hasCurrentPage: false,
    pagePath: null,
    health: null,
    lastError: null,
    lastConnectedAt: null,
    lastHealthCheckAt: null,
  };
}

// ─── ToolContext Mock ─────────────────────────────────────────────────

/**
 * 创建完整的 mock ToolContext
 * 所有方法均为 vi.fn()，可通过 overrides 覆盖任意字段
 */
export function createMockContext(
  overrides?: Partial<ToolContext>,
): ToolContext {
  return {
    miniProgram: null,
    currentPage: null,
    elementMap: new Map(),
    consoleStorage: createDefaultConsoleStorage(),
    networkStorage: createDefaultNetworkStorage(),
    connectionStatus: createDefaultConnectionStatus(),
    getNetworkCollector: vi.fn(() => ({
      syncFromRemote: vi.fn(async () => 0),
      getRequests: vi.fn(() => []),
      getCurrentCount: vi.fn(() => 0),
    })),
    clearNetworkRequests: vi.fn(),
    getElementByUid: vi.fn(async () => {
      throw new Error('Element not found');
    }),
    connectDevtools: vi.fn(async () => ({
      connectionId: 'mock_conn',
      strategyUsed: 'auto' as const,
      endpoint: 'ws://127.0.0.1:9420',
      miniProgram: {} as MiniProgram,
      currentPage: {} as Page,
      pagePath: '/pages/index/index',
      health: {
        level: 'healthy' as const,
        checks: [],
        checkedAt: new Date().toISOString(),
      },
      status: 'connected' as const,
      timing: { totalMs: 100, connectMs: 80, healthMs: 20 },
      warnings: [],
    })),
    reconnectDevtools: vi.fn(async () => ({
      connectionId: 'mock_reconn',
      strategyUsed: 'auto' as const,
      endpoint: 'ws://127.0.0.1:9420',
      miniProgram: {} as MiniProgram,
      currentPage: {} as Page,
      pagePath: '/pages/index/index',
      health: {
        level: 'healthy' as const,
        checks: [],
        checkedAt: new Date().toISOString(),
      },
      status: 'connected' as const,
      timing: { totalMs: 100, connectMs: 80, healthMs: 20 },
      warnings: [],
    })),
    disconnectDevtools: vi.fn(async () => createDefaultConnectionStatus()),
    getConnectionStatus: vi.fn(async () => createDefaultConnectionStatus()),
    ...overrides,
  };
}

// ─── MiniProgram / Page Mock ─────────────────────────────────────────

/**
 * 创建 mock MiniProgram 对象
 * 包含常用的导航、截图、evaluate 等方法
 */
export function createMockMiniProgram(
  overrides?: Record<string, unknown>,
) {
  return {
    currentPage: vi.fn(async () => createMockPage()),
    navigateTo: vi.fn(async () => undefined),
    navigateBack: vi.fn(async () => undefined),
    redirectTo: vi.fn(async () => undefined),
    reLaunch: vi.fn(async () => undefined),
    switchTab: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => 'base64-data'),
    evaluate: vi.fn(async () => ({})),
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
    ...overrides,
  };
}

/**
 * 创建 mock Page 对象
 * 包含常用的查询、数据、等待等方法
 */
export function createMockPage(overrides?: Record<string, unknown>) {
  return {
    path: 'pages/index/index',
    data: vi.fn(async () => ({})),
    setData: vi.fn(async () => undefined),
    waitFor: vi.fn(async () => undefined),
    $: vi.fn(async () => null),
    $$: vi.fn(async () => []),
    ...overrides,
  };
}
