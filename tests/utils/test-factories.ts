/**
 * 统一 Mock 工厂
 * 提供标准化的 mock 对象创建函数，消除测试文件中重复的 mock 定义
 */

import type { Element, MiniProgram, Page } from 'miniprogram-automator';
import { vi } from 'vitest';

import type {
  ConnectionStatusSnapshot,
  ConnectionConnectResult,
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

// ─── ConnectionConnectResult 默认值 ──────────────────────────────────

/**
 * 创建默认的成功连接结果。
 * miniProgram / currentPage 使用空对象断言（与既有 mock 约定一致，无需经过 unknown），
 * 因为消费方仅读取 pagePath / strategyUsed / status 等标量字段。
 * 通过 overrides 可覆盖任意字段以定制测试场景。
 */
export function createMockConnectResult(
  overrides?: Partial<ConnectionConnectResult>,
): ConnectionConnectResult {
  return {
    connectionId: 'mock_conn',
    strategyUsed: 'auto',
    endpoint: 'ws://127.0.0.1:9420',
    miniProgram: {} as MiniProgram,
    currentPage: {} as Page,
    pagePath: '/pages/index/index',
    health: {
      level: 'healthy',
      checks: [],
      checkedAt: new Date().toISOString(),
    },
    status: 'connected',
    timing: { totalMs: 100, connectMs: 80, healthMs: 20 },
    warnings: [],
    ...overrides,
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
  const context: ToolContext = {
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
      stopRemoteMonitoring: vi.fn(async () => 0),
    })),
    clearNetworkRequests: vi.fn(),
    getElementByUid: vi.fn(async () => {
      throw new Error('Element not found');
    }),
    getElementByTarget: vi.fn(async () => {
      throw new Error('Element not found');
    }),
    getPageRevision: vi.fn(() => 0),
    markPageMutation: vi.fn(),
    syncCurrentPage: vi.fn(async () => {
      if (!context.currentPage) throw new Error('Page not found');
      return context.currentPage;
    }),
    connectDevtools: vi.fn(async () => createMockConnectResult({ connectionId: 'mock_conn' })),
    reconnectDevtools: vi.fn(async () => createMockConnectResult({ connectionId: 'mock_reconn' })),
    disconnectDevtools: vi.fn(async () => createDefaultConnectionStatus()),
    getConnectionStatus: vi.fn(async () => createDefaultConnectionStatus()),
  };
  return Object.assign(context, overrides);
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
export function createMockPage(overrides?: Partial<Page>): Page {
  const page: Page = {
    path: 'pages/index/index',
    data: vi.fn(async () => ({})),
    setData: vi.fn(async () => undefined),
    waitFor: vi.fn(async () => undefined),
    $: vi.fn(async () => null),
    $$: vi.fn(async () => []),
    size: vi.fn(async () => ({ width: 375, height: 667 })),
    scrollTo: vi.fn(async () => undefined),
  };
  return Object.assign(page, overrides);
}

export function createMockElement(overrides?: Partial<Element>): Element {
  const element: Element = {
    tagName: 'view',
    text: vi.fn(async () => ''),
    attribute: vi.fn(async () => null),
    value: vi.fn(async () => ''),
    size: vi.fn(async () => ({ width: 100, height: 40 })),
    offset: vi.fn(async () => ({ left: 0, top: 0 })),
    outerWxml: vi.fn(async () => '<view />'),
    tap: vi.fn(async () => undefined),
    longpress: vi.fn(async () => undefined),
    touchmove: vi.fn(async () => undefined),
    input: vi.fn(async () => undefined),
    trigger: vi.fn(async () => undefined),
    scrollIntoView: vi.fn(async () => undefined),
    boundingClientRect: vi.fn(async () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 40,
      width: 100,
      height: 40,
    })),
    style: vi.fn(async () => ''),
  };
  return Object.assign(element, overrides);
}
